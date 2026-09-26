//! ホスト管理の地形描画。この契約はゲームの地形データやマップ色を独自生成しません。
use crate::{draw::ScreenError, screen::Rgba8};
/// バイナリプロトコルの安定した順序によるマップパレットスロット。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum MapColorKind {
    /// 深海。
    Ocean,
    /// 浅瀬。
    Shallows,
    /// 陸地。
    Land,
    /// 草地。
    Grass,
    /// 砂地。
    Sand,
    /// 雪原。
    Snow,
    /// 岩。
    Rock,
    /// 砂利。
    Gravel,
}
impl TryFrom<u8> for MapColorKind {
    type Error = ScreenError;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Ocean),
            1 => Ok(Self::Shallows),
            2 => Ok(Self::Land),
            3 => Ok(Self::Grass),
            4 => Ok(Self::Sand),
            5 => Ok(Self::Snow),
            6 => Ok(Self::Rock),
            7 => Ok(Self::Gravel),
            _ => Err(ScreenError::InvalidCommand),
        }
    }
}
/// 順序付きコマンドストリーム内の drawMap の正確な位置におけるスナップショット。
#[derive(Debug, Clone, PartialEq)]
pub struct MapRequest {
    /// 描画先のピクセル幅。
    pub width: u32,
    /// 描画先のピクセル高さ。
    pub height: u32,
    /// 水平方向のワールド中心座標（ワールドXおよびZ、単位: メートル）。
    pub center: [f64; 2],
    /// Luaのズーム引数。解釈は地形プロバイダの責務です。
    pub zoom: f64,
    /// 明示的なフレームローカルの上書き。None は黒ではなくプロバイダ自身のパレットを意味します。
    pub colors: [Option<Rgba8>; 8],
}
/// 同期的なホスト提供のマップレンダラー。Lua専用の記録レイヤーからは一切呼び出されません。
pub trait MapProvider {
    /// 正確に width*height*4 バイトの所有権を持つRGBAバイト列を返します。この画像がこの時点でフレームを置換します。
    /// プロバイダは失敗する可能性があります。フォールバックマップや部分サイズの画像は受け付けられません。
    fn render(&self, request: &MapRequest) -> Result<Vec<u8>, ScreenError>;
}
impl<F> MapProvider for F
where
    F: Fn(&MapRequest) -> Result<Vec<u8>, ScreenError>,
{
    fn render(&self, request: &MapRequest) -> Result<Vec<u8>, ScreenError> {
        self(request)
    }
}
