//! Emscripten実行エントリ。エンジン関数はライブラリからエクスポートされます。
fn main() {
    std::hint::black_box(storm_lua_wasm::sle_abi_version());
}
