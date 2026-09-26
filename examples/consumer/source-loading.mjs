/** v0.2.0: install the SDK, then run this file in the consumer directory. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRuntime} from '@stormcat-works/storm-lua-engine';
const wasmBinary=await readFile(new URL(import.meta.resolve('@stormcat-works/storm-lua-engine/wasm/storm_lua_wasm.wasm')));
const engine=await loadRuntime({wasmBinary});
const sources=new Map([
 ['utility',{name:'@lib/utility.lua',source:'local offset=4\nfunction helper(value)return value+offset end'}],
]);
const requested=[];
const vm=engine.createVehicle({
 environment:'extended',
 requireLoader: name=>{
  const chunk=sources.get(name);
  if(!chunk)throw new Error(`Module not found: ${name}`);
  requested.push(name);
  return chunk;
 },
});
try{
 vm.load('gain=2','@prefix.lua');
 vm.setBreakpoints([{source:'@lib/utility.lua',line:2}]);
 const entry='require("utility")\nfunction onTick()output.setNumber(1,helper(input.getNumber(1))*gain)end';
 assert.equal(vm.load(entry,'@main.lua'),'suspended');
 assert.equal(vm.stack()[0].source,'@lib/utility.lua');
 vm.setBreakpoints([]);vm.resume();
 vm.load('gain=3','@suffix.lua');
 vm.io.inputNumbers[0]=3;vm.tick();assert.equal(vm.io.outputNumbers[0],21);
 vm.reset();vm.io.inputNumbers[0]=3;vm.tick();assert.equal(vm.io.outputNumbers[0],21);
 assert.deepEqual(requested,['utility','utility']);
 console.log('Source-loading consumer: required-file breakpoint, explicit load sequence, reset and cache recreation passed.');
}finally{vm.dispose();}
