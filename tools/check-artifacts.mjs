/** JS/WASM等の配布物にローカル絶対パスが残っていないことを確認します。バイナリは書き換えません。 */
import {readFile, readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve, relative, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export function findPrivatePaths(bytes, localPaths = [homedir(), root, process.env.CARGO_HOME, process.env.CARGO_TARGET_DIR]) {
  const data = Buffer.from(bytes);
  const findings = new Set();
  for (const path of localPaths.filter(Boolean)) {
    if (path === '/' || path === '\\') continue;
    for (const spelling of new Set([path, path.replaceAll('\\','/')])) {
      if (data.includes(Buffer.from(spelling)) || data.includes(Buffer.from(spelling,'utf16le'))) findings.add('local-build-prefix');
    }
  }
  for (const text of [data.toString('utf8'), data.toString('utf16le')]) {
    for (const match of text.matchAll(/(?:\/home\/[^\/\s\x00"'<>]+\/|\/Users\/[^\/\s\x00"'<>]+\/|[A-Z]:[\\/]Users[\\/][^\\/\s\x00"'<>]+[\\/])/gi)) {
      // Emscriptenの仮想FS上の標準ユーザーは、ビルドした個人の情報ではありません。
      if (match[0] !== '/home/web_user/') findings.add('user-home-path');
    }
  }
  return [...findings];
}
async function collect(directory) {
  const result = [];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const path = resolve(directory,entry.name);
    if (entry.isSymbolicLink()) throw new Error('Distribution directory must not contain symlinks');
    if (entry.isDirectory()) result.push(...await collect(path));
    else if (['.wasm','.js','.mjs','.json','.map','.txt','.html','.css','.ts'].includes(extname(path))) result.push(path);
  }
  return result;
}
export async function checkArtifacts(directories) {
  let files=0, wasm=0;
  for (const directory of directories) {
    for (const path of await collect(directory)) {
      files++; if (path.endsWith('.wasm')) wasm++;
      const findings=findPrivatePaths(await readFile(path));
      if (findings.length) throw new Error(`${relative(root,path)}: ${findings.join(', ')}; rebuild with path remapping`);
    }
  }
  if (!wasm) throw new Error('No WASM artifact was checked');
  return {files,wasm};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directories=process.argv.slice(2);
  const result=await checkArtifacts(directories.length ? directories.map(p=>resolve(p)) : [resolve(root,'packages/lua-engine/dist')]);
  console.log(`artifact paths: ${result.files} files (${result.wasm} WASM) passed`);
}
