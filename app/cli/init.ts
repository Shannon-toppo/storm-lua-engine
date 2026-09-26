/** インストール済みSDKの配布アセットだけを読みます。リポジトリ内部へ依存しません。 */
import {readFile} from 'node:fs/promises';
import type {SessionInit} from '../shared/session.js';
export async function nodeInit():Promise<SessionInit> {
 const base=new URL('.',import.meta.resolve('@stormcat-works/storm-lua-engine'));
 return {
  runtime:{moduleUrl:new URL('wasm/storm_lua_wasm.js',base),wasmBinary:new Uint8Array(await readFile(new URL('wasm/storm_lua_wasm.wasm',base)))},
  compiler:{moduleUrl:new URL('compiler-wasm/compiler.js',base),wasmBinary:new Uint8Array(await readFile(new URL('compiler-wasm/compiler_bg.wasm',base)))},
  raster:{wasmBinary:new Uint8Array(await readFile(new URL('wasm/screen.wasm',base)))},
 };
}
