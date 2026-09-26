//! 承認されたRGBAソースアルファブレンド方程式の整数表現。
use storm_lua_spec::screen::Rgba8;

fn channel(source: u8, alpha: u8, destination: u8) -> u8 {
    let a = u32::from(alpha);
    ((u32::from(source) * a + u32::from(destination) * (255 - a) + 127) / 255) as u8
}

/// ソースアルファを用いてRGBおよびアルファをブレンドします。アルファ値は As*As + Ad*(1-As) となります。
/// これは意図的に、通常の事前乗算済み（premultiplied）source-overアルファ方程式ではありません。
pub fn blend_pixel(source: Rgba8, destination: Rgba8) -> Rgba8 {
    let s = source.0;
    let d = destination.0;
    Rgba8([
        channel(s[0], s[3], d[0]),
        channel(s[1], s[3], d[1]),
        channel(s[2], s[3], d[2]),
        channel(s[3], s[3], d[3]),
    ])
}
