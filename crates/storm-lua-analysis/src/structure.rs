//! Module dependency validation shared by analysis and the build driver.
use crate::diagnostic::{codes, Diagnostic, Severity};
use crate::project::{validate_project, AmbientModuleKey, LuaProject, ModuleAnalysis};
use std::collections::{BTreeMap, HashMap, HashSet};

enum VisitState {
    InProgress,
    Done,
}

/// entry から DFS で辿り、`order`（実行順 = 事前順）を確定しつつ
/// `module-not-found` / `require-cycle` を診断化する（P1b フェーズA: 構造検証のみ）。
#[allow(clippy::too_many_arguments)]
fn dfs_structural(
    key: &str,
    project: &LuaProject,
    modules: &BTreeMap<String, ModuleAnalysis>,
    state: &mut HashMap<String, VisitState>,
    path: &mut Vec<String>,
    order: &mut Vec<String>,
    reachable: &mut HashSet<String>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    state.insert(key.to_string(), VisitState::InProgress);
    path.push(key.to_string());
    order.push(key.to_string());
    reachable.insert(key.to_string());

    // 構文エラー等で validate_project 側の modules に載らなかったモジュールは
    // requires 情報を持たない（syntax-error は validate_project が既に報告済み）。
    if let Some(analysis) = modules.get(key) {
        for site in &analysis.requires {
            if !project.modules.contains_key(&site.key) {
                diagnostics.push(
                    Diagnostic::error(
                        codes::MODULE_NOT_FOUND,
                        format!(
                            "module \"{}\" required from \"{}\" is not present in modules.",
                            site.key, key
                        ),
                    )
                    .with_module(key.to_string())
                    .with_range(site.range),
                );
                continue;
            }
            match state.get(&site.key) {
                Some(VisitState::InProgress) => {
                    let mut cycle_path = path.clone();
                    cycle_path.push(site.key.clone());
                    diagnostics.push(
                        Diagnostic::error(
                            codes::REQUIRE_CYCLE,
                            format!("require cycle detected: {}", cycle_path.join(" -> ")),
                        )
                        .with_module(key.to_string())
                        .with_range(site.range),
                    );
                }
                Some(VisitState::Done) => {}
                None => {
                    // project.modules にはあるが validate_project の modules に無い
                    // = そのモジュール自体が構文エラー。syntax-error 側で既に報告済みなので
                    // これ以上辿らない（requires 情報が無いので辿りようがない）が、
                    // entry からの到達自体は成立しているので reachable には加える
                    // （タスク2: 到達可能モジュールの構文エラーは ok 判定に影響させる）。
                    if modules.contains_key(&site.key) {
                        dfs_structural(
                            &site.key,
                            project,
                            modules,
                            state,
                            path,
                            order,
                            reachable,
                            diagnostics,
                        );
                    } else {
                        reachable.insert(site.key.clone());
                    }
                }
            }
        }
    }

    path.pop();
    state.insert(key.to_string(), VisitState::Done);
}

/// Validated modules, reachability and diagnostics without emitting code.
pub struct StructuralAnalysis {
    /// `validate_project` の診断 + `module-not-found` / `require-cycle`。
    pub diagnostics: Vec<Diagnostic>,
    /// 構文解析に成功した全モジュール（到達可否を問わない。§5.1: 解析は毎回全量）。
    pub modules: BTreeMap<String, ModuleAnalysis>,
    /// entry から到達するモジュールキー（実行順。構文エラーで解析に失敗したモジュールは
    /// 辿りようがないため含まない）。entry が modules に無ければ空。
    pub used_modules: Vec<String>,
    /// entry から到達するモジュールキー全部（`used_modules` に加え、requires 先ではあるが
    /// 構文エラーで解析できなかったモジュールも含む）。`entry` 自身は解析の成否に関わらず
    /// 常に含む。「entry から到達するモジュールの Error のみで ok/失敗を決める」（タスク2）の
    /// 判定に使う集合はこちら。`project.modules`（require グラフの universe）のキーのみを
    /// 対象にする — ambient `kind: module` の合成キー（`"root.member"`）はここでは扱わない
    /// （ambient の到達可否は require グラフとは別の仕組みで tree shaking されるため、
    /// ambient 側の Error は従来どおり常にブロッキング扱いにする。範囲外の変更をしない）。
    pub reachable_modules: HashSet<String>,
    /// `kind: module` の ambient メンバーの解析結果（`validate_project` からそのまま引き継ぐ）。
    pub ambient_modules: BTreeMap<AmbientModuleKey, ModuleAnalysis>,
}

impl StructuralAnalysis {
    pub fn has_error(&self) -> bool {
        self.diagnostics
            .iter()
            .any(|d| d.severity == Severity::Error)
    }

    /// entry から到達するモジュールの Error（または module 無しのプロジェクト全体診断、
    /// あるいは require グラフの外にある診断 = ambient 等）が1件でもあるか。
    /// `ok`/失敗判定はこちらを使う（require グラフ上で到達不能なモジュールの Error のみを
    /// 無視する。タスク2: §7-2）。
    pub fn has_blocking_error(&self, project: &LuaProject) -> bool {
        self.diagnostics
            .iter()
            .any(|d| self.is_blocking(project, d))
    }

    /// 診断1件が「ok/失敗判定をブロックするか」を判定する。severity: error でない診断は
    /// 常に非ブロッキング。`module` が require グラフの universe（`project.modules`）に
    /// 無い診断（module 無し・ambient 等）は常にブロッキング（従来どおり）。
    /// require グラフ上のモジュールなら到達可能な場合のみブロッキング。
    pub fn is_blocking(&self, project: &LuaProject, d: &Diagnostic) -> bool {
        if d.severity != Severity::Error {
            return false;
        }
        match d.module.as_deref() {
            None => true,
            Some(m) => !project.modules.contains_key(m) || self.reachable_modules.contains(m),
        }
    }
}

/// `LuaProject` のパリティ規則（設計 §3/§4）を検証する。`link_project` と `analyze` の
/// 共通土台（診断コードの二重実装を避ける。§5.1 のパリティ保証の実体）。
pub fn analyze_structure(project: &LuaProject) -> StructuralAnalysis {
    let validation = validate_project(project);
    let mut diagnostics = validation.diagnostics;

    let mut order = Vec::new();
    let mut reachable: HashSet<String> = HashSet::new();
    reachable.insert(project.entry.clone());
    if validation.modules.contains_key(&project.entry) {
        let mut state = HashMap::new();
        let mut path = Vec::new();
        dfs_structural(
            &project.entry,
            project,
            &validation.modules,
            &mut state,
            &mut path,
            &mut order,
            &mut reachable,
            &mut diagnostics,
        );
    }

    StructuralAnalysis {
        diagnostics,
        modules: validation.modules,
        used_modules: order,
        reachable_modules: reachable,
        ambient_modules: validation.ambient_modules,
    }
}
