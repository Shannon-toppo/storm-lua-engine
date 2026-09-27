//! Source Map v3 生成（設計 §6.1 / ロードマップ P4）。
//!
//! `link_project`（`link.rs`）が返す `LinkedRange` 区間表を正本にし、`rust-sourcemap`
//! （crates.io 名 `sourcemap`）で JSON へエンコードする。行単位マッピング（列は常に0）・
//! `sources` は `/` 区切り + `.lua` のパス形式・`sourcesContent` は常に埋め込む（設計 §6.1）。
//! `link.linked_source` が `None`（リンク失敗）の場合は生成しない。

use std::collections::BTreeMap;

use sourcemap::SourceMapBuilder;

use crate::link::{lookup_source_line, LinkResult};
use storm_lua_analysis::project::{AmbientMember, LuaProject};

/// モジュールキーを `/` 区切り + `.lua` のパス形式へ変換する（設計 §6.1）。
/// `key = segment ("." segment)*`（§2.1）という文法により変換は常に可逆。
/// ambient 合成キー（`"root.member"` 形式。`link.rs` の `Expander::ambient_sources` 参照）も
/// 同じ `.` 区切りの文字列であり、モジュールキーと文法上区別が無いため同じ規則を適用する。
pub fn module_key_to_path(key: &str) -> String {
    format!("{}.lua", key.replace('.', "/"))
}

/// ambient 合成キー `"root.member"` の元ソーステキストを取得する
/// （`kind: environmentOnly` はエクスポート対象コードから参照されたら `environment-only-api`
/// エラーになりリンク自体が失敗するため、`link_project` が成功した結果にはここへ来ない）。
fn ambient_source<'a>(project: &'a LuaProject, key: &str) -> Option<&'a str> {
    let (root, member) = key.split_once('.')?;
    let namespace = project.ambient.get(root)?;
    match namespace.members.get(member)? {
        AmbientMember::Module { source } => Some(source.as_str()),
        AmbientMember::EnvironmentOnly => None,
    }
}

/// `LinkedRange::module` に現れるキー（通常モジュール or ambient 合成キー）の元ソース全文を取得する。
/// Generated declarations are not assigned an origin. Ambient member bodies
/// resolve here exactly like ordinary module bodies.
fn source_text<'a>(project: &'a LuaProject, key: &str) -> Option<&'a str> {
    project
        .modules
        .get(key)
        .map(String::as_str)
        .or_else(|| ambient_source(project, key))
}

