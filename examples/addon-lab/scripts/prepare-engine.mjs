// ビルド済みエンジンを配信用にコピーします。Rustや生成コメントの書き換えは行いません。
import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../../../', import.meta.url);
const engine = new URL('packages/lua-engine/', root);
const output = new URL('../public/engine/', import.meta.url);
const names = ['storm_lua_wasm.js', 'storm_lua_wasm.wasm'];
for (const name of names) {
  try { await access(new URL(`dist/wasm/${name}`, engine)); }
  catch { throw new Error('実行用WASMがありません。リポジトリルートで node tools/build-wasm.mjs を先に実行してください。'); }
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build'], { cwd: fileURLToPath(engine), stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('エンジンのTypeScriptビルドに失敗しました。');
// このディレクトリは生成物専用です。古い配布ファイルを混ぜずに作り直します。
await rm(output, {recursive: true, force: true});
await mkdir(output, { recursive: true });
for (const name of names) await copyFile(new URL(`dist/wasm/${name}`, engine), new URL(name, output));
for (const name of ['LICENSE','SCREEN_COMPONENTS_LICENSE','THIRD_PARTY_LICENSES.txt','TOOLCHAIN_LICENSES.txt','RUST_STD_LICENSES.html']) await copyFile(new URL(name, engine), new URL(name, output));
console.log('実行用WASMと権利表示を public/engine にコピーしました。');
