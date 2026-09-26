// サンプルのホストを本物のAddon WASMに接続して検証します。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRuntime,decodeSavedata,luaField} from '@stormcat-works/storm-lua-engine';
import {Simulation} from '../src/session';
import type {LogLine} from '../src/host';
const engine=await loadRuntime({wasmBinary:await readFile(new URL(import.meta.resolve('@stormcat-works/storm-lua-engine/wasm/storm_lua_wasm.wasm')))});
const source=await readFile(new URL('../src/presets/patrol.lua',import.meta.url),'utf8');
const settings={fleetCount:3,throttle:.7,rate:1} as const;

test('Luaが船を生成しTSホストが実際に動かす',()=>{
  const logs:LogLine[]=[];const sim=Simulation.create(engine,source,settings,record=>logs.push(record));
  try{
    assert.equal(sim.world.boats.size,3);assert.equal(sim.host.events.length,0);
    const before=sim.world.snapshot();sim.step(600);assert.equal(sim.world.tick,600);assert.notEqual(sim.world.boats.get(1)!.x,before.boats[0]!.x);
    assert.equal(luaField(decodeSavedata(Uint8Array.from(sim.capture().savedata)),'ticks'),600n);
    sim.chat('/spawn');assert.equal(sim.world.boats.size,4);assert.equal(sim.host.events.length,0);
    sim.chat('/ping');assert.ok(logs.some(l=>l.source==='http'));assert.ok(logs.some(l=>l.message.includes('httpReply')));
    sim.chat('/stop');sim.step(240);assert.ok(sim.world.boats.get(1)!.speed<.2);
  }finally{sim.dispose();}
});
test('チェックポイント復元でtick・船・Lua状態を保ち、二重spawnしない',()=>{
  const first=Simulation.create(engine,source,settings,()=>{});let second:Simulation|undefined;
  try{
    first.step(60);const checkpoint=first.capture();second=Simulation.create(engine,source,settings,()=>{},checkpoint);
    assert.equal(second.world.tick,60);assert.equal(second.world.boats.size,3);assert.deepEqual(second.world.snapshot(),checkpoint.world);
    first.step();second.step();assert.deepEqual(first.world.snapshot(),second.world.snapshot());
  }finally{first.dispose();second?.dispose();}
});
test('壊れたLua・無限loop・保存不能なトップレベルは初期化に失敗する',()=>{
  assert.throws(()=>Simulation.create(engine,'function !',settings,()=>{}));
  assert.throws(()=>Simulation.create(engine,'while true do end',settings,()=>{}),/budget/);
  assert.throws(()=>Simulation.create(engine,'g_savedata.self=g_savedata',settings,()=>{}),/cyclic/);
  const healthy=Simulation.create(engine,'g_savedata={}',settings,()=>{});healthy.dispose();
});
test('未知serverと未対応HTTPは成功stubで隠さず、失敗後は進めない',()=>{
  assert.throws(()=>Simulation.create(engine,'function onCreate() server.missing() end',settings,()=>{}));
  const sim=Simulation.create(engine,'function onTick() server.httpGet(9000,"/external") end',settings,()=>{});
  try{assert.throws(()=>sim.step(),/仮HTTP/);assert.throws(()=>sim.step(),/失敗/);}finally{sim.dispose();}
});
