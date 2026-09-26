// 配布JSに含まれる依存のライセンス原文を、lockfileの固定版から集めます。
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
const sections=['Addon Lab — ブラウザ配布物の権利表示','このファイルは依存パッケージの原文を収録します。開発専用ツールは対象外です。'];
sections.push('Rust標準ライブラリの通知原文は engine/RUST_STD_LICENSES.html に収録しています。');
const packages=[];
for(const [path,entry] of Object.entries(lock.packages)){
  if(!path.startsWith('node_modules/')||entry.dev)continue;
  const directory=resolve(root,path),meta=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
  const names=(await readdir(directory)).filter(name=>/^(LICENSE|LICENCE|COPYING|NOTICE)(\.|$)/i.test(name));
  if(meta.name==='@stormcat-works/storm-lua-engine')names.push('SCREEN_COMPONENTS_LICENSE','THIRD_PARTY_LICENSES.txt','TOOLCHAIN_LICENSES.txt');
  if(!names.length)throw new Error(`ライセンス原文が見つかりません: ${meta.name}`);
  sections.push('\n'+'='.repeat(72),`${meta.name} ${meta.version} / ${meta.license??'要確認'}`);
  for(const name of names.sort())sections.push(`\n--- ${name} ---\n`,await readFile(join(directory,name),'utf8'));
  packages.push(`${meta.name}@${meta.version}`);
}
await mkdir(join(root,'public'),{recursive:true});
await writeFile(join(root,'public/THIRD_PARTY_LICENSES.txt'),sections.join('\n')+'\n');
console.log(`${packages.length}個の実行時依存について権利表示を生成しました。`);
