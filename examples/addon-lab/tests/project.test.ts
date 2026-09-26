// 保存形式はアプリ側の責務です。破損データを読み込んでも別の状態へ黙って縮退しません。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeSavedata,luaTable} from '@stormcat-works/storm-lua-engine';
import {initialProject,initialUi,encodeProject,decodeProject,parseProject,readLocal,writeLocal,STORAGE_KEY} from '../src/project';
import {World} from '../src/world';
function project(){const p=initialProject('-- 日本語のコード\n');const world=new World();world.spawn('cargo_boat',3,0,4,0);p.checkpoint={source:'g_savedata={n=1}',world:world.snapshot(),savedata:Array.from(encodeSavedata(luaTable({n:1n,raw:new Uint8Array([0,255])})))};return p;}

test('編集中・適用済みコードとワールドとsavedataをまとめて往復する',()=>{
  const p=project();p.logs.push({tick:0,source:'print',message:'こんにちは'});
  assert.deepEqual(decodeProject(encodeProject(p)),p);
});
test('不正version・過大パラメーター・壊れたsavedataを拒否する',()=>{
  const p=project();assert.throws(()=>parseProject({...p,version:2}),/形式/);
  assert.throws(()=>parseProject({...p,settings:{...p.settings,fleetCount:30}}));
  assert.throws(()=>parseProject({...p,checkpoint:{...p.checkpoint,savedata:[255]}}));
  assert.throws(()=>decodeProject('{broken'));
  assert.equal(p.checkpoint!.world.boats.length,1);
});
test('UIはローカル保存のみ、プロジェクト移行には含めない',()=>{
  const storage=new Map<string,string>();const adapter={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);}};
  assert.equal(readLocal(adapter),null);
  const p=project(),ui=initialUi();ui.pane='world';ui.selected=1;ui.camera={position:[1,2,3],target:[0,0,0]};
  writeLocal(adapter,{project:p,ui});assert.deepEqual(readLocal(adapter),{project:p,ui});
  assert.ok(!Object.hasOwn(JSON.parse(encodeProject(p)),'ui'));
  storage.set(STORAGE_KEY,'broken');assert.throws(()=>readLocal(adapter));assert.equal(storage.get(STORAGE_KEY),'broken');
});
