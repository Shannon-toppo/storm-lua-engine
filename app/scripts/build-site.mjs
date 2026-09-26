/** 専用ルートに静的成果物を配置するだけで、デプロイは行いません。 */
import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'dist-site');
await rm(out,{recursive:true,force:true});await mkdir(join(out,'tools/stormworks/storm-lua-engine'),{recursive:true});
await cp(join(root,'dist'),join(out,'tools/stormworks/storm-lua-engine'),{recursive:true});
await writeFile(join(out,'_headers'),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/tools/stormworks/storm-lua-engine/engine/*
  Cache-Control: no-cache
/tools/stormworks/storm-lua-engine/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
console.log('Playground assets ready under /tools/stormworks/storm-lua-engine/. No deployment performed.');
