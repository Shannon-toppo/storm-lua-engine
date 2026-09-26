#!/usr/bin/env python3
"""固定した配布toolchainから権利表示を収集する。ダウンロードや公開は行わない。"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "packages/lua-engine"
EMSCRIPTEN_VERSION = "6.0.6"


def collect(emscripten, sysroot):
    """許諾原文を保持し、SDK内の相対パスとハッシュだけを記録する。"""
    sources = {}
    sections = [
        "Toolchain and system-library notices — Storm Lua Engine\n"
        "Emscripten 6.0.6. Includes a conservative superset of system-library notices;\n"
        "not every listed component is linked into every WASM module.\n"
        "Rust standard-library notices are in RUST_STD_LICENSES.html.\n"
        "These notices do not change the project's own license.\n"
    ]

    def source(name):
        data = (emscripten / name).read_bytes()
        sources[name] = hashlib.sha256(data).hexdigest()
        return data.decode("utf-8")

    names = [
        "LICENSE", "AUTHORS",
        "system/lib/libc/musl/COPYRIGHT",
        "system/lib/compiler-rt/LICENSE.TXT",
        "system/lib/libcxx/LICENSE.TXT",
        "system/lib/libcxxabi/LICENSE.TXT",
        "system/lib/libunwind/LICENSE.TXT",
        "system/lib/llvm-libc/LICENSE.TXT",
    ]
    for name in names:
        sections.append(f"\n{'=' * 72}\n{name}\n{'=' * 72}\n" + source(name))

    # muslの総合通知が参照するファイル別の許諾も保持する。実装本体はコピーしない。
    notices = {}
    for path in sorted((emscripten / "system/lib/libc/musl/src").rglob("*")):
        if path.suffix not in {".c", ".h"}:
            continue
        text = path.read_text(encoding="utf-8")
        blocks = [block for block in re.findall(r"/\*.*?\*/", text, re.S)
                  if re.search(r"copyright|permission (?:is|to)|SPDX-License|public domain", block, re.I)]
        if blocks:
            name = path.relative_to(emscripten).as_posix()
            source(name)
            notices.setdefault("\n\n".join(blocks), []).append(name)
    if not notices:
        raise ValueError("musl file-level notices are missing")
    for text, paths in notices.items():
        sections.append(f"\n{'=' * 72}\n" + "\n".join(paths) + "\n\n" + text + "\n")

    allocator = source("system/lib/dlmalloc.c")
    match = re.search(r"This is a version.*?(?=\n\s*\* Version)", allocator, re.S)
    if match is None:
        raise ValueError("dlmalloc public-domain notice is missing")
    sections.append("\n" + "=" * 72 + "\nsystem/lib/dlmalloc.c — notice\n\n" + match[0] + "\n")

    rust = (sysroot / "share/doc/rust/COPYRIGHT-library.html").read_bytes()
    if b"Copyright notices for The Rust Standard Library" not in rust:
        raise ValueError("Rust standard-library copyright document is missing")
    outputs = {
        "TOOLCHAIN_LICENSES.txt": "\n".join(sections).encode("utf-8"),
        "RUST_STD_LICENSES.html": rust,
    }
    manifest = {
        "emscriptenVersion": EMSCRIPTEN_VERSION,
        "rustVersion": re.search(r'channel = "([^"]+)"', (ROOT / "rust-toolchain.toml").read_text())[1],
        "emscriptenSources": sources,
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in outputs.items()},
    }
    return outputs, (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    compiler = shutil.which("emcc")
    if not compiler:
        raise ValueError("Activate the documented Emscripten SDK before collecting notices")
    version = subprocess.check_output([compiler, "--version"], text=True).splitlines()[0]
    if not re.search(r"\) " + re.escape(EMSCRIPTEN_VERSION) + r"(?: |$)", version):
        raise ValueError(f"Expected Emscripten {EMSCRIPTEN_VERSION}, got {version}")
    sysroot = Path(subprocess.check_output(["rustc", "--print", "sysroot"], cwd=ROOT, text=True).strip())
    outputs, manifest = collect(Path(compiler).resolve().parent, sysroot)
    files = {PACKAGE / name: data for name, data in outputs.items()}
    files[ROOT / "tools/toolchain-licenses.json"] = manifest
    for path, data in files.items():
        if args.check:
            if path.read_bytes() != data:
                raise ValueError(f"Toolchain notice differs: {path.relative_to(ROOT)}")
        else:
            path.write_bytes(data)
    print("Toolchain notices: Emscripten/system libraries and Rust std are current")


if __name__ == "__main__":
    main()
