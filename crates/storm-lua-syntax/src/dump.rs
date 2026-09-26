//! Deterministic syntax-tree snapshots for diagnostics and regression tests.

// オラクル①（parser parity）検証用のカノニカル AST ダンプ。
// Migration snapshot の canonical AST dump format を維持する。
// 全ノード種に固定フィールド順を定義し、文字列は共通のエスケープ規則で出力する。
// 位置情報（line/col）は含めない。

use crate::ast::{Ast, Node, NodeId, TableField};

fn esc(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u00{:02x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn join(items: impl Iterator<Item = String>, sep: &str) -> String {
    items.collect::<Vec<_>>().join(sep)
}

fn t(v: bool) -> &'static str {
    if v {
        "true"
    } else {
        "false"
    }
}

/// Produce a deterministic structural snapshot of a valid AST.
pub fn dump(ast: &Ast, root: NodeId) -> String {
    dump_node(ast, root)
}

fn dump_node(ast: &Ast, id: NodeId) -> String {
    let intern = &ast.strings;
    match &ast.nodes[id as usize] {
        Node::Block(ss) => format!(
            "block(ss:[{}])",
            join(ss.iter().map(|s| dump_node(ast, *s)), ",")
        ),
        Node::Break => "break()".to_string(),
        Node::Goto(name) => format!("goto(name:{})", esc(intern.get(*name))),
        Node::Label(name) => format!("label(name:{})", esc(intern.get(*name))),
        Node::Do(b) => format!("do(b:{})", dump_node(ast, *b)),
        Node::While(e, b) => format!("while(e:{},b:{})", dump_node(ast, *e), dump_node(ast, *b)),
        Node::Repeat(b, e) => format!("repeat(b:{},e:{})", dump_node(ast, *b), dump_node(ast, *e)),
        Node::If(arms, eb) => format!(
            "if(arms:[{}],eb:{})",
            join(
                arms.iter().map(|arm| format!(
                    "[{},{}]",
                    dump_node(ast, arm.cond),
                    dump_node(ast, arm.body)
                )),
                ","
            ),
            eb.map_or_else(|| "null".to_string(), |e| dump_node(ast, e))
        ),
        Node::Fornum(name, a, b, c, body) => format!(
            "fornum(name:{},a:{},b:{},c:{},body:{})",
            esc(intern.get(*name)),
            dump_node(ast, *a),
            dump_node(ast, *b),
            c.map_or_else(|| "null".to_string(), |x| dump_node(ast, x)),
            dump_node(ast, *body)
        ),
        Node::Forin(names, es, body) => format!(
            "forin(names:[{}],es:[{}],body:{})",
            join(names.iter().map(|n| esc(intern.get(*n))), ","),
            join(es.iter().map(|e| dump_node(ast, *e)), ","),
            dump_node(ast, *body)
        ),
        Node::Funcstat(target, fn_) => format!(
            "funcstat(target:{},fn:{})",
            dump_node(ast, *target),
            dump_node(ast, *fn_)
        ),
        Node::Localfunc(name, fn_) => format!(
            "localfunc(name:{},fn:{})",
            esc(intern.get(*name)),
            dump_node(ast, *fn_)
        ),
        Node::Local(names, es) => format!(
            "local(names:[{}],es:[{}])",
            join(names.iter().map(|n| esc(intern.get(*n))), ","),
            join(es.iter().map(|e| dump_node(ast, *e)), ",")
        ),
        Node::Return(es) => format!(
            "return(es:[{}])",
            join(es.iter().map(|e| dump_node(ast, *e)), ",")
        ),
        Node::Callstat(e) => format!("callstat(e:{})", dump_node(ast, *e)),
        Node::Assign(vs, es) => format!(
            "assign(vs:[{}],es:[{}])",
            join(vs.iter().map(|v| dump_node(ast, *v)), ","),
            join(es.iter().map(|e| dump_node(ast, *e)), ",")
        ),
        Node::Nil => "nil()".to_string(),
        Node::Bool(v) => format!("bool(v:{})", t(*v)),
        Node::Vararg => "vararg()".to_string(),
        Node::Num(v) => format!("num(v:{})", esc(v)),
        Node::Str(v) => format!("str(v:{})", esc(v)),
        Node::Function(ps, variadic, b) => format!(
            "function(ps:[{}],var:{},b:{})",
            join(ps.iter().map(|p| esc(intern.get(*p))), ","),
            t(*variadic),
            dump_node(ast, *b)
        ),
        Node::Table(fs) => format!(
            "table(fs:[{}])",
            join(
                fs.iter().map(|f| match f {
                    TableField::Arr(v) => format!("[arr,null,{}]", dump_node(ast, *v)),
                    TableField::Name(k, v) =>
                        format!("[name,{},{}]", esc(intern.get(*k)), dump_node(ast, *v)),
                    TableField::KVar(k, v) =>
                        format!("[kv,{},{}]", dump_node(ast, *k), dump_node(ast, *v)),
                }),
                ","
            )
        ),
        Node::Un(op, e) => format!("un(op:{},e:{})", esc(op), dump_node(ast, *e)),
        Node::Bin(op, l, r) => format!(
            "bin(op:{},l:{},r:{})",
            esc(op),
            dump_node(ast, *l),
            dump_node(ast, *r)
        ),
        Node::Paren(e) => format!("paren(e:{})", dump_node(ast, *e)),
        Node::Call(fn_, args, method) => format!(
            "call(fn:{},args:[{}],method:{})",
            dump_node(ast, *fn_),
            join(args.iter().map(|a| dump_node(ast, *a)), ","),
            method.as_deref().map_or_else(|| "null".to_string(), esc)
        ),
        Node::Name(v) => format!("name(v:{})", esc(intern.get(*v))),
        Node::Index(obj, key, dot) => format!(
            "index(obj:{},key:{},dot:{})",
            dump_node(ast, *obj),
            dump_node(ast, *key),
            t(*dot)
        ),
        Node::Methodname(obj, name) => format!(
            "methodname(obj:{},name:{})",
            dump_node(ast, *obj),
            esc(intern.get(*name))
        ),
    }
}
