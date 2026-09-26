//! 同梱された4x5ビットマップデータ。ゲーム本体のインストールや実行時抽出は不要です。
mod data;
pub use data::{GLYPHS, GLYPH_ADVANCE, GLYPH_HEIGHT, GLYPH_WIDTH, LINE_ADVANCE};

/// 正確な印刷可能ASCIIグリフを返します。テキストレイアウトや非ASCIIポリシーは分離されています。
pub fn ascii_glyph(codepoint: u32) -> Option<&'static [u8; 5]> {
    if (32..=126).contains(&codepoint) {
        GLYPHS.get((codepoint - 32) as usize)
    } else {
        None
    }
}

/// 文字検索の契約: 完全一致グリフ、単一文字の大文字、そして豆腐（未定義文字枠）。
pub fn glyph_for(character: char) -> &'static [u8; 5] {
    if let Some(glyph) = ascii_glyph(character as u32) {
        return glyph;
    }
    if let Some((_, glyph)) = data::EXTRA_GLYPHS
        .iter()
        .find(|(code, _)| *code == character as u32)
    {
        return glyph;
    }
    let mut uppercase = character.to_uppercase();
    if let Some(first) = uppercase.next() {
        if uppercase.next().is_none() {
            if let Some(glyph) = ascii_glyph(first as u32) {
                return glyph;
            }
        }
    }
    &[15, 9, 9, 9, 15]
}
