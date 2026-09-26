#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use crate::link::link_project;
    use std::collections::BTreeMap;
    use storm_lua_analysis::analyze::{analyze, AnalyzeOptions};
    use storm_lua_analysis::diagnostic::Severity;
    use storm_lua_analysis::diagnostic::{codes, Diagnostic};
    use storm_lua_analysis::project::LuaProject;

    fn project(entry: &str, modules: &[(&str, &str)]) -> LuaProject {
        LuaProject {
            entry: entry.to_string(),
            modules: modules
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            ambient: BTreeMap::new(),
        }
    }

    fn codes_of(diagnostics: &[Diagnostic]) -> Vec<&'static str> {
        diagnostics.iter().map(|d| d.code).collect()
    }

    // --- 構文エラーで throw しない / ok:false にしない ---

    #[test]
    fn syntax_error_is_reported_as_diagnostic_not_failure() {
        let p = project("main", &[("main", "local a = (")]);
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(result.ok);
        assert_eq!(codes_of(&result.diagnostics), vec![codes::SYNTAX_ERROR]);
    }

    #[test]
    fn other_modules_are_still_analyzed_after_a_syntax_error() {
        let p = project(
            "main",
            &[("main", "local a = ("), ("ok", "local unused = 1\n")],
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.code == codes::SYNTAX_ERROR && d.module.as_deref() == Some("main")));
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.code == codes::UNUSED_LOCAL && d.module.as_deref() == Some("ok")));
    }

    // --- パリティ確認: analyze の error 診断集合 == link_project の診断集合 ---

    fn assert_error_parity(p: &LuaProject) {
        let analyzed = analyze(p, &AnalyzeOptions::default());
        let linked = link_project(p);
        let mut analyzed_errors: Vec<&str> = analyzed
            .diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .map(|d| d.code)
            .collect();
        let mut linked_errors: Vec<&str> = linked.diagnostics.iter().map(|d| d.code).collect();
        analyzed_errors.sort_unstable();
        linked_errors.sort_unstable();
        assert_eq!(analyzed_errors, linked_errors);
    }

    #[test]
    fn parity_holds_for_valid_project() {
        assert_error_parity(&project(
            "main",
            &[
                ("main", "local util = require(\"util\")\nutil.f()\n"),
                ("util", "local M = {}\nfunction M.f() end\nreturn M\n"),
            ],
        ));
    }

    #[test]
    fn parity_holds_for_entry_not_found() {
        assert_error_parity(&project("main", &[("other", "return 1")]));
    }

    #[test]
    fn parity_holds_for_invalid_module_key() {
        assert_error_parity(&project(
            "main",
            &[("main", "return 1"), ("bad-key", "return 2")],
        ));
    }

    #[test]
    fn parity_holds_for_module_not_found() {
        assert_error_parity(&project(
            "main",
            &[("main", "local x = require(\"missing\")\n")],
        ));
    }

    #[test]
    fn parity_holds_for_require_cycle() {
        assert_error_parity(&project(
            "main",
            &[
                ("main", "local a = require(\"a\")\n"),
                ("a", "local b = require(\"b\")\nreturn 1\n"),
                ("b", "local a2 = require(\"a\")\nreturn 2\n"),
            ],
        ));
    }

    #[test]
    fn parity_holds_for_require_restriction_violations() {
        assert_error_parity(&project(
            "main",
            &[("main", "if true then\n  require(\"x\")\nend\n")],
        ));
    }

    // --- P3: ambient 参照規則(§4.1)・注入(§4.2)の analyze / link_project パリティ ---

    fn ambient_project(
        entry: &str,
        modules: &[(&str, &str)],
        root: &str,
        members: &[(&str, storm_lua_analysis::project::AmbientMember)],
    ) -> LuaProject {
        let mut p = project(entry, modules);
        let namespace = storm_lua_analysis::project::AmbientNamespace {
            members: members
                .iter()
                .map(|(k, v)| (k.to_string(), v.clone()))
                .collect(),
        };
        p.ambient.insert(root.to_string(), namespace);
        p
    }

    fn module_member(source: &str) -> storm_lua_analysis::project::AmbientMember {
        storm_lua_analysis::project::AmbientMember::Module {
            source: source.to_string(),
        }
    }

    fn sim_members() -> Vec<(&'static str, storm_lua_analysis::project::AmbientMember)> {
        vec![
            (
                "clamp",
                module_member("return function(x, lo, hi) return x end"),
            ),
            (
                "setProperty",
                storm_lua_analysis::project::AmbientMember::EnvironmentOnly,
            ),
        ]
    }

    #[test]
    fn valid_ambient_usage_has_no_diagnostics_and_link_parity_holds() {
        let p = ambient_project(
            "main",
            &[("main", "local clamp = sim.clamp\nreturn clamp(1, 0, 1)\n")],
            "sim",
            &sim_members(),
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(
            result.diagnostics.is_empty(),
            "{:?}",
            codes_of(&result.diagnostics)
        );
        assert_error_parity(&p);
    }

    #[test]
    fn parity_holds_for_unknown_ambient_member() {
        assert_error_parity(&ambient_project(
            "main",
            &[("main", "local x = sim.typo\nreturn x\n")],
            "sim",
            &sim_members(),
        ));
    }

    #[test]
    fn parity_holds_for_environment_only_api() {
        assert_error_parity(&ambient_project(
            "main",
            &[("main", "sim.setProperty(\"x\", 1)\n")],
            "sim",
            &sim_members(),
        ));
    }

    #[test]
    fn parity_holds_for_ambient_root_escapes() {
        assert_error_parity(&ambient_project(
            "main",
            &[("main", "local s = sim\nreturn s\n")],
            "sim",
            &sim_members(),
        ));
    }

    #[test]
    fn parity_holds_for_ambient_dynamic_access() {
        assert_error_parity(&ambient_project(
            "main",
            &[("main", "local k = \"clamp\"\nreturn sim[k]\n")],
            "sim",
            &sim_members(),
        ));
    }

    #[test]
    fn parity_holds_for_ambient_assigned() {
        assert_error_parity(&ambient_project(
            "main",
            &[("main", "sim.clamp = 1\n")],
            "sim",
            &sim_members(),
        ));
    }

    #[test]
    fn parity_holds_for_require_in_ambient() {
        assert_error_parity(&ambient_project(
            "main",
            &[("main", "return sim.clamp\n")],
            "sim",
            &[(
                "clamp",
                module_member("local x = require(\"nope\")\nreturn 1"),
            )],
        ));
    }

    #[test]
    fn parity_holds_for_reserved_ambient_root_module_key() {
        assert_error_parity(&ambient_project(
            "main",
            &[("main", "return 1\n"), ("sim.helper", "return 1\n")],
            "sim",
            &sim_members(),
        ));
    }

    // --- --@storm ignore(<code>) 抑制 ---

    #[test]
    fn ignore_suppresses_matching_code_on_the_same_line() {
        let p = project(
            "main",
            &[(
                "main",
                "function onTick()\n  local x = foo  --@storm ignore(undefined-global)\nend\n",
            )],
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|d| d.code == codes::UNDEFINED_GLOBAL),
            "{:?}",
            codes_of(&result.diagnostics)
        );
    }

    #[test]
    fn ignore_does_not_suppress_a_different_line() {
        let p = project(
            "main",
            &[(
                "main",
                "--@storm ignore(undefined-global)\nfunction onTick()\n  local x = foo\nend\n",
            )],
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.code == codes::UNDEFINED_GLOBAL));
    }

    #[test]
    fn ignore_does_not_suppress_a_different_code() {
        let p = project(
            "main",
            &[(
                "main",
                "function onTick()\n  local x = foo  --@storm ignore(unused-local)\nend\n",
            )],
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.code == codes::UNDEFINED_GLOBAL));
    }

    #[test]
    fn ignore_cannot_suppress_a_severity_error_diagnostic() {
        let p = project(
            "main",
            &[(
                "main",
                "local x = require(missing)  --@storm ignore(require-dynamic)\n",
            )],
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.code == codes::REQUIRE_DYNAMIC));
    }

    #[test]
    fn unknown_storm_directive_is_reported_as_error() {
        let p = project("main", &[("main", "local a = 1  --@storm bogus\n")]);
        let result = analyze(&p, &AnalyzeOptions::default());
        let diag = result
            .diagnostics
            .iter()
            .find(|d| d.code == codes::UNKNOWN_STORM_DIRECTIVE)
            .expect("unknown-storm-directive diagnostic");
        assert_eq!(diag.severity, Severity::Error);
    }

    #[test]
    fn unknown_storm_directive_covers_malformed_ignore_argument() {
        let p = project("main", &[("main", "local a = 1  --@storm ignore()\n")]);
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.code == codes::UNKNOWN_STORM_DIRECTIVE));
    }

    // --- disabledRules オプション ---

    #[test]
    fn disabled_rules_suppresses_matching_warning_code() {
        let p = project("main", &[("main", "local a = 1\n")]);
        let options = AnalyzeOptions {
            target: Default::default(),
            disabled_rules: vec![codes::UNUSED_LOCAL.to_string()],
        };
        let result = analyze(&p, &options);
        assert!(result
            .diagnostics
            .iter()
            .all(|d| d.code != codes::UNUSED_LOCAL));
    }

    #[test]
    fn disabled_rules_cannot_suppress_error_severity() {
        let p = project("main", &[("other", "return 1")]);
        let options = AnalyzeOptions {
            target: Default::default(),
            disabled_rules: vec![codes::ENTRY_NOT_FOUND.to_string()],
        };
        let result = analyze(&p, &options);
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.code == codes::ENTRY_NOT_FOUND));
    }

    // --- Stormworks 固有制限検出 (v0.6.0): analyze() は warning + ok:true ---

    #[test]
    fn analyze_reports_sw_unavailable_global_as_warning_and_stays_ok() {
        let p = project(
            "main",
            &[("main", "function onTick()\n  pcall(function() end)\nend\n")],
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(result.ok);
        let diag = result
            .diagnostics
            .iter()
            .find(|d| d.code == codes::SW_UNAVAILABLE_GLOBAL)
            .expect("sw-unavailable-global diagnostic");
        assert_eq!(diag.severity, Severity::Warning);
    }

    #[test]
    fn analyze_reports_input_outside_ontick_as_warning() {
        let p = project(
            "main",
            &[("main", "local x = input.getNumber(1)\nreturn x\n")],
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(result.ok);
        let diag = result
            .diagnostics
            .iter()
            .find(|d| d.code == codes::INPUT_OUTSIDE_ONTICK)
            .expect("input-outside-ontick diagnostic");
        assert_eq!(diag.severity, Severity::Warning);
    }

    #[test]
    fn analyze_does_not_flag_input_output_used_only_inside_ontick() {
        let p = project(
            "main",
            &[(
                "main",
                "function onTick()\n  local x = input.getNumber(1)\n  output.setNumber(1, x)\nend\n",
            )],
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(
            result.diagnostics.is_empty(),
            "{:?}",
            codes_of(&result.diagnostics)
        );
    }

    #[test]
    fn ignore_suppresses_sw_unavailable_global_warning() {
        let p = project(
            "main",
            &[(
                "main",
                "function onTick()\n  pcall(function() end)  --@storm ignore(sw-unavailable-global)\nend\n",
            )],
        );
        let result = analyze(&p, &AnalyzeOptions::default());
        assert!(!result
            .diagnostics
            .iter()
            .any(|d| d.code == codes::SW_UNAVAILABLE_GLOBAL));
    }
}
