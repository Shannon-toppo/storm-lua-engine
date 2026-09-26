//! 最小限の同期ホストインポート。このモジュールのみがRust所有のスライスをJSシムに公開します。
use storm_lua_bridge::{BridgeError, Status};

#[cfg(target_os = "emscripten")]
#[allow(unsafe_code)]
mod imports {
    use super::{BridgeError, Status};
    extern "C" {
        fn sle_host_invoke(key: u32, pointer: *const u8, length: u32) -> i32;
        fn sle_host_length() -> u32;
        fn sle_host_read(pointer: *mut u8, length: u32) -> i32;
    }
    pub(super) fn call(key: u32, request: &[u8]) -> Result<Vec<u8>, BridgeError> {
        if request.len() > 4 * 1024 * 1024 {
            return Err(BridgeError::new(
                Status::Limit,
                "host request exceeds 4 MiB",
            ));
        }
        // SAFETY: 固定されたシムは、ホストコードに入る前にこの有効なイミュータブルスライスを同期的に正確にコピーします。
        // シムがポインタを保持したり、Rustのアロケータに再突入することはありません。
        let status = unsafe { sle_host_invoke(key, request.as_ptr(), request.len() as u32) };
        // SAFETY: ポインタ引数はなし。同一の同期呼び出しがシムのレスポンススロットを所有します。
        let length = unsafe { sle_host_length() };
        if length > 16 * 1024 * 1024 {
            return Err(BridgeError::new(
                Status::Limit,
                "host response exceeds 16 MiB",
            ));
        }
        let mut bytes = Vec::new();
        bytes
            .try_reserve_exact(length as usize)
            .map_err(|_| BridgeError::new(Status::Limit, "cannot allocate host response"))?;
        bytes.resize(length as usize, 0);
        // SAFETY: シムは長さを検証し、この割り当て・初期化済みスライスに最大でもそのバイト数分のみ書き込みます。
        // そのレスポンスはJS所有のコピーであり、WASMのエイリアスではありません。
        let copied = unsafe { sle_host_read(bytes.as_mut_ptr(), length) };
        if copied != length as i32 {
            return Err(BridgeError::new(Status::Host, "host response copy failed"));
        }
        if status == 0 {
            return Ok(bytes);
        }
        let message = String::from_utf8(bytes)
            .map_err(|_| BridgeError::new(Status::Host, "host diagnostic is not UTF-8"))?;
        let status = match status {
            2 => Status::Limit,
            4 => Status::InvalidArgument,
            5 => Status::Busy,
            6 => Status::Unsupported,
            _ => Status::Host,
        };
        Err(BridgeError::new(status, message))
    }
}
/// 固定されたホストシムを呼び出します。ネイティブコンシューマは代わりに通常のRustクロージャを提供します。
pub(crate) fn call(key: u32, request: &serde_json::Value) -> Result<Vec<u8>, BridgeError> {
    #[cfg(target_os = "emscripten")]
    {
        let bytes = serde_json::to_vec(request)
            .map_err(|e| BridgeError::new(Status::InvalidArgument, e.to_string()))?;
        imports::call(key, &bytes)
    }
    #[cfg(not(target_os = "emscripten"))]
    {
        let _ = (key, request);
        Err(BridgeError::new(
            Status::Unsupported,
            "JS host services require the Emscripten adapter; use native host functions in Rust",
        ))
    }
}
