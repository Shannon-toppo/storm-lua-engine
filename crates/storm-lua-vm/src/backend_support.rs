//! 初期化およびyield可能性検査のための、バックエンド限定の狭いunsafe境界。
#![allow(unsafe_code)]
use mlua::{ffi, Lua, LuaOptions, StdLib, Thread};
use std::ptr::NonNull;

pub(crate) fn create_lua() -> mlua::Result<Lua> {
    let libraries = StdLib::TABLE | StdLib::STRING | StdLib::MATH;
    #[cfg(feature = "debug")]
    {
        // SAFETY: この状態が元のグローバル環境で実行されることはありません。呼び出し側は
        // スクリプトを受け付ける前に独立した許可リスト付きの _ENV を構築し、debugテーブルはホスト専用にとどまります。
        Ok(unsafe { Lua::unsafe_new_with(libraries | StdLib::DEBUG, LuaOptions::default()) })
    }
    #[cfg(not(feature = "debug"))]
    {
        Lua::new_with(libraries, LuaOptions::default())
    }
}

pub(crate) struct YieldProbe {
    _thread: Thread,
    state: NonNull<ffi::lua_State>,
}
impl YieldProbe {
    pub(crate) fn new(lua: &Lua, thread: &Thread) -> mlua::Result<Self> {
        let mut pointer = std::ptr::null_mut();
        // SAFETY: ルート化された1つのThread引数がこの一時スタック上に存在します。lua_tothread
        // はその引数を読み取ります。それをpopすることで期待される空の復帰スタックが復元されます。
        unsafe {
            lua.exec_raw::<()>(thread.clone(), |state| {
                pointer = ffi::lua_tothread(state, 1);
                ffi::lua_pop(state, 1);
            })?;
        }
        let state = NonNull::new(pointer)
            .ok_or_else(|| mlua::Error::RuntimeError("missing coroutine state".into()))?;
        Ok(Self {
            _thread: thread.clone(),
            state,
        })
    }
    #[cfg(feature = "debug")]
    pub(crate) fn local_names(&self) -> mlua::Result<Vec<(i32, Vec<u8>)>> {
        // SAFETY: 生きているコルーチンのフックから、Luaがyieldのためにsavedpcを巻き戻す前にのみ照会されます。
        // Cのデバッグ照会はスクリプトを実行しません。スタックスロットを1つ確保し、
        // ルート化された各ローカル変数名をコピーし、lua_getlocalによってpushされた値を正確にpopします。
        // これにより、yield後のgetlocalが一時変数としてラベル付けする前に、束縛の識別子を捕捉します。
        unsafe {
            let state = self.state.as_ptr();
            if ffi::lua_checkstack(state, 1) == 0 {
                return Err(mlua::Error::RuntimeError(
                    "debug stack capacity exceeded".into(),
                ));
            }
            let mut record = std::mem::MaybeUninit::<ffi::lua_Debug>::zeroed();
            if ffi::lua_getstack(state, 0, record.as_mut_ptr()) == 0 {
                return Ok(Vec::new());
            }
            let mut names = Vec::new();
            for index in 1..=1024 {
                let name = ffi::lua_getlocal(state, record.as_ptr(), index);
                if name.is_null() {
                    break;
                }
                names.push((index, std::ffi::CStr::from_ptr(name).to_bytes().to_vec()));
                ffi::lua_pop(state, 1);
            }
            Ok(names)
        }
    }
    pub(crate) fn can_yield(&self) -> bool {
        // SAFETY: mluaがVMロックを保持している間、このコルーチンのフック内でのみ呼び出されます。
        // ルート化されたThreadがコルーチンを生存させます。コルーチンもそのLua状態もSendではありません。
        // これは読み取り専用のC照会であり、Rustフレームをまたぐyield/longjmpではありません。
        unsafe { ffi::lua_isyieldable(self.state.as_ptr()) != 0 }
    }
}
