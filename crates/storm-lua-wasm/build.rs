//! リンクされているJavaScriptホストシムの変更時にCargoのリンクキャッシュを無効化します。
fn main() {
    println!("cargo:rerun-if-changed=../../tools/host-library.js");
}
