//! 列優先（column-major）の4x4行列演算。f64演算。特異行列の逆行列計算は明示的なエラーとなります。
use storm_lua_vm::backend::{BackendError, BackendResult, Lua, Table};
fn invalid(message: &str) -> BackendError {
    BackendError::external(super::invalid(message))
}
fn identity() -> [f64; 16] {
    let mut m = [0.0_f64; 16];
    for i in 0..4 {
        m[i * 5] = 1.0;
    }
    m
}
fn read(table: Table) -> BackendResult<[f64; 16]> {
    let mut m = [0.0_f64; 16];
    for (i, value) in m.iter_mut().enumerate() {
        *value = table.raw_get(i + 1)?;
    }
    if !m.iter().all(|n| n.is_finite()) {
        return Err(invalid("matrix entries must be finite"));
    }
    Ok(m)
}
fn write(lua: &Lua, m: [f64; 16]) -> BackendResult<Table> {
    lua.create_sequence_from(m)
}
fn multiply(a: [f64; 16], b: [f64; 16]) -> [f64; 16] {
    let mut c = [0.0_f64; 16];
    for col in 0..4 {
        for row in 0..4 {
            for k in 0..4 {
                c[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
            }
        }
    }
    c
}
fn inverse(m: [f64; 16]) -> BackendResult<[f64; 16]> {
    let mut rows = [[0.0; 8]; 4];
    for r in 0..4 {
        for c in 0..4 {
            rows[r][c] = m[c * 4 + r];
        }
        rows[r][r + 4] = 1.0;
    }
    for col in 0..4 {
        let mut pivot = col;
        for r in col + 1..4 {
            if rows[r][col].abs() > rows[pivot][col].abs() {
                pivot = r;
            }
        }
        if rows[pivot][col] == 0.0 {
            return Err(invalid("cannot invert a singular matrix"));
        }
        rows.swap(col, pivot);
        let scale = rows[col][col];
        for value in &mut rows[col] {
            *value /= scale;
        }
        for r in 0..4 {
            if r != col {
                let scale = rows[r][col];
                let pivot_row = rows[col];
                for (value, pivot_value) in rows[r].iter_mut().zip(pivot_row) {
                    *value -= scale * pivot_value;
                }
            }
        }
    }
    let mut result = [0.0_f64; 16];
    for r in 0..4 {
        for c in 0..4 {
            result[c * 4 + r] = rows[r][c + 4];
        }
    }
    if !result.iter().all(|n| n.is_finite()) {
        return Err(invalid("matrix inverse is not finite"));
    }
    Ok(result)
}
pub(super) fn install(lua: &Lua, env: &Table) -> BackendResult<()> {
    let matrix = lua.create_table()?;
    matrix.raw_set(
        "identity",
        lua.create_function(|lua, ()| write(lua, identity()))?,
    )?;
    matrix.raw_set(
        "translation",
        lua.create_function(|lua, (x, y, z): (f64, f64, f64)| {
            if ![x, y, z].iter().all(|n| n.is_finite()) {
                return Err(invalid("translation must be finite"));
            }
            let mut m = identity();
            m[12] = x;
            m[13] = y;
            m[14] = z;
            write(lua, m)
        })?,
    )?;
    matrix.raw_set(
        "position",
        lua.create_function(|_, m: Table| {
            let m = read(m)?;
            Ok((m[12], m[13], m[14]))
        })?,
    )?;
    matrix.raw_set(
        "multiply",
        lua.create_function(|lua, (a, b): (Table, Table)| {
            write(lua, multiply(read(a)?, read(b)?))
        })?,
    )?;
    matrix.raw_set(
        "transpose",
        lua.create_function(|lua, m: Table| {
            let m = read(m)?;
            let mut t = [0.0_f64; 16];
            for r in 0..4 {
                for c in 0..4 {
                    t[c * 4 + r] = m[r * 4 + c];
                }
            }
            write(lua, t)
        })?,
    )?;
    matrix.raw_set(
        "invert",
        lua.create_function(|lua, m: Table| write(lua, inverse(read(m)?)?))?,
    )?;
    matrix.raw_set(
        "distance",
        lua.create_function(|_, (a, b): (Table, Table)| {
            let a = read(a)?;
            let b = read(b)?;
            Ok(
                ((a[12] - b[12]).powi(2) + (a[13] - b[13]).powi(2) + (a[14] - b[14]).powi(2))
                    .sqrt(),
            )
        })?,
    )?;
    matrix.raw_set(
        "multiplyXYZW",
        lua.create_function(|_, (m, x, y, z, w): (Table, f64, f64, f64, f64)| {
            let m = read(m)?;
            let v = [x, y, z, w];
            let mut out = [0.0; 4];
            for r in 0..4 {
                for c in 0..4 {
                    out[r] += m[c * 4 + r] * v[c];
                }
            }
            Ok((out[0], out[1], out[2], out[3]))
        })?,
    )?;
    for (name, axis) in [("rotationX", 0), ("rotationY", 1), ("rotationZ", 2)] {
        matrix.raw_set(
            name,
            lua.create_function(move |lua, angle: f64| {
                if !angle.is_finite() {
                    return Err(invalid("rotation must be finite"));
                }
                let (s, c) = angle.sin_cos();
                let mut m = identity();
                let a = (axis + 1) % 3;
                let b = (axis + 2) % 3;
                m[a * 4 + a] = c;
                m[b * 4 + b] = c;
                m[a * 4 + b] = s;
                m[b * 4 + a] = -s;
                write(lua, m)
            })?,
        )?;
    }
    env.raw_set("matrix", matrix)?;
    Ok(())
}
