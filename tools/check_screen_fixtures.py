#!/usr/bin/env python3
"""採用済みの画面契約を検査します。候補実装から期待値を生成・上書きする処理はありません。"""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = "storm-lua-screen-rgba-v1"
CORPUS = "fixtures/screen/cases-v1.json"
FONT = "data/fonts/tiny-4x5.json"
NUMBERS = {
    "setColour": ("r", "g", "b"),
    "clear": (),
    "line": ("x1", "y1", "x2", "y2"),
    "rect": ("x", "y", "w", "h"), "rectF": ("x", "y", "w", "h"),
    "circle": ("x", "y", "radius"), "circleF": ("x", "y", "radius"),
    "triangle": ("x1", "y1", "x2", "y2", "x3", "y3"),
    "triangleF": ("x1", "y1", "x2", "y2", "x3", "y3"),
    "text": ("x", "y"),
    "textBox": ("x", "y", "w", "h", "horizontalAlign", "verticalAlign"),
}

def validate_corpus(data):
    if set(data) != {"format", "contract", "cases"} or data["format"] != 1 or data["contract"] != CONTRACT:
        raise ValueError("unsupported screen corpus format")
    cases = data["cases"]
    if not isinstance(cases, list) or not cases:
        raise ValueError("screen corpus must contain cases")
    names = set()
    for case in cases:
        if set(case) != {"id", "width", "height", "ops", "expectedRgbaRle"}:
            raise ValueError("invalid case fields")
        name = case["id"]
        if not isinstance(name, str) or not name or name in names:
            raise ValueError("invalid or duplicate case ID")
        names.add(name)
        width, height = case["width"], case["height"]
        if any(type(n) is not int or not 1 <= n <= 4096 for n in (width, height)) or width * height * 4 > 16 * 1024 * 1024:
            raise ValueError("invalid screen dimensions")
        ops = case["ops"]
        if not isinstance(ops, list) or len(ops) > 65536:
            raise ValueError("invalid command list")
        text_bytes = 0
        for op in ops:
            if not isinstance(op, dict) or op.get("type") not in NUMBERS:
                raise ValueError("unknown drawing command")
            kind = op["type"]
            required = set(NUMBERS[kind]) | {"type"}
            optional = {"a"} if kind == "setColour" else {"x3", "y3"} if kind == "line" else set()
            if kind in ("text", "textBox"):
                required.add("text")
                if not isinstance(op.get("text"), str):
                    raise ValueError("text must be UTF-8")
                text_bytes += len(op["text"].encode("utf-8"))
            if not required.issubset(op) or set(op) - required - optional:
                raise ValueError("invalid drawing command fields")
            for key in (required | optional) - {"type", "text"}:
                if key in op and (type(op[key]) not in (int, float) or not math.isfinite(op[key])):
                    raise ValueError("drawing coordinates and colors must be finite numbers")
        if text_bytes > 1024 * 1024:
            raise ValueError("text budget exceeded")
        runs = case["expectedRgbaRle"]
        if not isinstance(runs, list) or not runs:
            raise ValueError("expected RGBA is missing")
        pixels = 0
        for run in runs:
            if not isinstance(run, list) or len(run) != 5 or any(type(n) is not int for n in run):
                raise ValueError("RGBA run requires five integers")
            if run[0] <= 0 or any(not 0 <= n <= 255 for n in run[1:]):
                raise ValueError("invalid RGBA run")
            pixels += run[0]
            if pixels > width * height:
                raise ValueError("RGBA run exceeds frame extent")
        if pixels != width * height:
            raise ValueError("RGBA output must cover the whole frame")
    return len(cases)

def verify(root=ROOT):
    manifest = json.loads((root / "fixtures/screen/manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format") != 1 or manifest.get("contract") != CONTRACT or set(manifest.get("files", {})) != {CORPUS, FONT}:
        raise ValueError("invalid screen contract manifest")
    for name, digest in manifest["files"].items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f"screen contract changed without review: {name}")
    count = validate_corpus(json.loads((root / CORPUS).read_text(encoding="utf-8")))
    if count != manifest["cases"]:
        raise ValueError("screen contract case count mismatch")
    return count

if __name__ == "__main__":
    print(f"screen contract: {verify()} complete RGBA cases and font digest verified")
