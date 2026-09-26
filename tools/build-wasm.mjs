/** 独立したラスタライザとEmscriptenランタイムモジュールをビルドします。自動公開は行いません。 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {buildEnvironment} from './build-paths.mjs';
import {checkArtifacts} from './check-artifacts.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const arguments_=process.argv.slice(2);
if(arguments_.some(value=>value!=='--with-tests'))throw new Error('usage: node tools/build-wasm.mjs [--with-tests]');
const withTests=arguments_.includes('--with-tests');
const exportsManifest=JSON.parse(readFileSync(join(root,'tools/wasm-exports.json'),'utf8'));
function run(args,env=process.env){
  const result=spawnSync('cargo',args,{cwd:root,env,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`cargo ${args.join(' ')} failed (${result.status ?? result.signal})`);
}
const metadata=spawnSync('cargo',['metadata','--no-deps','--format-version=1','--locked'],{cwd:root,encoding:'utf8'});
if(metadata.error)throw metadata.error;
if(metadata.status!==0)throw new Error(metadata.stderr);
const target=JSON.parse(metadata.stdout).target_directory;
const output=join(root,'packages/lua-engine/dist/wasm');mkdirSync(output,{recursive:true});
const distributionEnvironment=buildEnvironment(root,target);
run(['build','-p','storm-screen-wasm','--target','wasm32-unknown-unknown','--release','--locked'],distributionEnvironment);
copyFileSync(join(target,'wasm32-unknown-unknown/release/storm_screen_wasm.wasm'),join(output,'screen.wasm'));

function emsEnvironment(exports){
  // 各CオブジェクトとRustリンクは例外ABIについて一致している必要があります。
  const flags=`-s EMIT_EMSCRIPTEN_LICENSE=1 -s DEFAULT_TO_CXX=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_FUNCTIONS=${JSON.stringify(exports)} -s EXPORTED_RUNTIME_METHODS=['HEAPU8']`;
  const env={...distributionEnvironment,EMCC_CFLAGS:[process.env.EMCC_CFLAGS,'-fwasm-exceptions'].filter(Boolean).join(' ')};
  // CARGO_ENCODED_RUSTFLAGS はこのビルドにスコープされ、グローバル設定には書き込まれません。
  const inherited=distributionEnvironment.CARGO_ENCODED_RUSTFLAGS;
  if(process.env.RUSTFLAGS&&!inherited)throw new Error('Use CARGO_ENCODED_RUSTFLAGS instead of ambiguous RUSTFLAGS for this build');
  env.CARGO_ENCODED_RUSTFLAGS=[inherited,'-C',`link-args=${flags}`,'-C','link-arg=--js-library','-C',`link-arg=${join(root,'tools/host-library.js')}`].filter(Boolean).join('\x1f');
  return env;
}
function copyEms(base,destination){
  mkdirSync(destination,{recursive:true});
  writeFileSync(join(destination,'package.json'),JSON.stringify({type:'module'})+'\n');
  for(const extension of ['.js','.wasm']){
    const source=base+extension;
    if(!existsSync(source))throw new Error(`missing Emscripten artifact ${source}`);
    copyFileSync(source,join(destination,source.split(/[\\/]/).at(-1)));
  }
}
run(['build','-p','storm-lua-wasm','--bin','storm_lua_wasm','--features','debug','--target','wasm32-unknown-emscripten','--release','--locked'],
  emsEnvironment(['_main',...exportsManifest.sle.map(name=>'_'+name)]));
copyEms(join(target,'wasm32-unknown-emscripten/release/storm_lua_wasm'),output);
if(withTests){
  run(['build','-p','storm-lua-conformance','--example','lua_backend','--target','wasm32-unknown-emscripten','--release','--locked'],
    emsEnvironment(['_main','_sle_test_lua_backend']));
  copyEms(join(target,'wasm32-unknown-emscripten/release/examples/lua_backend'),join(root,'artifacts/wasm-tests'));
}
await checkArtifacts([output]);
console.log('WASM runtime (with debug) and raster artifacts built. No publication performed.');
