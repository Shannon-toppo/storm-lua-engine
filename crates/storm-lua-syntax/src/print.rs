//! Compact and readable Lua source emission.

// Canonical compact/pretty printer。最終TS版の出力は frozen migration regression として保持。
// 2 系統（compact / pretty）は zeroCostNewlines フラグで切り替える。

use std::borrow::Cow;

use crate::ast::{Ast, Node, NodeId, TableField};
use crate::lexer::KEYWORDS;
use crate::numeric::{
    decode_lua_string, integer_literal_value, normalize_num_literal, qstr, qstr_bracket_key,
};

/// 演算子の結合優先度 [lhs_assoc_prec, rhs_assoc_prec]（lexer.ts の BIN_PREC 相当）。
pub(crate) fn bin_prec(op: &str) -> (u8, u8) {
    match op {
        "or" => (1, 2),
        "and" => (2, 3),
        "<" | ">" | "<=" | ">=" | "~=" | "==" => (3, 4),
        "|" => (4, 5),
        "~" => (5, 6),
        "&" => (6, 7),
        "<<" | ">>" => (7, 8),
        ".." => (9, 8),
        "+" | "-" => (10, 11),
        "*" | "/" | "//" | "%" => (11, 12),
        "^" => (14, 13),
        _ => (0, 0),
    }
}

/// Return the shortest prefix of an assignment/local initializer list that
/// preserves Lua's value-adjustment semantics when the removed suffix consists
/// only of literal `nil` expressions. Missing RHS values are initialized to nil,
/// but making a call/vararg the final expression can expose additional results.
/// Keep one trailing nil in that case when there are still unfilled targets.
pub(crate) fn trimmed_nil_rhs_len(
    ast: &Ast,
    target_count: usize,
    values: &[NodeId],
    allow_empty: bool,
) -> usize {
    let mut len = values.len();
    while len > 0 && matches!(ast.node(values[len - 1]), Node::Nil) {
        len -= 1;
    }
    if len == values.len() {
        return len;
    }
    if len == 0 {
        return if allow_empty { 0 } else { 1 };
    }
    if target_count > len && matches!(ast.node(values[len - 1]), Node::Call(..) | Node::Vararg) {
        len += 1;
    }
    len
}

fn needs_sep(a: &str, b: &str) -> bool {
    let (Some(x), Some(y)) = (a.chars().next_back(), b.chars().next()) else {
        return false;
    };
    if (x.is_ascii_alphanumeric() || x == '_') && (y.is_ascii_alphanumeric() || y == '_') {
        return true;
    }
    if x == '-' && y == '-' {
        return true;
    }
    if x == '.' && y == '.' {
        return true;
    }
    // A number followed by `..` must not be printed as `1..`: the lexer can
    // consume the first dot as part of the numeric token.  Keep the operator
    // boundary explicit while retaining the compact form everywhere else.
    if x.is_ascii_digit() && y == '.' {
        return true;
    }
    false
}

// TS の joinLex 相当。TS は bin/un で joinLex を第 2 引数なし（=newline:false）で呼ぶため、
// `newline=true` の分岐は現状到達しない（parity 忠実のため残してある）。変更する際は
// printer.ts の呼び出しと突き合わせること。
fn join_lex(parts: &[String], newline: bool) -> String {
    let mut out = String::with_capacity(parts.iter().map(String::len).sum::<usize>() + parts.len());
    for part in parts {
        if part.is_empty() {
            continue;
        }
        if needs_sep(&out, part) {
            out.push(if newline { '\n' } else { ' ' });
        }
        out.push_str(part);
    }
    out
}

