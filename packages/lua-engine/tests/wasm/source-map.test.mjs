import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TraceMap,eachMapping,originalPositionFor} from '@jridgewell/trace-mapping';
import {loadRuntime} from '../../dist/index.js';
import {loadCompiler} from '../../dist/compiler.js';
const engine=await loadRuntime({wasmBinary:await readFile(new URL('../../dist/wasm/storm_lua_wasm.wasm',import.meta.url))});
const compiler=await loadCompiler({wasmBinary:await readFile(new URL('../../dist/compiler-wasm/compiler_bg.wasm',import.meta.url))});
const chunk='@map-test.lua';
function build(modules,options={}){
 const result=compiler.build({entry:'main',modules},{environment:'game',minify:false,...options});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(typeof result.map,'string');
 return {...result,trace:new TraceMap(result.map),rawMap:JSON.parse(result.map)};
}
function points(map,file,line){const lines=new Set();eachMapping(map,token=>{if(token.source===file&&token.originalLine===line)lines.add(token.generatedLine);});return [...lines].map(line=>({source:chunk,line}));}
function position(map,frame){assert.equal(frame.source,chunk);return originalPositionFor(map,{line:frame.line,column:0});}

test('actual game VM maps library and caller breakpoints and step results to original files',()=>{
 const modules={main:'local m=require("lib.module")\nfunction onTick()\n output.setNumber(1,m.twice(4))\n output.setBool(1,pcall==nil and print==nil and require==nil)\nend\n','lib.module':'local M={}\nfunction M.twice(x)\n local answer=x*2\n return answer\nend\nreturn M\n'};
 const result=build(modules);
 const vm=engine.createVehicle();
 try{
  vm.load(result.code,chunk);const bp=points(result.trace,'lib/module.lua',3);assert.ok(bp.length>0);vm.setBreakpoints(bp);assert.equal(vm.tick(),'suspended');
  const stack=vm.stack();assert.deepEqual([position(result.trace,stack[0]).source,position(result.trace,stack[0]).line],['lib/module.lua',3]);
  assert.ok(stack.some(f=>{const p=position(result.trace,f);return p.source==='main.lua'&&p.line===3;}));
  vm.setBreakpoints([]);assert.equal(vm.resume('over'),'suspended');assert.equal(position(result.trace,vm.stack()[0]).line,4);assert.equal(vm.resume(),'completed');
  assert.equal(vm.io.outputNumbers[0],8);assert.equal(vm.io.outputBooleans[0],1);assert.deepEqual(points(result.trace,'missing.lua',1),[]);assert.deepEqual(points(result.trace,'lib/module.lua',99),[]);
 }finally{vm.dispose();}
 assert.equal(result.rawMap.version,3);assert.deepEqual(result.rawMap.names,[]);
 for(const [index,name] of result.rawMap.sources.entries())assert.equal(result.rawMap.sourcesContent[index],modules[name.replace(/\.lua$/,'').replaceAll('/','.')]);
});

test('runtime error in a return-value module maps to its real file/line without pcall',()=>{
 const result=build({main:'local f=require("bad")\nfunction onTick()f()end',bad:'return function()\n local a\n return a.field\nend'});const vm=engine.createVehicle();
 try{vm.load(result.code,chunk);assert.throws(()=>vm.tick(),error=>{const match=/map-test\.lua:(\d+):/.exec(error.message);assert.ok(match,error.message);const p=originalPositionFor(result.trace,{line:Number(match[1]),column:0});return p.source==='bad.lua'&&p.line===3;});}finally{vm.dispose();}
});

test('generated-only lines stay unmapped and never refer beyond source EOF',()=>{
 for(const lib of ['side=7','return {n=7}','if flag then return 7 end\nreturn 8','return function(x)\n return x+1\nend','']){
  const result=build({main:'local m=require("lib")\nfunction onTick()end',lib});
  eachMapping(result.trace,entry=>{if(entry.source===null)return;const index=result.rawMap.sources.indexOf(entry.source);const count=result.rawMap.sourcesContent[index].split('\n').length;assert.ok(entry.originalLine>=1&&entry.originalLine<=count,JSON.stringify(entry));});
  for(const [index,line] of result.code.split('\n').entries())if(line==='do'||line.startsWith('if __stormmin_link_')||line.startsWith('local __stormmin_link_')){
   assert.equal(originalPositionFor(result.trace,{line:index+1,column:0}).source,null,`synthetic source assigned: ${line}`);
  }
 }
});

test('CRLF and embedded Unicode source survive in map content and debugger line numbers',()=>{
 const lib='-- 日本語\r\nreturn function(x)\r\n local caption = "値"\r\n return x\r\nend';
 const result=build({main:'local f=require("lib")\r\nfunction onTick()output.setNumber(1,f(5))end\r\n',lib});
 const vm=engine.createVehicle();try{vm.load(result.code,chunk);vm.setBreakpoints(points(result.trace,'lib.lua',4));assert.equal(vm.tick(),'suspended');assert.equal(position(result.trace,vm.stack()[0]).line,4);vm.setBreakpoints([]);vm.resume();assert.equal(vm.io.outputNumbers[0],5);}finally{vm.dispose();}
 assert.ok(result.rawMap.sourcesContent.includes(lib));
});

test('original lint positions, injected ambient origins and omitted optimized maps remain distinct',()=>{
 const project={entry:'main',modules:{main:'local f=require("lib")\nfunction onTick()output.setNumber(1,f())end',lib:'return function()\n return missingName+1\nend'}};
 const lint=compiler.analyze(project);assert.ok(lint.diagnostics.some(d=>d.module==='lib'&&d.range?.line===2&&d.code==='undefined-global'));
 const ambient=compiler.build({entry:'main',modules:{main:'function onTick()output.setNumber(1,sim.value())end'},ambient:{sim:{members:{value:{kind:'module',source:'return function()\n return 11\nend'}}}}},{minify:false});
 assert.equal(ambient.ok,true);const map=new TraceMap(ambient.map);const vm=engine.createVehicle();try{vm.load(ambient.code,chunk);vm.setBreakpoints(points(map,'sim/value.lua',2));assert.equal(vm.tick(),'suspended');assert.deepEqual([position(map,vm.stack()[0]).source,position(map,vm.stack()[0]).line],['sim/value.lua',2]);vm.setBreakpoints([]);vm.resume();assert.equal(vm.io.outputNumbers[0],11);}finally{vm.dispose();}
 const optimized=compiler.build({entry:'main',modules:{main:'function onTick()output.setNumber(1,1+2)end'}},{minify:true});assert.equal(optimized.ok,true);assert.equal(optimized.map,undefined);
});
