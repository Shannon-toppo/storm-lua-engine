/** Build the compiler-only WASM asset. Does not build or load the Lua runtime. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnvironment } from './build-paths.mjs';
import { checkArtifacts } from './check-artifacts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let output = resolve(root, 'packages/lua-engine/dist/compiler-wasm');
let name = 'compiler';
for (let i = 0; i < args.length; i += 2) {
  const value = args[i + 1];
  if (!value) throw new Error('Expected a value for each build option');
  if (args[i] === '--out-dir') output = resolve(value);
  else if (args[i] === '--out-name' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) name = value;
  else throw new Error('Usage: build-compiler.mjs [--out-dir PATH] [--out-name NAME]');
}
const metadata = spawnSync('cargo', ['metadata', '--no-deps', '--format-version=1', '--locked', '--offline'], {
  cwd: root, encoding: 'utf8',
});
if (metadata.error) throw metadata.error;
if (metadata.status !== 0) throw new Error(metadata.stderr);
const target = JSON.parse(metadata.stdout).target_directory;
mkdirSync(output, { recursive: true });
const result = spawnSync('wasm-pack', [
  'build', 'crates/storm-lua-compiler-wasm', '--target', 'web', '--release',
  '--out-dir', output, '--out-name', name, '--', '--locked', '--offline',
], { cwd: root, env: buildEnvironment(root, target), stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Compiler WASM build failed (${result.status ?? result.signal})`);
// wasm-pack's generated ignore file otherwise excludes the payload from npm.
rmSync(resolve(output, '.gitignore'), { force: true });
await checkArtifacts([output]);
console.log(`Compiler-only WASM built in ${output}. No publication performed.`);