/// Render a numeric literal without losing its integer/float interpretation.
pub fn render_num(raw: &str) -> Cow<'_, str> {
    // Canonical positive decimal integers up to 15 digits already have the
    // shortest decimal integer spelling. An exponent would change Lua's subtype.
    // Avoid f64 parsing/formatting for the overwhelmingly common draw coordinates.
    let digits = raw.as_bytes();
    if !digits.is_empty()
        && digits.len() <= 15
        && (digits.len() == 1 || digits[0] != b'0')
        && digits.iter().all(u8::is_ascii_digit)
    {
        return Cow::Borrowed(raw);
    }
    // The public historical canonicalizer operates on f64; Lua 5.3 printing
    // must additionally retain the integer/float subtype. This matters beyond
    // math.type: concatenation, overflow and integer division can observe it.
    if let Some(value) = integer_literal_value(raw) {
        if value.unsigned_abs() > (1u64 << 53) {
            return Cow::Borrowed(raw);
        }
        let normalized = normalize_num_literal(raw);
        if integer_literal_value(&normalized) == Some(value) {
            return Cow::Owned(normalized);
        }
        // An exponent spelling, e.g. 1e5, is floating point in Lua. Do not use
        // it to shorten an integer token such as 100000.
        let decimal = value.to_string();
        return if decimal.len() < raw.len() {
            Cow::Owned(decimal)
        } else {
            Cow::Borrowed(raw)
        };
    }
    let mut normalized = normalize_num_literal(raw);
    if integer_literal_value(&normalized).is_some() {
        normalized.push_str(".0");
    }
    if normalized.len() > raw.len() {
        Cow::Borrowed(raw)
    } else {
        Cow::Owned(normalized)
    }
}

/// Emitter for an arena whose node IDs and child kinds satisfy the syntax contract.
pub struct Printer<'a> {
    ast: &'a Ast,
    zero: bool,
    newline_count: u32,
}

impl<'a> Printer<'a> {
    /// Create a printer for a structurally valid AST; choose whether separator newlines are uncharged.
    pub fn new(ast: &'a Ast, zero_cost_newlines: bool) -> Self {
        Printer {
            ast,
            zero: zero_cost_newlines,
            newline_count: 0,
        }
    }

    /// Return the number of separator newlines emitted so far.
    pub fn newline_count(&self) -> u32 {
        self.newline_count
    }

    fn name(&self, id: crate::ast::SymbolId) -> String {
        self.ast.strings.get(id).to_string()
    }

    fn bracket_key_expr(&mut self, id: NodeId) -> String {
        if let Node::Str(raw) = self.ast.node(id) {
            let key = qstr_bracket_key(raw);
            if key.starts_with('[') {
                return format!(" {key}");
            }
            return key;
        }
        self.expr(id, 0)
    }

    fn cat(&mut self, a: &str, b: &str) -> String {
        if b.is_empty() {
            return a.to_string();
        }
        if needs_sep(a, b) {
            if self.zero {
                self.newline_count += 1;
                format!("{a}\n{b}")
            } else {
                format!("{a} {b}")
            }
        } else {
            format!("{a}{b}")
        }
    }

