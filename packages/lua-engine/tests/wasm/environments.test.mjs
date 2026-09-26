import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRuntime,bindingPaths,luaField,luaText,ENVIRONMENT_CATALOG} from '../../dist/index.js';
import {loadCompiler} from '../../dist/compiler.js';
const engine=await loadRuntime({wasmBinary:await readFile(new URL('../../dist/wasm/storm_lua_wasm.wasm',import.meta.url))});
const compiler=await loadCompiler({wasmBinary:await readFile(new URL('../../dist/compiler-wasm/compiler_bg.wasm',import.meta.url))});
const project=source=>({entry:'main',modules:{main:source}});

test('game profile has only debug.log and onLog never enables print',()=>{
 const logs=[];const vm=engine.createVehicle({onLog:r=>logs.push(r)});
 try{
  vm.load('function onTick()local n=0 local good=true for k,v in pairs(debug)do n=n+1 good=good and k=="log" and type(v)=="function"end output.setBool(1,n==1 and good);output.setBool(2,pcall==nil and xpcall==nil and error==nil and assert==nil and print==nil);debug.log("visible")end');vm.tick();
  assert.deepEqual([...vm.io.outputBooleans.slice(0,2)],[1,1]);assert.equal(luaText(logs[0].bytes),'visible');
  assert.throws(()=>vm.enableLogs(),/extended/);
 }finally{vm.dispose();}
 const addon=engine.createAddon();try{addon.load('g_savedata={nilpcall=pcall==nil,nilprint=print==nil,keys=0};for k in pairs(debug)do g_savedata.keys=g_savedata.keys+1 end');addon.start();assert.equal(luaField(addon.savedata(),'nilpcall'),true);assert.equal(luaField(addon.savedata(),'keys'),1n);}finally{addon.dispose();}
 assert.deepEqual(ENVIRONMENT_CATALOG.scriptDebugMembers,['log']);
});
test('all public compiler entries agree on absent functions and preserve local shadowing/nil probes',()=>{
 for(const name of ['pcall','xpcall','error','assert','print','unpack']){
  const source=`function onTick()${name}()end`;
  assert.ok(compiler.analyze(project(source)).diagnostics.some(d=>d.code==='sw-unavailable-global'&&d.severity==='warning'));
  for(const options of [{},{targetSize:8192},{targetSize:1}]){
   const result=compiler.minify(source,options);assert.equal(result.ok,false);assert.ok(result.diagnostics.some(d=>d.code==='sw-unavailable-global'));
   for(const minify of [true,false])assert.equal(compiler.build(project(source),{...options,minify}).ok,false);
  }
 }
 for(const source of ['function onTick()output.setBool(1,type(pcall)=="nil" and error==nil and debug.getinfo==nil)end','local function pcall(x)return x end function onTick()output.setNumber(1,pcall(7))end']){
  const result=compiler.minify(source);assert.equal(result.ok,true,JSON.stringify(result));const vm=engine.createVehicle();try{vm.load(result.code);vm.tick();}finally{vm.dispose();}
 }
});
test('extended pcall and reflected globals retain behavior, literal types and error lines',()=>{
 const source='-- removed comment\n\nfunction onTick()\n local ok,v=pcall(function()\n  error("expected")\n end)\n debug.log(v)\n output.setNumber(1,7)\nend\n';
 for(const targetSize of [undefined,1,8192]){
  const result=compiler.minify(source,{environment:'extended',targetSize});assert.equal(result.ok,true);assert.equal(result.search.mode,'lexical');assert.ok(result.diagnostics.some(d=>d.code==='conservative-minification'));
  const logs=[];for(const text of [source,result.code]){const vm=engine.createVehicle({environment:'extended',onLog:r=>logs.push(luaText(r.bytes))});try{vm.load(text,'=same');vm.tick();assert.equal(vm.io.outputNumbers[0],7);}finally{vm.dispose();}}
  assert.equal(logs[0],logs[1]);assert.match(logs[0],/:5:/);
 }
 const reflect='function originalName()return 9 end function onTick()local key=property.getText("name");output.setNumber(1,_ENV[key]())end';
 const result=compiler.minify(reflect,{targetSize:8192});assert.equal(result.search.mode,'lexical');assert.match(result.code,/originalName/);
 const vm=engine.createVehicle({properties:{name:'originalName'}});try{vm.load(result.code);vm.tick();assert.equal(vm.io.outputNumbers[0],9);}finally{vm.dispose();}
});
test('high-level host overrides and namespace extensions survive reset and match compiler declarations',()=>{
 const calls=[];const bindings={values:{'host.value':11,'pcall':null},functions:{'math.abs':(...args)=>{calls.push(args);return [99];},'host.echo':(...args)=>args}};
 const source='function onTick()output.setNumber(1,math.abs(-3)+host.value);output.setBool(1,pcall==nil);debug.log(host.echo(string.char(0,255),9223372036854775807))end';
 const result=compiler.minify(source,{environment:'extended',hostBindings:bindingPaths(bindings)});assert.equal(result.ok,true);assert.equal(result.search.mode,'lexical');
 const vm=engine.createVehicle({environment:'extended',bindings});try{vm.load(result.code);for(let i=0;i<2;i++){vm.tick();assert.equal(vm.io.outputNumbers[0],110);assert.equal(vm.io.outputBooleans[0],1);assert.equal(calls.length,i+1);assert.equal(calls[i][0],-3n);vm.reset();}}finally{vm.dispose();}
 const addon=engine.createAddon({environment:'extended',bindings:{functions:{'host.double':x=>[Number(x)*2]}},server:{answer:()=>[42n]}});try{addon.load('function onCreate()g_savedata.value=host.double(server.answer())end');addon.start();assert.equal(luaField(addon.savedata(),'value'),84);const saved=addon.savedata();addon.reload(saved);addon.start();assert.equal(luaField(addon.savedata(),'value'),84);}finally{addon.dispose();}
});
test('invalid bindings and environment combinations fail explicitly',()=>{
 for(const call of [
  ()=>engine.createVehicle({bindings:{values:{a:1}}}),
  ()=>engine.createVehicle({environment:'typo'}),
  ()=>engine.createVehicle({devLogs:true}),
  ()=>engine.createVehicle({environment:'extended',bindings:{values:{a:1,'a.b':2}}}),
  ()=>engine.createVehicle({environment:'extended',bindings:{values:{a:1},functions:{a:()=>[]}}}),
  ()=>engine.createAddon({environment:'extended',bindings:{values:{'server.answer':1}},server:{answer:()=>[1]}}),
 ])assert.throws(call);
 assert.equal(compiler.minify('function onTick()end',{hostBindings:['host.foo']}).diagnostics[0].code,'invalid-environment');
 assert.equal(compiler.analyze(project('return 1'),{hostBindings:['host.foo']}).ok,false);
});
test('extended protected loops are bounded and game debugger has no standard debug library',()=>{
 const vm=engine.createVehicle({environment:'extended',instructionBudget:1000});try{assert.throws(()=>vm.load('while true do pcall(function()while true do end end)end'),e=>e.code===2);}finally{vm.dispose();}
 const game=engine.createVehicle();try{game.setBreakpoints([{source:'=test',line:3}]);game.load('local n=1\nfunction onTick()\n n=n+1\n output.setNumber(1,n)\nend','=test');assert.equal(game.tick(),'suspended');assert.equal(game.evaluateWatch('pcall==nil and debug.getinfo==nil and type(debug.log)=="function"').value,true);game.setBreakpoints([]);assert.equal(game.resume(),'completed');assert.equal(game.io.outputNumbers[0],2);}finally{game.dispose();}
});

test('enableLogs does not replace an explicitly overridden print function',()=>{
 const seen=[];
 const vm=engine.createVehicle({environment:'extended',bindings:{functions:{print:(...args)=>{seen.push(args);return [];}}}});
 try{vm.enableLogs();vm.load('print(7)');assert.deepEqual(seen,[[7n]]);vm.reset();assert.deepEqual(seen,[[7n],[7n]]);}finally{vm.dispose();}
});
