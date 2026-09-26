//! 検証済みのWASMアダプタ。生ポインタは所有された安定したバッファに対してのみ返されます。
use storm_lua_bridge as bridge;
mod adapter;
bridge::memory_exports!(
    sls_alloc,
    sls_dealloc,
    sls_error_status,
    sls_error_ptr,
    sls_error_len,
    sls_response_ptr,
    sls_response_len
);
/// 現在の固定I/OおよびコマンドABIリビジョン。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_abi_version() -> u32 {
    storm_lua_spec::abi::ABI_VERSION
}

/// このモジュールビルドで実際に利用可能な機能（ケイパビリティ）。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_capabilities() -> u32 {
    storm_lua_spec::abi::CAP_RASTER
}

/// バンドルされた印字可能ASCIIの1行（row）を読み取ります。無効なインデックスは -1 を返します。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_font_row(codepoint: u32, row: u32) -> i32 {
    storm_screen_raster::font::ascii_glyph(codepoint)
        .and_then(|g| g.get(row as usize))
        .map_or(-1, |v| i32::from(*v))
}

/// 世代付きハンドルを破棄します。重複破棄はエラーとなります。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_dispose(handle: u32) -> i32 {
    bridge::call(|| adapter::dispose(handle))
}

/// Luaランタイムをリンクせずにラスタライザを生成します。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_new(width: u32, height: u32) -> u32 {
    bridge::value(|| adapter::new(width, height)) as u32
}

/// 境界付きバイナリバッチを1つデコードし、新規フレームをレンダリングします。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_render(handle: u32, pointer: usize, length: u32) -> i32 {
    bridge::call(|| bridge::with_upload(pointer, length, |bytes| adapter::render(handle, bytes)))
}

/// フレームの変更または破棄が発生するまで、生のRGBAバイト列を参照します。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_frame_ptr(handle: u32) -> usize {
    bridge::value(|| {
        adapter::with(handle, |s| {
            let raster = &s.raster;
            Ok(raster.pixels().as_ptr() as usize)
        })
    })
}

/// フレームのバイト長。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_frame_len(handle: u32) -> usize {
    bridge::value(|| {
        adapter::with(handle, |s| {
            let raster = &s.raster;
            Ok(raster.pixels().len())
        })
    })
}

/// 現在のフレーム幅。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_frame_width(handle: u32) -> usize {
    bridge::value(|| {
        adapter::with(handle, |s| {
            let raster = &s.raster;
            Ok(raster.dimensions().0 as usize)
        })
    })
}

/// 現在のフレーム高さ。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_frame_height(handle: u32) -> usize {
    bridge::value(|| {
        adapter::with(handle, |s| {
            let raster = &s.raster;
            Ok(raster.dimensions().1 as usize)
        })
    })
}

/// 現在のフレーム世代（epoch）。変更後に古い参照（lease）を使用してはなりません。
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn sls_frame_epoch(handle: u32) -> u32 {
    bridge::value(|| adapter::with(handle, |s| Ok(s.epoch as usize))) as u32
}
