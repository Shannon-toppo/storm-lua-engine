import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRuntime,luaField,luaText} from '../../dist/index.js';
const engine=await loadRuntime({wasmBinary:await readFile(new URL('../../dist/wasm/storm_lua_wasm.wasm',import.meta.url))});
const empty={source:'',name:'@empty.lua'};
function provider(sources,calls){return name=>{calls.push(name);const source=sources[name];if(!source)throw new Error(`missing module: ${name}`);return source;};}

test('include-once loader uses same environment and own locals; return list is empty',()=>{
 const calls=[],vm=engine.createVehicle({environment:'extended',requireLoader:provider({lib:{name:'@lib.lua',source:'loads=(loads or 0)+1;local private=4;function helper()return shared+private end;return 99'}},calls)});
 try{
  vm.load('shared=10','@prefix.lua');vm.load('local result=require("lib");require("lib");local n=select("#",require("lib"));function onTick()output.setNumber(1,helper());output.setNumber(2,loads);output.setNumber(3,n);output.setBool(1,result==nil and private==nil)end','@main.lua');vm.load('shared=20','@suffix.lua');
  for(let i=0;i<2;i++){vm.tick();assert.deepEqual(Array.from(vm.io.outputNumbers.slice(0,3)),[24,1,0]);assert.equal(vm.io.outputBooleans[0],1);assert.equal(calls.length,i+1);if(i===0)vm.reset();}
 }finally{vm.dispose();}
});
test('nested and circular requires cache by logical name before executing',()=>{
 const calls=[],logs=[];const sources={a:{name:'@a.lua',source:'trace=trace.."a";require("b");trace=trace.."A"'},b:{name:'@b.lua',source:'trace=trace.."b";require("a");trace=trace.."B"'},alias:{name:'@a.lua',source:'trace=trace.."x"'}};
 const vm=engine.createVehicle({environment:'extended',requireLoader:provider(sources,calls),onLog:r=>logs.push(luaText(r.bytes))});
 try{vm.load('trace="";require("a");require("alias");require("b");debug.log(trace)','@main.lua');assert.deepEqual(logs,['abBAx']);assert.deepEqual(calls,['a','b','alias']);}finally{vm.dispose();}
});
test('source-only host callback returns before executing imported Lua; breakpoints really suspend',()=>{
 const calls=[],vm=engine.createVehicle({environment:'extended',requireLoader:provider({lib:{name:'@lib/helper.lua',source:'local n=4\nshared=n+3\nfunction helper()return shared end'}},calls)});
 try{
  vm.setBreakpoints([{source:'@lib/helper.lua',line:2}]);assert.equal(vm.load('require("lib")\nfunction onTick()output.setNumber(1,helper())end','@main.lua'),'suspended');
  assert.equal(vm.stack()[0].source,'@lib/helper.lua');assert.ok(vm.stack().some(f=>f.source==='@main.lua'));
  assert.throws(()=>vm.load('later=1','@later.lua'),e=>e.code===5);
  vm.setBreakpoints([]);assert.equal(vm.resume('into'),'suspended');assert.equal(vm.resume(),'completed');vm.tick();assert.equal(vm.io.outputNumbers[0],7);assert.deepEqual(calls,['lib']);
  vm.reset();vm.tick();assert.equal(vm.io.outputNumbers[0],7);assert.deepEqual(calls,['lib','lib']);
 }finally{vm.dispose();}
});
test('error caching matches include semantics; missing or syntax-invalid modules can be retried',()=>{
 const calls=[],sources={bad:{source:'count=(count or 0)+1;error("bad module")',name:'@bad.lua'},syntax:{source:'local =',name:'@syntax.lua'}};
 const vm=engine.createVehicle({environment:'extended',requireLoader:provider(sources,calls)});
 try{vm.load('assert(not pcall(require,"missing"));assert(not pcall(require,"missing"));assert(not pcall(require,"syntax"));assert(not pcall(require,"syntax"));local ok,e=pcall(require,"bad");assert(not ok and e:find("bad.lua"));assert(pcall(require,"bad"));assert(count==1)','@main.lua');assert.deepEqual(calls,['missing','missing','syntax','syntax','bad']);}finally{vm.dispose();}
});
test('invalid configuration, source response, bytecode and reentrant host are rejected',()=>{
 for(const config of [{requireLoader:()=>empty},{environment:'extended',requireLoader:7},{environment:'extended',requireLoader:()=>empty,bindings:{values:{require:null}}}])assert.throws(()=>engine.createVehicle(config));
 for(const [resolve,pattern] of [
  [()=>Promise.resolve(empty),/synchronous/], [()=>undefined,/protocol object/],
  [()=>({source:'',name:'bad\0name'}),/chunk name/],
  [()=>({source:new Uint8Array([27,76,117,97]),name:'@binary.lua'}),/binary/],
  [()=>({source:' '.repeat(1024*1024+1),name:'@large.lua'}),/1 MiB/],
 ]){const vm=engine.createVehicle({environment:'extended',requireLoader:resolve});try{assert.throws(()=>vm.load('require("lib")','@main.lua'),pattern);}finally{vm.dispose();}}
 let vm;vm=engine.createVehicle({environment:'extended',requireLoader:()=>{vm.load('x=1','@reentrant.lua');return empty;}});
 try{assert.throws(()=>vm.load('require("lib")','@main.lua'),/Reentrant VM operation/);}finally{vm.dispose();}
});
test('required code shares the running callback instruction budget and phase',()=>{
 const vm=engine.createVehicle({environment:'extended',instructionBudget:1500,requireLoader:()=>({source:'while true do end',name:'@loop.lua'})});
 try{assert.throws(()=>vm.load('while true do pcall(require,"loop")end','@main.lua'),e=>e.code===2);}finally{vm.dispose();}
 const tick=engine.createVehicle({environment:'extended',requireLoader:()=>({source:'output.setNumber(1,input.getNumber(1)*2)',name:'@tick.lua'})});
 try{tick.load('function onTick()require("tick")end');tick.io.inputNumbers[0]=3;tick.tick();assert.equal(tick.io.outputNumbers[0],6);tick.io.inputNumbers[0]=7;tick.tick();assert.equal(tick.io.outputNumbers[0],6);}finally{tick.dispose();}
});
test('failed/abandoned loads do not corrupt the replayable Vehicle program',()=>{
 const vm=engine.createVehicle();
 try{
  vm.load('shared=10;local private=4;function helper()return shared+private end','@prefix.lua');
  vm.load('local n=3;function onTick()output.setNumber(1,helper()+n)end','@main.lua');
  vm.load('shared=20','@suffix.lua');
  assert.throws(()=>vm.load('local =','@syntax.lua'));assert.throws(()=>vm.load('shared=999;absent()','@failed.lua'));
  vm.reset();vm.tick();assert.equal(vm.io.outputNumbers[0],27);
  vm.setBreakpoints([{source:'@unfinished.lua',line:2}]);assert.equal(vm.load('shared=100\nshared=200','@unfinished.lua'),'suspended');
  vm.reset();vm.tick();assert.equal(vm.io.outputNumbers[0],27);
 }finally{vm.dispose();}
});
test('Addon retains its one-entry lifecycle; requires work with restore/reload',()=>{
 const calls=[];const vm=engine.createAddon({environment:'extended',requireLoader:provider({lib:{name:'@addon/lib.lua',source:'local n=7;function helper()return n end'}},calls)});
 try{
  vm.load('require("lib");g_savedata={count=0};function onCreate(new)g_savedata.new=new;g_savedata.n=helper()end;function onTick()g_savedata.count=g_savedata.count+1 end','@addon/main.lua');
  assert.throws(()=>vm.load('extra=1','@extra.lua'),/order/);vm.start();vm.tick();assert.equal(luaField(vm.savedata(),'n'),7n);
  vm.reload(vm.savedata());vm.start();assert.equal(luaField(vm.savedata(),'count'),1n);assert.equal(luaField(vm.savedata(),'new'),false);assert.deepEqual(calls,['lib','lib']);
 }finally{vm.dispose();}
});
