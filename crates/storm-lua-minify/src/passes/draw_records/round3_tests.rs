use super::*;
use mlua::{Function, Lua};

fn trace(code: &str) -> Vec<u8> {
    let lua = Lua::new();
    let finish: Function = lua
        .load(
            r#"
local out={}
screen={drawText=function(...)
 out[#out+1]='['..select('#',...)..']'
 for i=1,select('#',...)do
  local x=select(i,...) local t=type(x)
  out[#out+1]=t
  if t=='number' then
   out[#out+1]=math.type(x)=='integer' and 'i'..string.pack('<i8',x) or 'f'..string.pack('<d',x)
  elseif t=='string' then out[#out+1]=#x..':'..x
  elseif t=='boolean' then out[#out+1]=tostring(x)end
 end
end}
return function()return table.concat(out)end
"#,
        )
        .eval()
        .unwrap();
    // Execute twice to cover helper-local decoder resets, not just initial use.
    for _ in 0..2 {
        lua.load(code)
            .exec()
            .unwrap_or_else(|e| panic!("{e}\n{code}"));
    }
    finish.call::<mlua::String>(()).unwrap().as_bytes().to_vec()
}
fn verify(shape: &Shape, payload: &Payload, values: &[Vec<Atom>]) {
    let mut ast = Ast::new();
    let helper = ast.strings.intern("replay");
    let function = emit_helper(&mut ast, shape, helper, 0);
    let screen = ast.strings.intern("screen");
    let object = name(&mut ast, screen);
    let key = ast.push(Node::Str("\"drawText\"".into()));
    let draw = ast.push(Node::Index(object, key, true));
    let f = name(&mut ast, helper);
    let data = payload.emit(&mut ast);
    let call = ast.push(Node::Call(f, vec![draw, data], None));
    let stmt = ast.push(Node::Callstat(call));
    let root = ast.push(Node::Block(vec![function, stmt, stmt]));
    let after = storm_lua_syntax::print::Printer::new(&ast, false).output(root);
    let mut expected = Ast::new();
    let screen = expected.strings.intern("screen");
    let mut body = Vec::new();
    for args in values.iter().chain(values) {
        let object = name(&mut expected, screen);
        let key = expected.push(Node::Str("\"drawText\"".into()));
        let f = expected.push(Node::Index(object, key, true));
        let args = args.iter().map(|a| a.emit(&mut expected)).collect();
        let c = expected.push(Node::Call(f, args, None));
        body.push(expected.push(Node::Callstat(c)));
    }
    let root = expected.push(Node::Block(body));
    assert_eq!(
        trace(&storm_lua_syntax::print::Printer::new(&expected, false).output(root)),
        trace(&after),
        "{after}"
    );
}
fn numbers(columns: &[Vec<i64>]) -> Vec<Vec<Atom>> {
    (0..columns[0].len())
        .map(|r| {
            columns
                .iter()
                .map(|c| Atom::Num(c[r].to_string().into()))
                .collect()
        })
        .collect()
}
fn shape(codec: Codec, columns: usize) -> Shape {
    Shape {
        targets: vec![0],
        args: vec![(0..columns).map(Arg::Column).collect()],
        columns,
        codec,
        repeats: 1,
        translations: Vec::new(),
    }
}

#[test]
fn grouped_words_replay_complete_groups_and_never_add_padding_calls() {
    let mut exercised = 0;
    for count in [32, 63, 64, 120, 128, 257] {
        for range in [2, 3, 8, 17, 32, 91, 256] {
            let columns = vec![(0..count)
                .map(|i| ((i * 73 + i / 7) % range) as i64 - 51)
                .collect()];
            for (codec, text) in grouped::payloads(&columns, count) {
                let Codec::GroupedBytes { rows, .. } = codec else {
                    unreachable!()
                };
                assert_eq!(count % rows, 0);
                verify(&shape(codec, 1), &Payload::Bytes(text), &numbers(&columns));
                exercised += 1;
            }
        }
    }
    assert!(exercised >= 10);
}
#[test]
fn grouped_model_rejects_overflow_and_nondivisible_tails() {
    assert!(grouped::payloads(&[vec![-1_000_000_001, 1_000_000_001]], 2).is_empty());
    assert!(grouped::payloads(&[vec![0, 1, 0, 1, 0]], 5)
        .iter()
        .all(|(c, _)| matches!(c, Codec::GroupedBytes { rows: 5, .. })));
}
#[test]
fn prefix_records_cover_short_long_boundaries_and_wide_words() {
    for width in [1, 2, 3, 7] {
        for prefixes in [1usize, 35, 90, 91] {
            let capacity = 92i64.pow(width as u32);
            let small = capacity / 92;
            let limit = prefixes as i64 * small + (92 - prefixes as i64) * capacity;
            let values = [
                0,
                prefixes as i64 * small - 1,
                prefixes as i64 * small,
                prefixes as i64 * small + 1,
                limit - 1,
            ];
            let codec = Codec::PrefixBytes {
                biases: vec![-17],
                radices: vec![limit],
                width,
                prefixes,
            };
            let columns = vec![values.into_iter().map(|n| n - 17).collect::<Vec<_>>()];
            let text = shared::fixed_payload(&codec, &columns, values.len()).unwrap();
            verify(&shape(codec, 1), &Payload::Bytes(text), &numbers(&columns));
        }
    }
}
#[test]
fn scalar_palettes_keep_float_bits_nil_strings_booleans_and_argument_count() {
    let palette = [
        Atom::Nil,
        Atom::Bool(false),
        Atom::Bool(true),
        Atom::Num("0.0".into()),
        Atom::Neg(Box::new(Atom::Num("0.0".into()))),
        Atom::Num("1.23456789012345".into()),
        Atom::Str("\"a%\\\\b\"".into()),
    ];
    let values = (0..112)
        .map(|r| {
            vec![
                palette[(r * 17 + r / 3) % palette.len()].clone(),
                Atom::Num("7".into()),
                Atom::Nil,
            ]
        })
        .collect::<Vec<_>>();
    let column = values.iter().map(|r| r[0].clone()).collect::<Vec<_>>();
    let mut base = shape(Codec::Counter, 1);
    base.args = vec![vec![
        Arg::Column(0),
        Arg::Constant(Atom::Num("7".into())),
        Arg::Constant(Atom::Nil),
    ]];
    let proposals = palette::proposals(&base, &[0], &[column], values.len());
    assert!(!proposals.is_empty());
    for (shape, _, payload) in proposals {
        verify(&shape, &payload, &values);
    }
}
#[test]
fn shared_tuple_model_preserves_cross_argument_correlations() {
    let source = (0..4)
        .map(|frame| {
            let calls = (0..40)
                .map(|i| {
                    format!(
                        "screen.drawText({},{},{},{})",
                        i % 31,
                        (i * 13) % 29,
                        if i % 3 == 0 { 16 } else { 2 },
                        if i % 3 == 0 { 1 } else { 8 }
                    )
                })
                .collect::<String>();
            format!("do {calls} end local separator{frame}=1 ")
        })
        .collect::<String>();
    let (mut ast, root) = storm_lua_syntax::parser::parse_source(&source).unwrap();
    assert!(shared::synthesize(&mut ast, root, true) > 0);
    let after = storm_lua_syntax::print::Printer::new(&ast, false).output(root);
    assert_eq!(trace(&source), trace(&after));
}
#[test]
fn shared_tuple_planner_refuses_mutation_and_dynamic_arguments() {
    for source in [
        "screen.drawText=function()end ",
        "local _ENV=_ENV ",
        "::label:: ",
    ] {
        let calls = (0..80)
            .map(|i| format!("screen.drawText({},{},1,2)", i % 32, i % 4))
            .collect::<String>();
        let (mut ast, root) =
            storm_lua_syntax::parser::parse_source(&format!("{source}{calls}")).unwrap();
        let before = storm_lua_syntax::print::Printer::new(&ast, false).output(root);
        assert_eq!(shared::synthesize(&mut ast, root, true), 0);
        assert_eq!(
            before,
            storm_lua_syntax::print::Printer::new(&ast, false).output(root)
        );
    }
    let source = "function onDraw()screen.drawText(input.getNumber(1),2,3,4)end";
    let (mut ast, root) = storm_lua_syntax::parser::parse_source(source).unwrap();
    assert_eq!(shared::synthesize(&mut ast, root, true), 0);
}
