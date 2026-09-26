//! パス実行ループ（TS `compiler.ts` の runPass の移植）。
//!
//! - `PassResult`: パス関数の戻り（root + optional saved / details）
//! - `run_pass`: パス関数を適用し、空 if 不変条件検査 + サイズ計測 + PassRecord 記録 + passTrace
//! - パスは `passes/` に 1 テーマ 1 ファイル。`PassFn` を通してここから駆動する。

use crate::config::PassRecord;
use storm_lua_syntax::ast::{Ast, Node, NodeId};
use storm_lua_syntax::ast_utils::walk;
use storm_lua_syntax::size::measure_size;

/// パス関数の戻り（TS `{ root, saved?, details? }`）。
#[derive(Debug, Clone)]
pub struct PassResult {
    pub root: NodeId,
    pub saved: Option<u64>,
    pub details: Option<Vec<String>>,
}

/// パス関数。`&mut Ast` に対して適用し、新しい root を返す。
pub type PassFn = fn(&mut Ast, NodeId) -> PassResult;

/// passTrace のコールバック（per-pass ダンプハーネス用。無効時は None）。
pub struct TraceEntry {
    pub context: String,
    pub name: String,
    pub before_size: usize,
    pub after_size: usize,
    pub code: String,
}

/// TS `runPass` の移植。
///
/// 1. `fn_` を root へ適用し out を得る（この所要時間を `web_time::Instant` で実測する）
/// 2. 空 if（arms が空）が残っていないか走査して検査する（TS の不変条件）
/// 3. `measure_size` で after を求め、`saved = fn.saved ?? before - after`
/// 4. サイズ変化 or details ありなら PassRecord を記録（`elapsed_ms` に手順1の実測値を格納）
/// 5. trace が設定されていれば TraceEntry を発火
///
/// TS `runPass` の引数境界を保ち、移植中の呼び出し差分を小さくするため、
/// ここではコンテキスト構造体へまとめない。
///
/// ## `elapsed_ms` の意味論（表示専用）
///
/// `run_pass` は探索中の全候補パイプラインで繰り返し呼ばれるため、ここで測る
/// 経過時間は「そのパスがその1回の適用で要した実測 wall-clock 時間」でしかない。
/// 呼び出し元（`search.rs` / `orchestration.rs`）は最終的に採用された
/// （adopted）パイプラインの `PassRecord` 列だけを結果へ残すため、UI に出る
/// `elapsed_ms` は「採用されたパイプラインでそのパスが実際に適用されたときの
/// 所要時間」を意味する。この値は候補順位・tie-break・探索停止判断・出力
/// バイト列のいずれにも使用しない（CLAUDE.md §6）。マルチスレッド実行時は
/// スレッド間の相対比較のみを目的とし、絶対値の再現性は保証しない。
#[allow(clippy::too_many_arguments)]
pub fn run_pass(
    ast: &mut Ast,
    root: NodeId,
    before: usize,
    name: &str,
    fn_: PassFn,
    passes: &mut Vec<PassRecord>,
    trace: Option<&mut dyn FnMut(TraceEntry)>,
    trace_context: &str,
) -> (NodeId, usize) {
    // タイミング計測（表示専用）: `fn_` の実測経過時間のみを PassRecord.elapsed_ms に記録する。
    // 候補順位・tie-break・探索判断・出力バイト列には一切使用しない（CLAUDE.md §6）。
    let started_at = web_time::Instant::now();
    let result = fn_(ast, root);
    let elapsed_ms = started_at.elapsed().as_secs_f64() * 1000.0;
    let out = result.root;
    // 空 if の検査（TS: `q.t === 'if' && (!q.arms || !q.arms.length)` で throw）
    walk(ast, out, &mut |id| {
        if let Node::If(arms, _) = ast.node(id) {
            assert!(!arms.is_empty(), "invalid empty if after {name}");
        }
    });
    let after = measure_size(ast, out);
    let saved = result.saved.unwrap_or(before.saturating_sub(after) as u64);
    if after != before || result.details.is_some() {
        passes.push(PassRecord {
            name: name.to_string(),
            saved: Some(saved as i64),
            detail: result.details.map(|d| format!("{d:?}")),
            elapsed_ms: Some(elapsed_ms),
        });
    }
    if let Some(trace) = trace {
        let code = storm_lua_syntax::print::Printer::new(ast, false).output(out);
        trace(TraceEntry {
            context: trace_context.to_string(),
            name: name.to_string(),
            before_size: before,
            after_size: after,
            code,
        });
    }
    (out, after)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use storm_lua_syntax::parser::parse_source;

    /// 空 if が残るパス関数は panic する（TS の不変条件）。
    #[test]
    fn run_pass_panics_on_empty_if() {
        let (mut ast, root) = parse_source("if false then end").expect("parse ok");
        let before = measure_size(&ast, root);
        // 強制的に空 if を注入するパス
        let bogus: PassFn = |ast, root| {
            let mut targets = vec![];
            walk(ast, root, &mut |id| {
                if let Node::If(_, _) = ast.node(id) {
                    targets.push(id);
                }
            });
            for id in targets {
                let node = ast.node(id).clone();
                if let Node::If(_, eb) = node {
                    ast.nodes[id as usize] = Node::If(vec![], eb);
                }
            }
            PassResult {
                root,
                saved: None,
                details: None,
            }
        };
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            run_pass(
                &mut ast,
                root,
                before,
                "bogus",
                bogus,
                &mut vec![],
                None,
                "test",
            );
        }));
        assert!(result.is_err(), "空 if で panic すべき");
    }

    /// saved が省略された場合、before - after で算出される。
    #[test]
    fn run_pass_saved_defaults_to_before_minus_after() {
        let (mut ast, root) = parse_source("a = (x)").expect("parse ok");
        let before = measure_size(&ast, root);
        let mut passes: Vec<PassRecord> = vec![];
        // saved を返さない pass（括弧を1個外してサイズを縮める）
        let strip_parens: PassFn = |ast, root| {
            let mut targets = vec![];
            walk(ast, root, &mut |id| {
                if let Node::Paren(_) = ast.node(id) {
                    targets.push(id);
                }
            });
            for id in targets {
                let node = ast.node(id).clone();
                if let Node::Paren(e) = node {
                    ast.nodes[id as usize] = ast.node(e).clone();
                }
            }
            PassResult {
                root,
                saved: None,
                details: None,
            }
        };
        let (_out, after) = run_pass(
            &mut ast,
            root,
            before,
            "strip",
            strip_parens,
            &mut passes,
            None,
            "test",
        );
        assert!(after < before);
        assert_eq!(passes.len(), 1);
        assert_eq!(
            passes[0].saved,
            Some((before - after) as i64),
            "saved は before - after にフォールバック"
        );
    }

    /// trace コールバックは適用パスごとに 1 回呼ばれる。
    #[test]
    fn run_pass_fires_trace() {
        let (mut ast, root) = parse_source("a = (x)").expect("parse ok");
        let before = measure_size(&ast, root);
        let noop: PassFn =
            |ast, root| crate::passes::parentheses::remove_redundant_parentheses(ast, root);
        let mut entries: Vec<TraceEntry> = vec![];
        let mut trace = |e: TraceEntry| entries.push(e);
        run_pass(
            &mut ast,
            root,
            before,
            "parens",
            noop,
            &mut vec![],
            Some(&mut trace),
            "outer=1",
        );
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "parens");
        assert_eq!(entries[0].context, "outer=1");
    }
}
