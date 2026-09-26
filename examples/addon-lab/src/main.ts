import './style.css';
import {fromEmscripten, decodeSavedata, type LuaEngine, type LuaValue} from '@stormcat-works/storm-lua-engine';
import {CodePanel, type FileTab} from './editor';
import {WorldView} from './scene';
import {Simulation} from './session';
import {BOAT_TYPES} from './world';
import {HOST_API, type LogLine} from './host';
import {initialProject, initialUi, readLocal, writeLocal, decodeProject, encodeProject, parseSettings, type Project} from './project';
import patrol from './presets/patrol.lua?raw';
import events from './presets/events.lua?raw';
const element=<T extends HTMLElement>(id:string):T=>{const node=document.getElementById(id);if(!node)throw new Error(`要素がありません: ${id}`);return node as T;};
const app=element('app'), errorBox=element('error');
let project=initialProject(patrol),ui=initialUi(),engine:LuaEngine|undefined,simulation:Simulation|undefined,view:WorldView|undefined;
let running=false,failed=false,storageAllowed=true,output:'logs'|'savedata'|'api'='logs';
let accumulator=0,lastFrame=0,lastUi=0,lastSave=0,saveTimer:ReturnType<typeof setTimeout>|undefined,frameId=0;
let restored=false;
try {const saved=readLocal(localStorage);if(saved){project=saved.project;ui=saved.ui;restored=true;}}
catch(error){storageAllowed=false;errorBox.hidden=false;errorBox.textContent=`ローカル保存の読み込みに失敗しました。元データを上書きしません。\n${String(error)}`;}
function message(source:string,message:string,tick=simulation?.world.tick??0):void {
  project.logs.push({source,message:message.length>2048?message.slice(0,2010)+' … [画面の文字数上限]':message,tick});
  if(project.logs.length>200)project.logs.splice(0,project.logs.length-200);
  renderLogs();
}
function collect(record:LogLine):void {message(record.source,record.message,record.tick);}
function errorText(error:unknown):string {
  if(error instanceof AggregateError)return error.errors.map(errorText).join('\n');
  return error instanceof Error?error.message:String(error);
}
function report(error:unknown):void {
  running=false;failed=true;accumulator=0;
  const text=errorText(error);errorBox.hidden=false;errorBox.textContent=text;
  message('error',text);editor.focusError(text);renderControls();
}
function currentSettings():Project['settings'] {
  return parseSettings({fleetCount:Number(element<HTMLInputElement>('fleet-count').value),throttle:Number(element<HTMLInputElement>('throttle').value),rate:Number(element<HTMLSelectElement>('rate').value)});
}
function syncSettings():void {
  element<HTMLInputElement>('fleet-count').value=String(project.settings.fleetCount);
  element<HTMLInputElement>('throttle').value=String(project.settings.throttle);
  element<HTMLSelectElement>('rate').value=String(project.settings.rate);
}
function renderControls():void {
  const ready=!!simulation&&!failed;
  app.dataset.phase=failed?'error':engine?(running?'running':'paused'):'loading';
  element('status').textContent=failed?'実行エラー':engine?(running?'実行中':'一時停止'):'WASMを準備中';
  element('status-dot').className=failed?'error':running?'running':'';
  element<HTMLButtonElement>('apply').disabled=!engine;
  element<HTMLButtonElement>('play').disabled=!ready;
  element<HTMLButtonElement>('play').textContent=running?'一時停止':'再生';
  element<HTMLButtonElement>('step').disabled=!ready||running;
  element<HTMLButtonElement>('send').disabled=!ready;
  element<HTMLButtonElement>('export').disabled=!engine;
  element('draft-state').textContent=ui.file==='lua'?(simulation&&simulation.source!==project.draft?'未適用の変更':'Lua 5.3'):'読み取り専用';
  element('editor-hint').textContent=ui.file==='lua'?'Ctrl / ⌘ + Enter で適用':'この実装はサンプルアプリ側にあります';
}
function renderLogs():void {
  element('log-count').textContent=String(project.logs.length);
  if(output!=='logs')return;
  const container=element('output-logs'),stick=container.scrollHeight-container.scrollTop-container.clientHeight<30;
  const fragment=document.createDocumentFragment();
  for(const log of project.logs){
    const row=document.createElement('div');row.className='log-row';
    const time=document.createElement('span');time.className='log-time';time.textContent=(log.tick/60).toFixed(2)+'s';
    const source=document.createElement('span');source.className='log-source';source.dataset.source=log.source;source.textContent=log.source;
    const message=document.createElement('span');message.className='log-message';message.textContent=log.message;
    row.append(time,source,message);fragment.append(row);
  }
  container.replaceChildren(fragment);if(stick)container.scrollTop=container.scrollHeight;
}
function pretty(value:LuaValue):unknown {
  if(typeof value==='bigint')return `${value} (integer)`;
  if(value instanceof Uint8Array){try{return new TextDecoder('utf-8',{fatal:true}).decode(value);}catch{return {bytes:Array.from(value)};}}
  if(value&&typeof value==='object')return value.entries.map(([key,item])=>({key:pretty(key),value:pretty(item)}));
  return value;
}
function renderSavedata():void {
  if(output!=='savedata')return;
  try {element('output-savedata').textContent=project.checkpoint?JSON.stringify(pretty(decodeSavedata(Uint8Array.from(project.checkpoint.savedata))),null,2):'まだチェックポイントがありません。';}
  catch(error){element('output-savedata').textContent=errorText(error);}
}
function renderApi():void {
  if(output!=='api')return;
  const table=document.createElement('table');table.className='api-table';
  const head=document.createElement('tr');for(const title of ['TSホストの関数','引数','戻り値','呼出数','サンプル内の動作']){const th=document.createElement('th');th.textContent=title;head.append(th);}table.append(head);
  for(const [name,args,returns,description] of HOST_API){
    const row=document.createElement('tr');for(const value of [`server.${name}`,args,returns,String(simulation?.host.calls[name]??0),description]){const td=document.createElement('td');td.textContent=value;row.append(td);}table.append(row);
  }
  element('output-api').replaceChildren(table);
}
function renderWorld():void {
  if(!simulation)return;
  const world=simulation.world;app.dataset.tick=String(world.tick);element('tick').textContent=`TICK ${world.tick.toLocaleString('ja-JP')}`;
  element('boat-count').textContent=`${world.boats.size} 隻`;
  if(ui.selected===null||!world.boats.has(ui.selected))ui.selected=world.boats.keys().next().value??null;
  const list=element('boat-list');const previous=list.scrollTop;const fragment=document.createDocumentFragment();
  for(const boat of world.boats.values()){
    const button=document.createElement('button');button.type='button';button.setAttribute('role','listitem');button.setAttribute('aria-pressed',String(boat.id===ui.selected));button.dataset.vehicleId=String(boat.id);
    const swatch=document.createElement('span');swatch.className='swatch';swatch.style.backgroundColor='#'+BOAT_TYPES[boat.kind].color.toString(16);
    const label=document.createElement('span');label.textContent=boat.tooltip;
    const id=document.createElement('span');id.className='id';id.textContent='#'+boat.id;
    button.append(swatch,label,id);button.onclick=()=>{ui.selected=boat.id;renderWorld();scheduleSave();};fragment.append(button);
  }
  list.replaceChildren(fragment);list.scrollTop=previous;
  const selected=ui.selected===null?undefined:world.boats.get(ui.selected),detail=element('boat-detail');
  detail.replaceChildren();
  if(selected){
    const title=document.createElement('div');title.className='detail-name';title.textContent=`#${selected.id} ${selected.tooltip}`;
    const dl=document.createElement('dl');dl.className='detail-grid';
    for(const [label,value] of [['速度',`${selected.speed.toFixed(1)} m/s`],['X',selected.x.toFixed(1)],['Z',selected.z.toFixed(1)],['スロットル',selected.throttle.toFixed(2)],['舵',selected.steering.toFixed(2)],['方位',`${(selected.heading*180/Math.PI).toFixed(0)}°`]] as const){
      const group=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;group.append(dt,dd);dl.append(group);
    }
    detail.append(title,dl);
  }else detail.textContent='船を選択してください';
  renderApi();
}
function persist(capture=true):void {
  if(capture&&simulation&&!failed)project.checkpoint=simulation.capture();
  if(view)ui.camera=view.cameraState();
  if(!storageAllowed){element('save-status').textContent='保存エラー · 元データは未変更';return;}
  try {writeLocal(localStorage,{project,ui});element('save-status').textContent='ブラウザに保存済み · 再読込後は一時停止';}
  catch(error){storageAllowed=false;errorBox.hidden=false;errorBox.textContent=`ローカル保存に失敗しました。書き出しでデータを保管してください。\n${errorText(error)}`;element('save-status').textContent='自動保存に失敗';}
  renderSavedata();
}
function scheduleSave():void {
  if(saveTimer)clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{try{persist(false);}catch(error){report(error);}},250);
}
function apply():void {
  if(!engine)return;
  running=false;accumulator=0;
  try {
    if(project.draft.length>65536)throw new Error('このサンプルのソースは65536文字以内です。');
    const settings=currentSettings(),pending:LogLine[]=[];
    const next=Simulation.create(engine,project.draft,settings,record=>pending.push(record));
    // 初期化中のエラーは旧セッションを壊しません。成功した時だけ丸ごと交換します。
    const checkpoint=next.capture();
    simulation?.dispose();simulation=next;
    // ホストとVMのログは、Lua実行から戻ってから同じキューで画面へ配送します。
    pending.forEach(collect);pending.length=0;
    sessionLogQueue=pending;
    project.settings=settings;project.checkpoint=checkpoint;failed=false;errorBox.hidden=true;ui.selected=null;
    renderControls();renderWorld();persist();
  }catch(error){report(error);persist(false);}
}
let sessionLogQueue:LogLine[]=[];
function flushSessionLogs():void {for(const item of sessionLogQueue.splice(0))collect(item);}
function restore(nextProject:Project):void {
  if(!engine)throw new Error('WASMを準備しています。');
  const pending:LogLine[]=[];
  const checkpoint=nextProject.checkpoint;
  const next=Simulation.create(engine,checkpoint?.source??nextProject.draft,nextProject.settings,record=>pending.push(record),checkpoint??undefined);
  const captured=next.capture();
  simulation?.dispose();simulation=next;project=nextProject;project.checkpoint=captured;sessionLogQueue=pending;
  failed=false;running=false;errorBox.hidden=true;accumulator=0;syncSettings();
  flushSessionLogs();renderControls();renderWorld();
}
const editor=new CodePanel(element('editor'),project.draft,(source,anchor,head)=>{
  project.draft=source;ui.selection={anchor,head};
  const before=source.slice(0,head);element('cursor').textContent=`${before.split('\n').length}行 / ${head-before.lastIndexOf('\n')}列`;
  renderControls();scheduleSave();
},apply);
function fileTab(file:FileTab):void {
  ui.file=file;editor.tab(file);
  document.querySelectorAll<HTMLButtonElement>('[data-file]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.file===file)));
  renderControls();scheduleSave();
}
function pane(value:'code'|'world'):void {
  ui.pane=value;app.dataset.pane=value;
  document.querySelectorAll<HTMLButtonElement>('[data-pane]').forEach(button=>button.classList.toggle('active',button.dataset.pane===value));
  view?.resize();scheduleSave();
}
function outputTab(value:typeof output):void {
  output=value;
  for(const name of ['logs','savedata','api'])element(`output-${name}`).hidden=name!==value;
  document.querySelectorAll<HTMLButtonElement>('[data-output]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.output===value)));
  renderLogs();renderSavedata();renderApi();
}
function action(fn:()=>void):()=>void {return ()=>{try{fn();flushSessionLogs();renderControls();renderWorld();persist();}catch(error){flushSessionLogs();report(error);persist(false);}};}
element('apply').onclick=apply;
element('play').onclick=action(()=>{running=!running;lastFrame=0;accumulator=0;});
element('step').onclick=action(()=>simulation?.step());
element('camera').onclick=()=>{if(simulation)view?.focus(simulation.world,ui.selected);scheduleSave();};
element('rate').onchange=action(()=>{project.settings.rate=currentSettings().rate;});
for(const id of ['fleet-count','throttle'])element(id).onchange=()=>{try{project.settings=currentSettings();scheduleSave();}catch(error){report(error);}};
element<HTMLFormElement>('chat-form').onsubmit=event=>{event.preventDefault();action(()=>simulation?.chat(element<HTMLInputElement>('chat').value))();};
element('clear-logs').onclick=()=>{project.logs=[];renderLogs();scheduleSave();};
element('preset-load').onclick=()=>{
  const next=element<HTMLSelectElement>('preset').value==='events'?events:patrol;
  if(project.draft!==next&&!confirm('編集中のコードを選んだサンプルへ置き換えますか？ ワールドへの適用は別操作です。'))return;
  fileTab('lua');editor.replace(next);scheduleSave();
};
document.querySelectorAll<HTMLButtonElement>('[data-file]').forEach(button=>button.onclick=()=>fileTab(button.dataset.file as FileTab));
document.querySelectorAll<HTMLButtonElement>('[data-pane]').forEach(button=>button.onclick=()=>pane(button.dataset.pane as 'code'|'world'));
document.querySelectorAll<HTMLButtonElement>('[data-output]').forEach(button=>button.onclick=()=>outputTab(button.dataset.output as typeof output));
element('help').onclick=()=>element<HTMLDialogElement>('guide').showModal();element('close-help').onclick=()=>element<HTMLDialogElement>('guide').close();
element('export').onclick=()=>{
  try {
    persist();const blob=new Blob([encodeProject(project)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='addon-lab-project.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){report(error);}
};
element('import').onclick=()=>element<HTMLInputElement>('import-file').click();
element<HTMLInputElement>('import-file').onchange=async event=>{
  const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;
  try {
    if(file.size>12*1024*1024)throw new Error('ファイルは12MiB以内です。');
    const next=decodeProject(await file.text());
    if(!confirm('現在のプロジェクトを読み込んだデータへ置き換えますか？'))return;
    restore(next);storageAllowed=true;ui=initialUi();editor.replace(project.draft);pane('code');fileTab('lua');persist();
  }catch(error){errorBox.hidden=false;errorBox.textContent=`読み込みを中止しました。現在のプロジェクトは保持しています。\n${errorText(error)}`;}
  finally {input.value='';}
};
function animate(time:number):void {
  frameId=requestAnimationFrame(animate);
  if(!simulation)return;
  if(lastFrame===0)lastFrame=time;
  const elapsed=Math.min((time-lastFrame)/1000,0.1);lastFrame=time;
  if(running&&!failed){
    accumulator+=elapsed*project.settings.rate;
    try {
      let steps=0;while(accumulator>=1/60&&steps<24){simulation.step();accumulator-=1/60;steps++;}
      flushSessionLogs();
    }catch(error){flushSessionLogs();report(error);}
  }
  view?.draw(simulation.world,ui.selected);
  if(time-lastUi>160){renderWorld();lastUi=time;}
  if(time-lastSave>1000){try{persist();}catch(error){report(error);}lastSave=time;}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;accumulator=0;renderControls();try{persist();}catch(error){report(error);}}});
window.addEventListener('pagehide',()=>{try{persist();}catch(error){console.error('終了時の保存に失敗しました',error);}});
async function boot():Promise<void> {
  try {
    syncSettings();editor.select(ui.selection.anchor,ui.selection.head);fileTab(ui.file);pane(ui.pane);renderLogs();
    view=new WorldView(element('viewport'),id=>{ui.selected=id;renderWorld();scheduleSave();},scheduleSave,report);view.restoreCamera(ui.camera);
    // Emscriptenのローダーは変換せず配信します。アプリ本体はnpmの公開APIだけを使用します。
    const base=new URL(import.meta.env.BASE_URL,location.href);
    const url=new URL('engine/storm_lua_wasm.js',base).href;
    const module:unknown=await import(/* @vite-ignore */ url);
    if(!module||typeof module!=='object'||!('default' in module)||typeof module.default!=='function')throw new Error('WASMローダーの形式が不正です。');
    const native:unknown=await module.default({locateFile:(path:string)=>new URL(`engine/${path}`,base).href});
    engine=fromEmscripten(native);
    restore(project);if(restored)message('host','保存したワールドを一時停止で復元しました。');
    persist();frameId=requestAnimationFrame(animate);renderControls();
  }catch(error){report(error);}
}
void boot();
if(import.meta.hot)import.meta.hot.dispose(()=>{cancelAnimationFrame(frameId);if(saveTimer)clearTimeout(saveTimer);simulation?.dispose();view?.dispose();editor.dispose();});