    #[expect(
        clippy::panic,
        reason = "An expression child must be an expression node; malformed source is rejected before printing, while invalid low-level ASTs fail loudly"
    )]
    fn expr(&mut self, id: NodeId, parent: u8) -> String {
        let node = &self.ast.nodes[id as usize];
        let s: String;
        let prec: u8;
        match node {
            Node::Name(sym) => return self.name(*sym),
            Node::Num(v) => return render_num(v).into_owned(),
            Node::Str(v) => return qstr(v),
            Node::Nil => return "nil".to_string(),
            Node::Bool(b) => {
                // A literal-only comparison is the shortest Lua expression for a
                // boolean value in low-precedence contexts: `1>0` is true and
                // `1>2` is false. Keep the keyword literal when the surrounding
                // operator would require parentheses, because `(1>0)`/`(1>2)`
                // is not shorter and avoiding ties keeps canonical output stable.
                if parent <= 3 {
                    return if *b { "1>0" } else { "1>2" }.to_string();
                }
                return if *b {
                    "true".to_string()
                } else {
                    "false".to_string()
                };
            }
            Node::Vararg => return "...".to_string(),
            Node::Paren(e) => return format!("({})", self.expr(*e, 0)),
            Node::Table(fs) => {
                let parts: Vec<String> = fs
                    .iter()
                    .map(|f| match f {
                        TableField::Arr(v) => self.expr(*v, 0),
                        TableField::Name(k, v) => format!("{}={}", self.name(*k), self.expr(*v, 0)),
                        TableField::KVar(k, v) => {
                            if let Node::Str(raw) = &self.ast.nodes[*k as usize] {
                                if let Some(key) = plain_name_from_string_literal(raw) {
                                    return format!("{key}={}", self.expr(*v, 0));
                                }
                            }
                            let key = self.bracket_key_expr(*k);
                            format!("[{key}]={}", self.expr(*v, 0))
                        }
                    })
                    .collect();
                return format!("{{{}}}", parts.join(","));
            }
            Node::Index(obj, key, _) => {
                let obj_s = self.expr(*obj, 15);
                if let Node::Str(kv) = &self.ast.nodes[*key as usize] {
                    if let Some(k) = plain_name_from_string_literal(kv) {
                        return format!("{obj_s}.{k}");
                    }
                }
                let key_s = self.bracket_key_expr(*key);
                return format!("{obj_s}[{key_s}]");
            }
            Node::Function(..) => return self.function_expr(id),
            Node::Un(op, e) => {
                prec = 12;
                // TS は joinLex([…]) を第 2 引数なし（newline=false）で呼ぶ
                s = join_lex(&[op.clone(), self.expr(*e, 12)], false);
            }
            Node::Bin(op, l, r) => {
                let (lp, rp) = bin_prec(op);
                prec = lp;
                s = join_lex(&[self.expr(*l, lp), op.clone(), self.expr(*r, rp)], false);
            }
            Node::Call(fn_, args, method) => {
                let fn_s = self.expr(*fn_, 15);
                let args_s = args
                    .iter()
                    .map(|a| self.expr(*a, 0))
                    .collect::<Vec<_>>()
                    .join(",");
                // Lua's string/table argument syntax passes exactly one value,
                // just like f("text") / f({ ... }). Never drop parentheses for
                // calls/varargs: those parentheses can limit multiple results.
                let sugar = args.len() == 1
                    && matches!(self.ast.node(args[0]), Node::Str(_) | Node::Table(_));
                return match (method, sugar) {
                    (Some(m), true) => format!("{fn_s}:{m}{args_s}"),
                    (None, true) => format!("{fn_s}{args_s}"),
                    (Some(m), false) => format!("{fn_s}:{m}({args_s})"),
                    (None, false) => format!("{fn_s}({args_s})"),
                };
            }
            _ => panic!("unknown expression node"),
        }
        if prec < parent {
            format!("({s})")
        } else {
            s
        }
    }

    fn function_expr(&mut self, id: NodeId) -> String {
        if let Node::Function(ps, variadic, b) = &self.ast.nodes[id as usize] {
            let params = ps.iter().map(|p| self.name(*p)).collect::<Vec<_>>();
            let header = format!(
                "function({}{})",
                params.join(","),
                var_suffix(params.len(), *variadic)
            );
            let body = self.block(*b);
            let end = self.cat(&body, "end");
            return self.cat(&header, &end);
        }
        unreachable!()
    }

    fn function_tail(&mut self, id: NodeId) -> String {
        if let Node::Function(ps, variadic, b) = &self.ast.nodes[id as usize] {
            let params = ps.iter().map(|p| self.name(*p)).collect::<Vec<_>>();
            let header = format!(
                "({}{})",
                params.join(","),
                var_suffix(params.len(), *variadic)
            );
            let body = self.block(*b);
            let end = self.cat(&body, "end");
            return self.cat(&header, &end);
        }
        unreachable!()
    }

    fn target(&mut self, id: NodeId) -> String {
        if let Node::Methodname(obj, name) = &self.ast.nodes[id as usize] {
            return format!("{}:{}", self.expr(*obj, 0), self.name(*name));
        }
        self.expr(id, 0)
    }

    #[expect(
        clippy::panic,
        reason = "A statement block may contain only statement nodes; invalid low-level AST construction is an internal caller error"
    )]
    fn stat(&mut self, id: NodeId) -> String {
        match &self.ast.nodes[id as usize] {
            Node::Break => "break".to_string(),
            Node::Goto(name) => format!("goto {}", self.name(*name)),
            Node::Label(name) => format!("::{}::", self.name(*name)),
            Node::Do(b) => {
                let body = self.block(*b);
                let a = self.cat("do", &body);
                self.cat(&a, "end")
            }
            Node::While(e, b) => {
                let cond = self.expr(*e, 0);
                let body = self.block(*b);
                let head = self.cat("while", &cond);
                let head = self.cat(&head, "do");
                let a = self.cat(&head, &body);
                self.cat(&a, "end")
            }
            Node::Repeat(b, e) => {
                let body = self.block(*b);
                let until = self.expr(*e, 0);
                let a = self.cat("repeat", &body);
                let tail = self.cat("until", &until);
                self.cat(&a, &tail)
            }
            Node::If(arms, eb) => {
                let e0 = self.expr(arms[0].cond, 0);
                let b0 = self.block(arms[0].body);
                let head = self.cat("if", &e0);
                let head = self.cat(&head, "then");
                let mut out = self.cat(&head, &b0);
                let mut rest: Vec<(String, String)> = Vec::new();
                for arm in &arms[1..] {
                    let e = self.expr(arm.cond, 0);
                    let b = self.block(arm.body);
                    rest.push((e, b));
                }
                for (e, b) in rest {
                    out = self.cat(&out, "elseif");
                    out = self.cat(&out, &e);
                    out = self.cat(&out, "then");
                    out = self.cat(&out, &b);
                }
                if let Some(else_b) = eb {
                    let eb_body = self.block(*else_b);
                    out = self.cat(&out, "else");
                    out = self.cat(&out, &eb_body);
                }
                self.cat(&out, "end")
            }
            Node::Fornum(name, a, b, c, body) => {
                let mut head = format!(
                    "for {}={},{}",
                    self.name(*name),
                    self.expr(*a, 0),
                    self.expr(*b, 0)
                );
                if let Some(step) = c {
                    head.push_str(&format!(",{}", self.expr(*step, 0)));
                }
                let head = self.cat(&head, "do");
                let body = self.block(*body);
                let x = self.cat(&head, &body);
                self.cat(&x, "end")
            }
            Node::Forin(names, es, body) => {
                let ns = names
                    .iter()
                    .map(|n| self.name(*n))
                    .collect::<Vec<_>>()
                    .join(",");
                let s = es
                    .iter()
                    .map(|e| self.expr(*e, 0))
                    .collect::<Vec<_>>()
                    .join(",");
                let head = format!("for {ns} in");
                let head = self.cat(&head, &s);
                let head = self.cat(&head, "do");
                let body = self.block(*body);
                let x = self.cat(&head, &body);
                self.cat(&x, "end")
            }
            Node::Funcstat(target, fn_) => format!(
                "function {}{}",
                self.target(*target),
                self.function_tail(*fn_)
            ),
            Node::Localfunc(name, fn_) => format!(
                "local function {}{}",
                self.name(*name),
                self.function_tail(*fn_)
            ),
            Node::Local(names, es) => {
                let ns = names
                    .iter()
                    .map(|n| self.name(*n))
                    .collect::<Vec<_>>()
                    .join(",");
                let keep = trimmed_nil_rhs_len(self.ast, names.len(), es, true);
                if keep == 0 {
                    format!("local {ns}")
                } else {
                    let s = es[..keep]
                        .iter()
                        .map(|e| self.expr(*e, 0))
                        .collect::<Vec<_>>()
                        .join(",");
                    format!("local {ns}={s}")
                }
            }
            Node::Return(es) => {
                if es.is_empty() {
                    "return".to_string()
                } else {
                    let s = es
                        .iter()
                        .map(|e| self.expr(*e, 0))
                        .collect::<Vec<_>>()
                        .join(",");
                    self.cat("return", &s)
                }
            }
            Node::Callstat(e) => self.expr(*e, 0),
            Node::Assign(vs, es) => {
                let v = vs
                    .iter()
                    .map(|x| self.expr(*x, 0))
                    .collect::<Vec<_>>()
                    .join(",");
                let keep = trimmed_nil_rhs_len(self.ast, vs.len(), es, false);
                let e = es[..keep]
                    .iter()
                    .map(|x| self.expr(*x, 0))
                    .collect::<Vec<_>>()
                    .join(",");
                format!("{v}={e}")
            }
            _ => panic!("unknown statement node"),
        }
    }

    fn block(&mut self, id: NodeId) -> String {
        if let Node::Block(ss) = &self.ast.nodes[id as usize] {
            if ss.is_empty() {
                return String::new();
            }
            let parts: Vec<String> = ss.iter().map(|s| self.stat(*s)).collect();
            let mut out =
                String::with_capacity(parts.iter().map(String::len).sum::<usize>() + parts.len());
            for (i, part) in parts.iter().enumerate() {
                if i > 0 {
                    // A parenthesized next statement must never attach to the
                    // previous expression (even a local initializer).
                    if part.starts_with('(') {
                        out.push(';');
                    } else if needs_sep(&parts[i - 1], part) {
                        if self.zero {
                            self.newline_count += 1;
                            out.push('\n');
                        } else {
                            out.push(' ');
                        }
                    }
                }
                out.push_str(part);
            }
            return out;
        }
        unreachable!()
    }

    /// Emit the root block. Invalid low-level node IDs or expression/statement shapes are caller errors.
    pub fn output(&mut self, root: NodeId) -> String {
        self.block(root)
    }

    /// 文単位の出力（デバッグ・テスト用）。
    pub fn stat_public(&mut self, id: NodeId) -> String {
        self.stat(id)
    }

    /// 式単位の出力（デバッグ・テスト用）。
    pub fn expr_public(&mut self, id: NodeId) -> String {
        self.expr(id, 0)
    }
}

