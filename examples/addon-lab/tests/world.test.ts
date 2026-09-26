// 仮物理の再現性と保存境界を検証します。実ゲームとの適合テストではありません。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World, parseWorld, MAX_BOATS} from '../src/world';

test('同じ入力とtick列から同じ仮ワールドを生成する',()=>{
  const a=new World(),b=new World();
  for(const world of [a,b]){const boat=world.spawn('rescue_boat',0,0,0,0);boat.throttle=.7;boat.steering=.4;for(let i=0;i<600;i++)world.step();}
  assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(a.tick,600);
  assert.ok(Math.abs(a.boats.get(1)!.x)>1);assert.ok(a.boats.get(1)!.speed>8);
});
test('snapshotと復元したワールドは元の可変オブジェクトを共有しない',()=>{
  const a=new World();a.spawn('cargo_boat',1,0,2,0);const snapshot=a.snapshot();const b=new World(snapshot);
  a.boats.get(1)!.x=5;b.boats.get(1)!.z=9;
  assert.equal(snapshot.boats[0]!.x,1);assert.equal(snapshot.boats[0]!.z,2);assert.equal(a.boats.get(1)!.z,2);
});
test('不正な位置・重複ID・モデル・次IDはrestore前に拒否する',()=>{
  const world=new World();world.spawn('rescue_boat',0,0,0,0);const state=world.snapshot();
  for(const patch of [{x:Infinity},{id:state.nextId},{kind:'unknown'},{throttle:2},{heading:100}])assert.throws(()=>parseWorld({...state,boats:[{...state.boats[0],...patch}]}));
  assert.throws(()=>parseWorld({...state,boats:[state.boats[0],state.boats[0]]}));
});
test('無制限の生成はせずサンプルの上限を明示する',()=>{
  const world=new World();for(let i=0;i<MAX_BOATS;i++)world.spawn('cargo_boat',0,0,0,0);
  assert.throws(()=>world.spawn('rescue_boat',0,0,0,0),/上限/);assert.equal(world.boats.size,MAX_BOATS);
});
