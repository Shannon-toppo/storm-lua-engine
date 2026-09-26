//! VMごとの上限付きロギング。ログの配信およびテキストデコードはホスト側の責務です。
use crate::runner::{ErrorKind, VmError};
use mlua::{Lua, Table, Value, Variadic};
use std::{cell::RefCell, rc::Rc};
/// ログレコードを生成したLuaエントリポイント。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogSource {
    /// 明示的な開発用print拡張。
    Print,
    /// 制限付きのdebug.log（Luaの標準debugライブラリではありません）。
    Debug,
}
/// 所有権を持つログデータ。非UTF-8バイト列も有効であり、暗黙に修復されることはありません。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogRecord {
    /// 発生元のLua関数。
    pub source: LogSource,
    /// タブ区切りの値列（改行は付加されません）。
    pub bytes: Vec<u8>,
}
#[derive(Default)]
pub(crate) struct LogBuffer {
    records: Vec<LogRecord>,
    bytes: usize,
}
fn limit(message: &str) -> mlua::Error {
    mlua::Error::external(VmError::new(ErrorKind::Limit, message))
}
fn function(
    lua: &Lua,
    buffer: Rc<RefCell<LogBuffer>>,
    source: LogSource,
) -> mlua::Result<mlua::Function> {
    lua.create_function(move |lua, values: Variadic<Value>| {
        let mut line = Vec::new();
        for (i, value) in values.into_iter().enumerate() {
            if i > 0 {
                line.push(b'\t');
            }
            let bytes = match value {
                Value::Nil => b"nil".to_vec(),
                Value::Boolean(true) => b"true".to_vec(),
                Value::Boolean(false) => b"false".to_vec(),
                value => {
                    let kind = value.type_name();
                    if let Some(text) = lua.coerce_string(value)? {
                        text.as_bytes().to_vec()
                    } else {
                        kind.as_bytes().to_vec()
                    }
                }
            };
            if line.len() + bytes.len() > 16384 {
                return Err(limit("log line exceeds 16 KiB"));
            }
            line.extend_from_slice(&bytes);
        }
        let mut buffer = buffer.try_borrow_mut().map_err(|_| {
            mlua::Error::external(VmError::new(ErrorKind::Busy, "log buffer is borrowed"))
        })?;
        if buffer.records.len() >= 128 || buffer.bytes + line.len() > 65536 {
            return Err(limit(
                "log buffer limit exceeded; drain logs between callbacks",
            ));
        }
        buffer.bytes += line.len();
        buffer.records.push(LogRecord {
            source,
            bytes: line,
        });
        Ok(())
    })
}
pub(crate) fn install(
    lua: &Lua,
    env: &Table,
    buffer: Rc<RefCell<LogBuffer>>,
    print: bool,
) -> mlua::Result<()> {
    if print {
        env.raw_set(
            "print",
            function(lua, Rc::clone(&buffer), LogSource::Print)?,
        )?;
    }
    let debug = lua.create_table()?;
    debug.raw_set("log", function(lua, buffer, LogSource::Debug)?)?;
    env.raw_set("debug", debug)?;
    Ok(())
}
impl crate::runner::Vm {
    /// 明示的な開発用拡張として print および制限付き debug.log を組み込みます。
    pub fn enable_logs(&mut self) -> Result<(), VmError> {
        self.ensure_idle()?;
        if self.environment_profile != storm_lua_spec::environment::EnvironmentProfile::Extended {
            return Err(VmError::new(
                ErrorKind::InvalidArgument,
                "print requires the extended environment; debug.log is already available",
            ));
        }
        // Extended construction already installed print; keep explicit host overrides intact.
        Ok(())
    }
    /// debug.log を標準APIとして提供するプロファイル向けに、debug.log のみを組み込みます。
    pub fn enable_debug_log(&mut self) -> Result<(), VmError> {
        self.ensure_idle()?;
        install(&self.lua, &self.environment, Rc::clone(&self.logs), false)?;
        Ok(())
    }
    /// 一時停止やエラーの前に出力されたログを含め、所有権を持つログレコードを取り出します。
    pub fn drain_log_records(&mut self) -> Vec<LogRecord> {
        let mut buffer = self.logs.borrow_mut();
        buffer.bytes = 0;
        std::mem::take(&mut buffer.records)
    }
}