/// (ローカル変数接尾辞: vararg が真のとき ",..." か "..." を追記)
fn var_suffix(params: usize, variadic: bool) -> &'static str {
    if !variadic {
        ""
    } else if params > 0 {
        ",..."
    } else {
        "..."
    }
}

fn is_plain_name(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_alphanumeric() || c == '_') && !KEYWORDS.contains(&s)
}

pub(crate) fn plain_name_from_string_literal(raw: &str) -> Option<Cow<'_, str>> {
    let bytes = raw.as_bytes();
    if bytes.len() >= 2 && matches!(bytes[0], b'\'' | b'"') && bytes[bytes.len() - 1] == bytes[0] {
        let inner = &raw[1..raw.len() - 1];
        if !inner.as_bytes().contains(&b'\\') {
            return is_plain_name(inner).then_some(Cow::Borrowed(inner));
        }
    }
    let decoded = decode_lua_string(raw);
    is_plain_name(&decoded).then_some(Cow::Owned(decoded))
}

/// tokenMinify 相当（Lexer 列 → 最短トークン文字列）。
/// TS の tokenMinify は lexer エラー時に throw する。Rust は握りつぶさず
/// `Err(LexError)` で伝播させる（AGENTS §7: エラーの握りつぶし禁止）。
pub fn token_minify(source: &str) -> Result<String, crate::lexer::LexError> {
    use crate::lexer::{Lexer, TokenKind};
    let mut out = String::with_capacity(source.len());
    let mut lexer = Lexer::new(source);
    let ts = lexer.all()?;
    for t in ts {
        if t.k == TokenKind::Eof {
            continue;
        }
        let value = match t.k {
            TokenKind::Str => Cow::Owned(qstr(&t.v)),
            TokenKind::Num => render_num(&t.v),
            _ => Cow::Borrowed(t.v.as_str()),
        };
        if needs_sep(&out, &value) {
            out.push(' ');
        }
        out.push_str(&value);
    }
    Ok(out)
}