/// リンク結果から Source Map v3 (JSON 文字列) を生成する（設計 §6.1）。
///
/// - 行単位マッピング: `linked_source` の各出力行を `lookup_source_line` で逆引きし、
///   (出力行, col=0) → (元モジュールの `sources` インデックス, 元行, col=0) を記録する。
/// - 原文の由来を持たない合成行はsourceなしのsegmentを出し、直前の位置を継承させない。
/// - `names` は v1 では出さない（設計 §6.1）。
/// - `link.linked_source` が `None`（リンク失敗）なら `None` を返す。
#[expect(
    clippy::expect_used,
    reason = "The source-map serializer writes JSON to an in-memory byte vector; valid generated mappings have no failing I/O or invalid UTF-8 path"
)]
pub fn generate_source_map(project: &LuaProject, link: &LinkResult) -> Option<String> {
    let linked_source = link.linked_source.as_deref()?;

    let mut builder = SourceMapBuilder::new(None);
    let mut source_ids: BTreeMap<&str, u32> = BTreeMap::new();

    let total_lines = linked_source.lines().count() as u32;
    for output_line in 1..=total_lines {
        let origin = lookup_source_line(&link.ranges, output_line).and_then(|(module, line)| {
            source_text(project, module).map(|text| (module, line, text))
        });
        let Some((module, source_line, text)) = origin else {
            // A generated-only segment prevents greatest-lower-bound consumers
            // from attributing glue (or a blank line) to the previous source.
            builder.add_raw(output_line - 1, 0, 0, 0, None, None, false);
            continue;
        };
        let src_id = *source_ids.entry(module).or_insert_with(|| {
            let id = builder.add_source(&module_key_to_path(module));
            builder.set_source_contents(id, Some(text));
            id
        });
        builder.add_raw(
            output_line - 1,
            0,
            source_line - 1,
            0,
            Some(src_id),
            None,
            false,
        );
    }

    let source_map = builder.into_sourcemap();
    let mut buf = Vec::new();
    source_map
        .to_writer(&mut buf)
        .expect("in-memory Vec<u8> writer never fails");
    Some(String::from_utf8(buf).expect("sourcemap crate always emits valid UTF-8 JSON"))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::link::link_project;
    use std::collections::BTreeMap as Map;
    use storm_lua_analysis::project::AmbientNamespace;

    fn project(entry: &str, modules: &[(&str, &str)]) -> LuaProject {
        LuaProject {
            entry: entry.to_string(),
            modules: modules
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            ambient: Map::new(),
        }
    }

    #[test]
    fn returns_none_when_link_fails() {
        let p = project("main", &[("main", "local x = require(\"missing\")\n")]);
        let link = link_project(&p);
        assert!(link.linked_source.is_none());
        assert_eq!(generate_source_map(&p, &link), None);
    }

    #[test]
    fn generates_v3_shape_with_sources_and_contents() {
        let p = project(
            "main",
            &[
                (
                    "main",
                    "local util = require(\"lib.util\")\nreturn util.x\n",
                ),
                ("lib.util", "local x = 1\nreturn { x = x }\n"),
            ],
        );
        let link = link_project(&p);
        assert!(link.diagnostics.is_empty(), "{:?}", link.diagnostics);
        let map_json = generate_source_map(&p, &link).expect("source map");

        let value: serde_json::Value = serde_json::from_str(&map_json).expect("valid JSON");
        assert_eq!(value["version"], 3);
        let sources = value["sources"].as_array().expect("sources array");
        let source_strs: Vec<&str> = sources.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(source_strs.contains(&"main.lua"));
        assert!(source_strs.contains(&"lib/util.lua"));

        let contents = value["sourcesContent"]
            .as_array()
            .expect("sourcesContent array");
        assert_eq!(contents.len(), sources.len());
        // main.lua の位置に project.modules["main"] の全文がそのまま入っている。
        let main_idx = source_strs.iter().position(|&s| s == "main.lua").unwrap();
        assert_eq!(
            contents[main_idx].as_str().unwrap(),
            p.modules["main"].as_str()
        );
        let util_idx = source_strs
            .iter()
            .position(|&s| s == "lib/util.lua")
            .unwrap();
        assert_eq!(
            contents[util_idx].as_str().unwrap(),
            p.modules["lib.util"].as_str()
        );

        let mappings = value["mappings"].as_str().expect("mappings string");
        assert!(!mappings.is_empty());
    }

    #[test]
    fn generates_map_with_ambient_source_included() {
        let mut p = project(
            "main",
            &[("main", "local clamp = sim.clamp\nreturn clamp(5)\n")],
        );
        let namespace = AmbientNamespace {
            members: Map::from([(
                "clamp".to_string(),
                AmbientMember::Module {
                    source: "return function(x) return x end\n".to_string(),
                },
            )]),
        };
        p.ambient.insert("sim".to_string(), namespace);

        let link = link_project(&p);
        assert!(link.diagnostics.is_empty(), "{:?}", link.diagnostics);
        let map_json = generate_source_map(&p, &link).expect("source map");
        let value: serde_json::Value = serde_json::from_str(&map_json).expect("valid JSON");
        let sources = value["sources"].as_array().expect("sources array");
        let source_strs: Vec<&str> = sources.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(source_strs.contains(&"sim/clamp.lua"));
        let contents = value["sourcesContent"]
            .as_array()
            .expect("sourcesContent array");
        let idx = source_strs
            .iter()
            .position(|&s| s == "sim/clamp.lua")
            .unwrap();
        assert_eq!(
            contents[idx].as_str().unwrap(),
            "return function(x) return x end\n"
        );
    }

    #[test]
    fn output_line_to_source_line_matches_lookup_source_line() {
        // trace-mapping 相当の逆引きを Rust 側でも検証する（外部ライブラリ検証テストと対の内部確認）。
        let p = project(
            "main",
            &[
                ("main", "local util = require(\"util\")\nlocal y = util.x\n"),
                ("util", "local z = 1\nreturn z\n"),
            ],
        );
        let link = link_project(&p);
        assert!(link.diagnostics.is_empty(), "{:?}", link.diagnostics);
        let map_json = generate_source_map(&p, &link).expect("source map");
        let decoded = sourcemap::SourceMap::from_slice(map_json.as_bytes())
            .expect("decode generated source map");

        let src = link.linked_source.as_deref().unwrap();
        for (i, _line) in src.lines().enumerate() {
            let output_line = i as u32; // sourcemap クレートは0-based行
            let expected = lookup_source_line(&link.ranges, output_line + 1);
            let token = decoded.lookup_token(output_line, 0);
            match expected {
                Some((module, source_line)) => {
                    let token = token
                        .unwrap_or_else(|| panic!("expected mapping at output line {output_line}"));
                    assert_eq!(
                        token.get_source(),
                        Some(module_key_to_path(module).as_str())
                    );
                    assert_eq!(token.get_src_line() + 1, source_line);
                }
                None => {
                    let token = token.expect("generated lines have an explicit unmapped segment");
                    assert_eq!(token.get_dst_line(), output_line);
                    assert_eq!(token.get_source(), None);
                }
            }
        }
    }
    #[test]
    fn generated_glue_never_points_past_source_and_does_not_inherit_an_origin() {
        for module in [
            "value=7",
            "return {value=7}",
            "if flag then return 7 end\nreturn 8",
            "",
        ] {
            let p = project(
                "main",
                &[
                    (
                        "main",
                        "local m=require(\"lib\")\nfunction onTick()output.setNumber(1,7)end",
                    ),
                    ("lib", module),
                ],
            );
            let link = link_project(&p);
            let generated = link.linked_source.as_ref().unwrap();
            let map = sourcemap::SourceMap::from_slice(
                generate_source_map(&p, &link).unwrap().as_bytes(),
            )
            .unwrap();
            for token in map.tokens() {
                if let Some(file) = token.get_source() {
                    let source = if file == "lib.lua" {
                        module
                    } else {
                        &p.modules["main"]
                    };
                    assert!(
                        token.get_src_line() < source.split('\n').count() as u32,
                        "{module:?}: {file} maps beyond its source"
                    );
                }
            }
            for (line, text) in generated.lines().enumerate() {
                if text == "do"
                    || text.starts_with("if __stormmin_link_")
                    || text.starts_with("local __stormmin_link_")
                {
                    let token = map.lookup_token(line as u32, 0).unwrap();
                    assert_eq!(
                        token.get_source(),
                        None,
                        "generated-only line was assigned a source: {text}"
                    );
                }
            }
        }
    }

    #[test]
    fn multiline_return_body_has_exact_original_line_not_generated_prefix_line() {
        let source = "return function(x)\n  return x+1\nend";
        let p = project(
            "main",
            &[
                (
                    "main",
                    "local f=require(\"lib\")\nfunction onTick()output.setNumber(1,f(6))end",
                ),
                ("lib", source),
            ],
        );
        let link = link_project(&p);
        let code = link.linked_source.as_ref().unwrap();
        let map =
            sourcemap::SourceMap::from_slice(generate_source_map(&p, &link).unwrap().as_bytes())
                .unwrap();
        let generated = code
            .lines()
            .position(|line| line == "  return x+1")
            .unwrap();
        let token = map.lookup_token(generated as u32, 0).unwrap();
        assert_eq!(token.get_source(), Some("lib.lua"));
        assert_eq!(token.get_src_line(), 1);
    }
}
