//! `analyze` API（設計 §5）: パリティ規則 + リント Tier A + `--@storm` 抑制アノテーション。
//!
//! パイプライン(§1)の「解析のみ」区間に相当する。`link_project` と同じ
//! `analyze_structure`（§3/§4 のパリティ規則）を土台にするため、error 診断集合は
//! `link_project` と常に一致する（§5.1 の設計意図そのもの）。

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::diagnostic::{codes, Diagnostic, Range, Severity};
use crate::lint::{collect_written_global_names, lint_module};
use crate::project::LuaProject;
use crate::structure::analyze_structure;
use crate::sw_restrict;
use storm_lua_syntax::lexer::Lexer;

/// `analyze` のオプション（設計 §5.1）。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeOptions {
    /// Language/API assumptions used by diagnostics; currently vehicle only.
    #[serde(default)]
    pub target: crate::CompilerTarget,
    /// 診断コードの抑制リスト。severity: error のコードは抑制できない（§7.2 と同じ制約）。
    #[serde(default)]
    pub disabled_rules: Vec<String>,
}

/// `analyze` の結果（設計 §5.1）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResult {
    /// false は内部エラーのみ。構文エラーは diagnostics 側で返る（v1 では常に true）。
    pub ok: bool,
    /// Diagnostics collected while processing the input.
    pub diagnostics: Vec<Diagnostic>,
}

/// `--@storm` 行コメント1件を解釈した結果。
enum StormDirective {
    /// `ignore(<code>)`。同一行の該当 code の診断を抑制する。
    Ignore(String),
}

/// `--@storm` プレフィックス以降のテキストを解釈する。未知の指示・引数はサイレント無視せず
/// `Err` として返し、呼び出し側が `unknown-storm-directive` 診断へ変換する（§7.2）。
fn parse_storm_directive(text: &str) -> Result<StormDirective, ()> {
    let rest = text.strip_prefix("--@storm").ok_or(())?.trim();
    let inner = rest
        .strip_prefix("ignore(")
        .and_then(|s| s.strip_suffix(')'));
    let Some(code) = inner else {
        return Err(());
    };
    let code = code.trim();
    if code.is_empty() || !code.chars().all(|c| c == '-' || c.is_ascii_alphanumeric()) {
        return Err(());
    }
    Ok(StormDirective::Ignore(code.to_string()))
}

/// 行ごとの抑制対象 code 集合。キーは `(module, line)`。
type IgnoreTargets = HashMap<(String, u32), HashSet<String>>;

/// `project.modules` の `--@storm` コメントを走査し、行ごとの抑制対象 code 集合と、
/// 未知指示の `unknown-storm-directive` 診断を求める。
/// 構文エラーで `analyze_structure` の modules に載らなかったモジュールは、
/// 以降の解析をスキップする方針（§5.1）に合わせてここでも対象外にする。
fn scan_storm_directives(
    modules: &BTreeMap<String, String>,
    parsed_module_keys: &HashSet<&str>,
) -> (IgnoreTargets, Vec<Diagnostic>) {
    let mut ignore_targets: HashMap<(String, u32), HashSet<String>> = HashMap::new();
    let mut directive_diagnostics = Vec::new();

    for (key, source) in modules {
        if !parsed_module_keys.contains(key.as_str()) {
            continue;
        }
        let mut lexer = Lexer::new(source).with_storm_comment_capture();
        if lexer.all().is_err() {
            // 構文エラーなら analyze_structure 側の syntax-error で既に報告済み
            // （parsed_module_keys に含まれないため通常ここには来ない）。
            continue;
        }
        for comment in lexer.storm_comments() {
            match parse_storm_directive(&comment.text) {
                Ok(StormDirective::Ignore(code)) => {
                    ignore_targets
                        .entry((key.clone(), comment.line))
                        .or_default()
                        .insert(code);
                }
                Err(()) => {
                    directive_diagnostics.push(
                        Diagnostic::error(
                            codes::UNKNOWN_STORM_DIRECTIVE,
                            format!("unrecognized \"--@storm\" directive: \"{}\".", comment.text),
                        )
                        .with_module(key.clone())
                        .with_range(Some(Range::point(comment.line, comment.col))),
                    );
                }
            }
        }
    }

    (ignore_targets, directive_diagnostics)
}

/// `--@storm ignore(<code>)` による抑制を適用する。severity: error は抑制不可（§7.2）。
fn apply_ignore_annotations(
    diagnostics: Vec<Diagnostic>,
    ignore_targets: &IgnoreTargets,
) -> Vec<Diagnostic> {
    diagnostics
        .into_iter()
        .filter(|d| {
            if d.severity == Severity::Error {
                return true;
            }
            let Some(module) = &d.module else {
                return true;
            };
            let Some(range) = &d.range else {
                return true;
            };
            !matches!(
                ignore_targets.get(&(module.clone(), range.line)),
                Some(codes) if codes.contains(d.code)
            )
        })
        .collect()
}

/// `AnalyzeOptions::disabled_rules` による抑制を適用する。severity: error は抑制不可（§5.1）。
fn apply_disabled_rules(
    diagnostics: Vec<Diagnostic>,
    disabled_rules: &[String],
) -> Vec<Diagnostic> {
    if disabled_rules.is_empty() {
        return diagnostics;
    }
    diagnostics
        .into_iter()
        .filter(|d| d.severity == Severity::Error || !disabled_rules.iter().any(|r| r == d.code))
        .collect()
}

/// `LuaProject` を解析する（設計 §5）。構文エラーで throw しない/`ok:false` にしない
/// （編集中呼び出しが前提。§5.1）。パリティ規則（§3/§4）は `link_project` と同じ診断を返す。
pub fn analyze(project: &LuaProject, options: &AnalyzeOptions) -> AnalyzeResult {
    let structural = analyze_structure(project);
    let mut diagnostics = structural.diagnostics;

    let written_globals = collect_written_global_names(structural.modules.values());
    let ambient_roots: HashSet<String> = project.ambient.keys().cloned().collect();
    for (key, analysis) in &structural.modules {
        diagnostics.extend(lint_module(key, analysis, &written_globals, &ambient_roots));
        diagnostics.extend(sw_restrict::scan_module(
            key,
            analysis,
            &written_globals,
            Severity::Warning,
        ));
    }

    let parsed_module_keys: HashSet<&str> = structural.modules.keys().map(String::as_str).collect();
    let (ignore_targets, directive_diagnostics) =
        scan_storm_directives(&project.modules, &parsed_module_keys);
    diagnostics = apply_ignore_annotations(diagnostics, &ignore_targets);
    diagnostics.extend(directive_diagnostics);

    diagnostics = apply_disabled_rules(diagnostics, &options.disabled_rules);

    AnalyzeResult {
        ok: true,
        diagnostics,
    }
}
