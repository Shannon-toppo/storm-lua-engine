/** 実際のパッケージ化されたWASMのテスト。成果物の欠落や空のスイートはスキップせず失敗とします。 */
import {spawnSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const directory=new URL('packages/lua-engine/tests/wasm/',root);
const files=(await readdir(directory)).filter(name=>name.endsWith('.test.mjs')).sort();
assert.ok(files.length>0,'WASM test suite must not be empty');
const suite=spawnSync(process.execPath,['--test',...files.map(name=>fileURLToPath(new URL(name,directory)))],{stdio:'inherit'});
if(suite.error)throw suite.error;
if(suite.status!==0)process.exit(suite.status??1);
if(process.argv.includes('--with-tests')){
  const create=(await import(new URL('artifacts/wasm-tests/lua_backend.js',root).href)).default;
  const backend=await create({wasmBinary:await readFile(new URL('artifacts/wasm-tests/lua_backend.wasm',root))});
  assert.equal(backend._sle_test_lua_backend(),0);console.log('Independent Lua backend probe passed');
}
