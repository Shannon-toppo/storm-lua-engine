//! 画面出力契約。フレームバッファ表現はCanvasのような乗算済みアルファ（premultiplied alpha）ではありません。

/// 承認されたソースアルファブレンド規則に従って格納されるバイト列。
/// アルファはRGBと同じ係数でブレンドされるため、rgb <= a という不変条件は成り立ちません。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PixelFormat {
    /// 生のソースアルファ・デスティネーションアルファ規則に基づくRGBA8。
    GameRgba8,
}

/// 4バイトの色コンポーネント。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgba8(pub [u8; 4]);

/// 借用されたCPUフレームバッファ。プロデューサがストレージとその有効期間を所有します。
#[derive(Debug)]
pub struct FrameView<'a> {
    /// 1行あたりのピクセル数。
    pub width: u32,
    /// 行数。
    pub height: u32,
    /// 行開始位置間のバイト数（ストライド）。
    pub stride_bytes: usize,
    /// ピクセル値の解釈。
    pub format: PixelFormat,
    /// 借用されたストレージ。表示API向けの暗黙的な変換は行われません。
    pub pixels: &'a [u8],
}
