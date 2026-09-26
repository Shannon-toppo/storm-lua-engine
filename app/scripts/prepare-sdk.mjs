/** インストールしたSDKの配布済みアセットを静的Webへ配置します。 */
import {readFile,mkdir,rm,cp,copyFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const packageRoot=dirname(dirname(fileURLToPath(import.meta.resolve('@stormcat-works/storm-lua-engine'))));
const app=fileURLToPath(new URL('../',import.meta.url)),output=join(app,'public/engine');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const name of ['storm_lua_wasm.js','storm_lua_wasm.wasm','screen.wasm'])await copyFile(join(packageRoot,'dist/wasm',name),join(output,name));
await cp(join(packageRoot,'dist/compiler-wasm'),join(output,'compiler'),{recursive:true});
for(const name of ['LICENSE','SCREEN_COMPONENTS_LICENSE','THIRD_PARTY_LICENSES.txt','TOOLCHAIN_LICENSES.txt','RUST_STD_LICENSES.html'])await copyFile(join(packageRoot,name),join(output,name));
const metadata=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));console.log(`Prepared SDK ${metadata.version}: runtime / raster / compiler. No source upload endpoint.`);

const projectLicense=await readFile(join(packageRoot,'LICENSE'),'utf8');
const viteLicense=await readFile(join(app,'node_modules/vite/LICENSE.md'),'utf8');
await writeFile(join(app,'public/THIRD_PARTY_LICENSES.txt'),`Storm Lua Engine: Playground\n\n${projectLicense}\n\nVite-generated browser helpers\n\n${viteLicense}`);
