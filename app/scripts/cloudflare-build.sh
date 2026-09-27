#!/usr/bin/env bash
# Workers Buildsだけの一時toolchain。ローカル開発は通常のSDKビルド手順を使う。
set -euo pipefail
if [[ "${WORKERS_CI:-}" != 1 ]]; then
  echo 'This bootstrap is for Cloudflare Workers Builds; use the documented local build commands.' >&2
  exit 2
fi
app="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
root="$(cd -- "$app/.." && pwd)"
tools="$(mktemp -d /tmp/storm-lua-build-tools.XXXXXX)"
trap 'rm -rf -- "$tools"' EXIT
export CARGO_TARGET_DIR=/tmp/cargo-targets/storm-lua-cloud-build
export CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0
mkdir -p "$CARGO_TARGET_DIR"
if ! command -v rustup >/dev/null 2>&1; then
  curl --fail --silent --show-error --location https://sh.rustup.rs -o "$tools/rustup-init.sh"
  sh "$tools/rustup-init.sh" -y --profile minimal --default-toolchain none
fi
export PATH="$HOME/.cargo/bin:$PATH"
rustup toolchain install 1.97.1 --profile minimal
rustup target add --toolchain 1.97.1 wasm32-unknown-unknown wasm32-unknown-emscripten

git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$tools/emsdk"
"$tools/emsdk/emsdk" install 6.0.6
"$tools/emsdk/emsdk" activate 6.0.6
export EM_CONFIG="$tools/emsdk/.emscripten"
export PATH="$tools/emsdk/upstream/emscripten:$tools/emsdk/upstream/bin:$PATH"
cd "$root"
cargo install wasm-pack --version 0.13.1 --locked --root "$tools/wasm-pack"
export PATH="$tools/wasm-pack/bin:$PATH"
cargo fetch --locked
npm --prefix packages/lua-engine ci --no-audit --no-fund
python3 tools/generate-toolchain-licenses.py --check
node tools/build-wasm.mjs
node tools/build-compiler.mjs
npm --prefix packages/lua-engine test
node tools/check-package.mjs
node tools/test-wasm.mjs
npm --prefix app ci --no-audit --no-fund
npm --prefix app run build
npm --prefix app test
node tools/check-artifacts.mjs packages/lua-engine/dist app/dist
printf 'Playground validated from release source %s\n' "${WORKERS_CI_COMMIT_SHA:-$(git rev-parse HEAD)}"
