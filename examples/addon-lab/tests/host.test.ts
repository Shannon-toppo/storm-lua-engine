// ホストの署名・戻り値・イベント予約を、Lua実行とは別に検査します。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {type LuaValue} from '@stormcat-works/storm-lua-engine';
import {Host, transform} from '../src/host';
import {World} from '../src/world';
const fixture=()=>{const world=new World();return {world,host:new Host(world,()=>{})};};
const call=(host:Host,name:string,...args:LuaValue[])=>{const fn=host.server[name];assert.ok(fn);return fn(...args);};

test('生成関数は実ワールドを更新しイベントは同期dispatchせず予約する',()=>{
  const {world,host}=fixture();assert.deepEqual(call(host,'spawnVehicle',transform(3,0,4,.5),'rescue_boat'),[1n,true]);
  assert.equal(world.boats.get(1)!.x,3);assert.ok(Math.abs(world.boats.get(1)!.heading-.5)<1e-10);
  assert.deepEqual(host.events.map(e=>e.name),['onVehicleSpawn','onVehicleLoad']);
  assert.equal(host.calls.spawnVehicle,1);
  assert.deepEqual(call(host,'getVehiclePos',99n),[null,false]);
});
test('仮物理にないモデル・キーパッド・傾いたtransformを拒否する',()=>{
  const {world,host}=fixture();
  assert.throws(()=>call(host,'spawnVehicle',transform(0,0,0),'not-a-prefab'),/未登録/);assert.equal(world.boats.size,0);
  call(host,'spawnVehicle',transform(0,0,0),'cargo_boat');
  assert.throws(()=>call(host,'setVehicleKeypad',1n,'arbitrary',1),/接続されていない/);
  assert.throws(()=>call(host,'setVehicleKeypad',1n,'Throttle',2),/値/);
  const tilted=transform(0,0,0);const entries=[...tilted.entries];entries[1]=[2n,.5];
  assert.throws(()=>call(host,'setVehiclePos',1n,{kind:'table',entries}),/回転と平行移動/);
  assert.deepEqual(call(host,'setVehicleKeypad',1n,'Throttle',.4),[true]);assert.equal(world.boats.get(1)!.throttle,.4);
});
test('削除後の存在照会と時計はホスト状態に従う',()=>{
  const {world,host}=fixture();call(host,'spawnVehicle',transform(0,0,0),'rescue_boat');
  assert.deepEqual(call(host,'getVehicleSimulating',1n),[true,true]);
  assert.deepEqual(call(host,'despawnVehicle',1n,true),[true]);assert.equal(world.boats.size,0);
  assert.deepEqual(call(host,'despawnVehicle',1n,true),[false]);
  for(let i=0;i<60;i++)world.step();assert.deepEqual(call(host,'getTimeMillisec'),[1000]);
  assert.deepEqual(call(host,'getPlayerPos',9n),[null,false]);
});