/// Remove comments and redundant separators without rewriting names, literals, or line endings.
/// Preserving token line positions also preserves Lua error messages observed through pcall.
/// Reflection and host overrides use this path instead of whole-program transformations.
pub fn lexical_minify(source: &str) -> Result<String, crate::lexer::LexError> {
    use crate::lexer::{Lexer, TokenKind};
    let tokens = Lexer::new(source).all()?;
    let compact_with = |spaced: bool| {
        let mut output = String::with_capacity(source.len());
        let mut end = 0;
        for token in tokens.iter().filter(|t| t.k != TokenKind::Eof) {
            let gap = &source[end..token.p];
            let before = output.len();
            output.extend(gap.chars().filter(|c| matches!(c, '\n' | '\r')));
            if before == output.len()
                && !output.is_empty()
                && (spaced || needs_sep(&output, &token.v))
            {
                output.push(' ');
            }
            output.push_str(&token.v);
            end = token.p + token.v.len();
        }
        output.extend(source[end..].chars().filter(|c| matches!(c, '\n' | '\r')));
        output
    };
    let mut compact = compact_with(false);
    let expected: Vec<_> = tokens
        .iter()
        .filter(|t| t.k != TokenKind::Eof)
        .map(|t| (&t.k, t.v.as_str(), t.line))
        .collect();
    let matches = Lexer::new(&compact).all().is_ok_and(|actual| {
        actual
            .iter()
            .filter(|t| t.k != TokenKind::Eof)
            .map(|t| (&t.k, t.v.as_str(), t.line))
            .eq(expected.iter().copied())
    });
    // Multi-character delimiters can require an explicit boundary. This branch
    // uses the same exact tokens and original line breaks, not a second parser.
    if !matches {
        compact = compact_with(true);
    }
    if compact.encode_utf16().count() > source.encode_utf16().count() {
        return Ok(source.to_owned());
    }
    Ok(compact)
}
