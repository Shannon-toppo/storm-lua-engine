#!/usr/bin/env python3
"""同梱ビットマップの数値表を検証し、外部取得なしでRustデータを生成します。"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/fonts/tiny-4x5.json"
OUTPUT = ROOT / "crates/storm-screen-raster/src/font/data.rs"

def validate(data):
    if any(data.get(key) != value for key, value in {"format": 1, "width": 4, "height": 5, "advance": 5, "line_advance": 6}.items()):
        raise ValueError("unsupported font dimensions or version")
    glyphs = data.get("glyphs", [])
    if [g.get("codepoint") for g in glyphs] != list(range(32, 127)):
        raise ValueError("expected exactly ASCII 32..126 in order")
    for glyph in glyphs:
        rows = glyph.get("rows", [])
        if len(rows) != 5 or any(type(row) is not int or not 0 <= row <= 15 for row in rows):
            raise ValueError("each glyph must contain five four-bit row masks")
    return glyphs

def render(data):
    glyphs = validate(data)
    lines = ["// tools/generate-font.py により生成。代わりに data/fonts/tiny-4x5.json を編集してください。",
             "// ビットマップの出所は data/fonts/README.md に記載されています。",
             "/// ビットマップのセル幅。", "pub const GLYPH_WIDTH: usize = 4;",
             "/// ビットマップのセル高さ。", "pub const GLYPH_HEIGHT: usize = 5;",
             "/// 水平方向のペン送り量。", "pub const GLYPH_ADVANCE: usize = 5;",
             "/// テキストの行送り量（BMFontのセル高さとは異なります）。", "pub const LINE_ADVANCE: usize = 6;",
             "/// コードポイント順の印刷可能ASCIIグリフ。ビット3が左端ピクセルです。",
             "#[rustfmt::skip]", "pub const GLYPHS: [[u8; 5]; 95] = ["]
    for glyph in glyphs:
        lines.append("    [" + ", ".join(str(v) for v in glyph["rows"]) + "], // " + str(glyph["codepoint"]))
    lines += ["];", "/// アップストリームの明示的な非ASCIIグリフ。", "#[rustfmt::skip]", "pub const EXTRA_GLYPHS: &[(u32, [u8; 5])] = &["]
    extra_codes = set()
    for glyph in data.get("extras", []):
        code = glyph["codepoint"]
        if type(code) is not int or not 126 < code <= 0x10FFFF or 0xD800 <= code <= 0xDFFF or code in extra_codes or len(glyph["rows"]) != 5 or any(type(v) is not int or not 0 <= v <= 15 for v in glyph["rows"]):
            raise ValueError("invalid extra glyph")
        extra_codes.add(code)
        lines.append("    (" + str(glyph["codepoint"]) + ", [" + ", ".join(str(v) for v in glyph["rows"]) + "]),")
    return "\n".join(lines + ["];", ""])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = render(json.loads(SOURCE.read_text(encoding="utf-8")))
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != expected:
            raise SystemExit("font output differs; run python3 tools/generate-font.py")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(expected, encoding="utf-8", newline="\n")
    print("font: 95 validated glyphs; generated data is current")

if __name__ == "__main__":
    main()
