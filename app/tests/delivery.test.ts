import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
const policy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'";
test('static HTML adds a unique response nonce without permitting general inline execution',async()=>{
 const environment={ASSETS:{fetch:async()=>new Response('<!doctype html><title>SDK</title>',{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':policy,'cache-control':'public,max-age=60'}})}};
 const request=new Request('https://www.makkii.jp/tools/stormworks/storm-lua-engine/');
 const a=await worker.fetch(request,environment),b=await worker.fetch(request,environment);
 const first=a.headers.get('content-security-policy')!,second=b.headers.get('content-security-policy')!;
 const one=first.match(/'nonce-([A-Za-z0-9+/]{32})'/),two=second.match(/'nonce-([A-Za-z0-9+/]{32})'/);
 assert.ok(one);assert.ok(two);assert.notEqual(one[1],two[1]);
 assert.equal(first.replace(/ 'nonce-[^']+'/g,''),policy);assert.ok(!first.includes('unsafe-inline'));
 assert.equal(a.headers.get('cache-control'),'no-store');assert.equal(await a.text(),'<!doctype html><title>SDK</title>');
});
test('non-HTML and failed asset responses pass through and missing HTML CSP is rejected',async()=>{
 const request=new Request('https://www.makkii.jp/tools/stormworks/storm-lua-engine/engine/test.wasm');
 for(const response of [new Response(new Uint8Array([0,97,115,109]),{headers:{'content-type':'application/wasm'}}),new Response('missing',{status:404})]){
  assert.equal(await worker.fetch(request,{ASSETS:{fetch:async()=>response}}),response);
 }
 await assert.rejects(worker.fetch(request,{ASSETS:{fetch:async()=>new Response('<html>',{headers:{'content-type':'text/html'}})}}),/Content Security Policy/);
});
