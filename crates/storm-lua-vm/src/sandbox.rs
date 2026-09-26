//! ベースラインの安全なLua環境およびVMごとの乱数状態。
use mlua::{Lua, Table, Value, Variadic};
use std::{cell::Cell, rc::Rc};

pub(crate) fn environment(lua: &Lua) -> mlua::Result<Table> {
    let globals = lua.globals();
    let env = lua.create_table()?;
    for name in [
        "assert", "error", "ipairs", "next", "pairs", "pcall", "select", "tonumber", "tostring",
        "type", "xpcall",
    ] {
        env.raw_set(name, globals.raw_get::<Value>(name)?)?;
    }
    for name in ["string", "table", "math"] {
        env.raw_set(name, globals.raw_get::<Table>(name)?)?;
    }
    // Lua文字列値はこのメタテーブルを共有するため、元のテーブルからもバイトコードダンプ（string.dump）を削除します。
    globals
        .get::<Table>("string")?
        .raw_set("dump", Value::Nil)?;
    env.raw_set(
        "unpack",
        globals.get::<Table>("table")?.raw_get::<Value>("unpack")?,
    )?;
    install_random(lua, &env.get::<Table>("math")?)?;
    Ok(env)
}
fn install_random(lua: &Lua, math: &Table) -> mlua::Result<()> {
    // PUC-Lua 5.3のC言語RNGはプロセス全体で共有されます。ローカルな決定論的ストリームによりVM間の結合を回避します。
    // これは再現性と分離を保証するものであり、ゲームの未ドキュメントの乱数列を再現するものではありません。
    let seed = Rc::new(Cell::new(1_u64));
    let state = Rc::clone(&seed);
    math.raw_set(
        "randomseed",
        lua.create_function(move |_, value: i64| {
            state.set(value as u64);
            Ok(())
        })?,
    )?;
    math.raw_set(
        "random",
        lua.create_function(move |_, args: Variadic<i64>| {
            let next = || {
                let z = seed.get().wrapping_add(0x9e3779b97f4a7c15);
                seed.set(z);
                let z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
                let z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
                z ^ (z >> 31)
            };
            match args.as_slice() {
                [] => Ok(Value::Number(
                    (next() >> 11) as f64 * (1.0 / (1_u64 << 53) as f64),
                )),
                [high] | [_, high] => {
                    let low = if args.len() == 1 { 1 } else { args[0] };
                    let span = i128::from(*high) - i128::from(low) + 1;
                    if span <= 0 || span > i128::from(u64::MAX) {
                        return Err(mlua::Error::RuntimeError("invalid random interval".into()));
                    }
                    let span = span as u64;
                    let threshold = span.wrapping_neg() % span;
                    let mut value = next();
                    while value < threshold {
                        value = next();
                    }
                    Ok(Value::Integer(
                        (i128::from(low) + i128::from(value % span)) as i64,
                    ))
                }
                _ => Err(mlua::Error::RuntimeError(
                    "random expects zero, one or two integers".into(),
                )),
            }
        })?,
    )?;
    Ok(())
}

/// 保護された呼び出し（pcall/xpcall）の後にバジェット枯渇エラーを再送出します。これにより、
/// yield不可能なCコールバック内の入れ子pcallループがフックのバジェット例外を繰り返し捕捉するのを防ぎます。
pub(crate) fn protect_calls(
    lua: &Lua,
    env: &Table,
    control: Rc<std::cell::RefCell<crate::runner::HookControl>>,
) -> mlua::Result<()> {
    let check = lua.create_function(move |_, ()| {
        if control.borrow().exhausted {
            Err(mlua::Error::RuntimeError(
                "instruction budget exceeded".into(),
            ))
        } else {
            Ok(())
        }
    })?;
    let pcall: mlua::Function = env.raw_get("pcall")?;
    let xpcall: mlua::Function = env.raw_get("xpcall")?;
    let table: Table = env.raw_get("table")?;
    let pack: mlua::Function = table.raw_get("pack")?;
    let unpack: mlua::Function = table.raw_get("unpack")?;
    let factory = lua
        .load(
            r#"
        local p, x, check, pack, unpack = ...
        return function(...) check(); local r=pack(p(...)); check(); return unpack(r,1,r.n) end,
               function(...) check(); local r=pack(x(...)); check(); return unpack(r,1,r.n) end
    "#,
        )
        .into_function()?;
    let (p, x): (mlua::Function, mlua::Function) =
        factory.call((pcall, xpcall, check, pack, unpack))?;
    env.raw_set("pcall", p)?;
    env.raw_set("xpcall", x)?;
    Ok(())
}
