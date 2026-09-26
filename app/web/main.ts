import './style.css';
import {CanvasPresenter} from '@stormcat-works/storm-lua-engine/canvas';
import {CompilerWorkerClient} from '@stormcat-works/storm-lua-engine/compiler-worker';
import type {CompileOptions,ProjectCompileOptions,AnalyzeOptions,LuaProject} from '@stormcat-works/storm-lua-engine/compiler';
import {RECIPES,recipe} from '../shared/recipes.js';
import {parseProject,StepRunner,type PlaygroundProject,type StepResult} from '../shared/project.js';
import {decodeWire,stringify,object,errorMessage,text} from '../shared/wire.js';
import type {Command} from '../shared/session.js';

function element<T extends HTMLElement>(id:string):T {const e=document.getElementById(id);if(!e)throw new Error(`UIがありません: ${id}`);return e as T;}
const source=element<HTMLTextAreaElement>('source'),steps=element<HTMLTextAreaElement>('steps'),environment=element<HTMLSelectElement>('environment');
const runButton=element<HTMLButtonElement>('run'),stepButton=element<HTMLButtonElement>('step'),stopButton=element<HTMLButtonElement>('stop');
const canvas=element<HTMLCanvasElement>('screen');const context=canvas.getContext('2d');if(!context)throw new Error('Canvas 2Dを初期化できません');
const presenter=new CanvasPresenter(context), storageKey='storm-lua-playground-v1';
let selected='vehicle',title='',tab:'source'|'steps'='source',history:StepResult[]=[],runner:StepRunner|undefined;
let working=false,generation=0,storageBlocked=false,storageRaw:string|null=null,lastFrame:unknown;
const errorBanner=element('error-banner');
function showError(error:unknown):void {errorBanner.textContent=errorMessage(error);errorBanner.hidden=false;}
function clearError():void {errorBanner.hidden=true;errorBanner.textContent='';}
function readProject():PlaygroundProject {return parseProject({kind:'storm-lua-playground',version:1,title,source:source.value,environment:environment.value,steps:JSON.parse(steps.value)});}
function save():void {
 if(storageBlocked)return;
 try{
  localStorage.setItem(storageKey,stringify({kind:'storm-lua-playground-state',version:1,selected,title,source:source.value,steps:steps.value,environment:environment.value,tab,history:history.slice(-64),lastFrame}));
  element('saved').textContent='この端末に保存済み';
 }catch(error){element('saved').textContent='保存に失敗しました';showError(`ブラウザへ保存できません: ${errorMessage(error)}。入力はJSONへ書き出してください。`);}
}
function status(label:string,state:string):void {const e=element('progress');e.textContent=label;e.dataset['state']=state;document.body.dataset['runState']=state;}
function busy(value:boolean):void {working=value;runButton.disabled=value;stepButton.disabled=value;stopButton.disabled=!value;source.readOnly=value;steps.readOnly=value;environment.disabled=value;}
function setTab(value:'source'|'steps'):void {
 tab=value;for(const name of ['source','steps'] as const){element(`${name}-panel`).hidden=name!==value;element(`${name}-tab`).setAttribute('aria-selected',String(name===value));}save();
}
function updateInputMeta():void {
 element('source-size').textContent=`${source.value.length.toLocaleString()} UTF-16 units`;
 try{const array:unknown=JSON.parse(steps.value);element('steps-count').textContent=Array.isArray(array)?String(array.length):'?';}catch{element('steps-count').textContent='?';}
 element('environment-note').textContent=environment.value==='game'?'game: debug.logのみ。print・pcall・errorはnilです。ホストのデバッガは使用できます。':'extended: 開発・組み込み用の拡張です。実ゲーム互換を意味しません。最適化は名前と行を保つ字句短縮になります。';
}
function nav():void {
 const menu=element('recipes');menu.replaceChildren();let group='';
 const ordered=[...new Set(RECIPES.map(r=>r.group))].flatMap(group=>RECIPES.filter(r=>r.group===group));
 for(const item of ordered){
  const index=RECIPES.findIndex(r=>r.id===item.id);
  if(item.group!==group){group=item.group;const label=document.createElement('div');label.className='recipe-group';label.textContent=group;menu.append(label);}
  const button=document.createElement('button');button.className='recipe-button';button.dataset['recipe']=item.id;button.setAttribute('aria-current',String(item.id===selected));
  const number=document.createElement('span');number.className='recipe-index';number.textContent=String(index+1).padStart(2,'0');button.append(number,document.createTextNode(item.title));
  button.addEventListener('click',()=>selectRecipe(item.id));menu.append(button);
 }
 element('recipe-count').textContent=String(RECIPES.length).padStart(2,'0');
}
function heading():void {
 const item=recipe(selected);element('title').textContent=title;element('group').textContent=item.group;element('description').textContent=item.description;
 const tags=element('features');tags.replaceChildren(...item.features.map(feature=>{const e=document.createElement('span');e.textContent=feature;return e;}));nav();
}
function renderFrame(value:unknown):void {
 if(!value||typeof value!=='object')return;
 const record=value as Record<string,unknown>;
 if(record['frame']){renderFrame(record['frame']);return;}
 if(record['kind']!=='frame')return;
 const width=record['width'],height=record['height'],pixels=record['pixels'];
 if(typeof width!=='number'||typeof height!=='number'||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||!(pixels instanceof Uint8Array)||pixels.length!==width*height*4)throw new Error('不正なframe結果です');
 presenter.present({width,height,pixels});canvas.hidden=false;element('monitor-empty').hidden=true;
 const meta=element('frame-meta');meta.hidden=false;meta.textContent=`${width} × ${height} / ${String(record['format'])}`;lastFrame=value;
}
function preview(value:unknown,depth=0):unknown {
 if(depth>10)return '…';
 if(value instanceof Uint8Array){
  let decoded:string|undefined;
  if(value.length<=4096){try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(value);}catch{decoded=undefined;}}
  return {bytes:value.length,...(decoded===undefined?{encoding:'binary'}:{utf8:decoded}),preview:Array.from(value.subarray(0,48)),...(value.length>48?{remaining:value.length-48}:{})};
 }
 if(Array.isArray(value))return value.length>80?[...value.slice(0,80).map(v=>preview(v,depth+1)),`… ${value.length-80} more`]:value.map(v=>preview(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,preview(v,depth+1)]));
 return value;
}
function renderResults():void {
 const root=element('results');root.replaceChildren();
 for(const result of history.slice(-64)){
  const row=document.createElement('details');row.className='result-row';
  const summary=document.createElement('summary'),op=document.createElement('strong'),badge=document.createElement('span');
  op.textContent=`${String(result.index+1).padStart(2,'0')}  ${result.op}`;
  const value=result.value&&typeof result.value==='object'?result.value as Record<string,unknown>:undefined;
  const diagnostics=Array.isArray(value?.['diagnostics'])?value['diagnostics']:[];
  const warning=result.expectedError||value?.['ok']===false||diagnostics.length>0;
  badge.className=result.ok?(warning?'status-warn':'status-ok'):'status-fail';badge.textContent=result.ok?(warning?'診断 / EXPECTED':'OK'):'ERROR';summary.append(op,badge);
  const output=document.createElement('pre');output.textContent=stringify(preview(result.error?{error:result.error,expected:result.expectedError}:result.value));row.append(summary,output);root.append(row);
 }
 if(!history.length){const p=document.createElement('p');p.className='empty-result';p.textContent='実行は明示操作です。ページを開いたり、コードを編集しただけではLuaを実行しません。';root.append(p);}
 const last=history.at(-1);element('result-summary').textContent=last?`${history.length} 操作を記録${history.some(r=>!r.ok)?' · 失敗があります':''}`:'入力を確認して実行してください';
 element<HTMLButtonElement>('copy-code').disabled=!latestCode();
 if(last){const row=root.lastElementChild as HTMLDetailsElement|null;if(row)row.open=true;}
 const lastRow=root.lastElementChild as HTMLElement|null;root.scrollTop=lastRow?.offsetTop??0;
}
function latestCode():string|undefined {for(const result of history.slice().reverse()){if(result.value&&typeof result.value==='object'){const v=result.value as Record<string,unknown>;if(v['ok']===true&&typeof v['code']==='string')return v['code'];}}return undefined;}
class RuntimeClient {
 #counter=1;readonly #pending=new Map<number,{resolve(v:unknown):void;reject(e:Error):void}>();
 constructor(readonly worker:Worker){worker.addEventListener('message',e=>{const r=e.data as {id?:number;ok?:boolean;value?:unknown;error?:string};if(r.id===undefined)return;const p=this.#pending.get(r.id);if(!p)return;this.#pending.delete(r.id);if(r.ok)p.resolve(r.value);else p.reject(new Error(r.error??'Worker失敗'));});worker.addEventListener('error',e=>this.dispose(new Error(e.message)));worker.addEventListener('messageerror',()=>this.dispose(new Error('Workerの値を読み取れません')));}
 request(command:Command):Promise<unknown>{const id=this.#counter++;return new Promise((resolve,reject)=>{this.#pending.set(id,{resolve,reject});try{this.worker.postMessage({kind:'command',id,command});}catch(error){this.#pending.delete(id);reject(error);}});}
 dispose(error=new Error('実行を中断しました')):void {for(const p of this.#pending.values())p.reject(error);this.#pending.clear();this.worker.terminate();}
}
let runtime:RuntimeClient|undefined,compiler:CompilerWorkerClient|undefined,compilerWorker:Worker|undefined;
const pendingInitializations = new Set<(reason: Error) => void>();
function ready(worker:Worker,options:unknown):Promise<void>{
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{worker.removeEventListener('message',done);worker.removeEventListener('error',fail);worker.removeEventListener('messageerror',decodeFailure);pendingInitializations.delete(cancel);};
  const cancel=(reason:Error)=>{cleanup();reject(reason);};
  const done=(event:MessageEvent)=>{if(event.data?.kind==='ready'){cleanup();resolve();}};
  const fail=(event:ErrorEvent)=>cancel(new Error(event.message));
  const decodeFailure=()=>cancel(new Error('Worker初期化の応答を読み取れません'));
  pendingInitializations.add(cancel);worker.addEventListener('message',done);worker.addEventListener('error',fail);worker.addEventListener('messageerror',decodeFailure);
  try{worker.postMessage({kind:'init',options});}catch(error){cancel(new Error(errorMessage(error)));}
 });
}
function closeWorkers():void {
 generation++;
 for(const cancel of [...pendingInitializations])cancel(new Error('Worker初期化を中断しました'));
 runtime?.dispose();runtime=undefined;compiler?.dispose(new Error('実行を中断しました'));compiler=undefined;compilerWorker?.terminate();compilerWorker=undefined;runner=undefined;
}
async function initialize():Promise<void>{
 const token=generation,base=new URL('./engine/',document.baseURI);
 const compilerOptions={moduleUrl:new URL('compiler/compiler.js',base).href,wasmUrl:new URL('compiler/compiler_bg.wasm',base).href};
 const rw=new Worker(new URL('./runtime.worker.ts',import.meta.url),{type:'module'});runtime=new RuntimeClient(rw);
 compilerWorker=new Worker(new URL('./compiler.worker.ts',import.meta.url),{type:'module'});compiler=new CompilerWorkerClient(compilerWorker);
 await Promise.all([ready(rw,{runtime:{moduleUrl:new URL('storm_lua_wasm.js',base).href,wasmUrl:new URL('storm_lua_wasm.wasm',base).href},compiler:compilerOptions,raster:{wasmUrl:new URL('screen.wasm',base).href}}),ready(compilerWorker,compilerOptions)]);
 if(token!==generation)throw new Error('初期化を中断しました');
 runner=new StepRunner(readProject(),async(command)=>{
  if(!compiler||!runtime)throw new Error('Workerがありません');
  switch(command.op){
   case 'minify':return compiler.minify(text(command['source']),command['options'] as CompileOptions);
   case 'build':return compiler.build(command['project'] as LuaProject,command['options'] as ProjectCompileOptions);
   case 'analyze':return compiler.analyze(command['project'] as LuaProject,command['options'] as AnalyzeOptions);
   case 'scanProperties':return compiler.scanProperties(text(command['source']));
   case 'passIds':return compiler.passIds();
   case 'passMetadata':return compiler.passMetadata();
   default:return runtime.request(command);
  }
 });
}
function onResult(result:StepResult):void {history.push(result);history=history.slice(-64);renderFrame(result.value);renderResults();save();if(!result.ok)showError(result.error);}
async function run(all:boolean):Promise<void>{
 if(working)return;clearError();busy(true);status('初期化中','running');
 let token=generation;
 try{
  if(all||!runner){readProject();closeWorkers();token=generation;history=[];lastFrame=undefined;canvas.hidden=true;element('monitor-empty').hidden=false;element('frame-meta').hidden=true;renderResults();await initialize();}
  const active=runner;if(!active)throw new Error('実行セッションがありません');
  do{
   status(`${active.cursor+1} / ${active.project.steps.length} 実行中`,'running');
   const result=await active.next();if(token!==generation)return;onResult(result);if(!result.ok){status('エラーで停止','error');break;}
  }while(all&&active.cursor<active.project.steps.length);
  if(!history.at(-1)?.ok)return;
  status(active.cursor===active.project.steps.length?'全操作完了':`${active.cursor} / ${active.project.steps.length} 操作完了`,active.cursor===active.project.steps.length?'complete':'paused');
 }catch(error){if(token===generation){showError(error);status('実行できませんでした','error');}}finally{if(token===generation){busy(false);save();}}
}
function apply(project:PlaygroundProject):void {title=project.title;source.value=project.source;steps.value=JSON.stringify(project.steps,null,2);environment.value=project.environment;updateInputMeta();heading();}
function selectRecipe(id:string):void {if(working){closeWorkers();busy(false);}else closeWorkers();selected=id;apply(parseProject(recipe(id)));history=[];lastFrame=undefined;canvas.hidden=true;element('monitor-empty').hidden=false;element('frame-meta').hidden=true;clearError();status('未実行','idle');renderResults();save();}
function download(filename:string,value:string):void {const url=URL.createObjectURL(new Blob([value],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
runButton.addEventListener('click',()=>void run(true));stepButton.addEventListener('click',()=>void run(false));
stopButton.addEventListener('click',()=>{closeWorkers();busy(false);status('中断しました','cancelled');showError('実行Workerを終了しました。次回は新しいセッションから開始します。');save();});
for(const input of [source,steps,environment])input.addEventListener('input',()=>{closeWorkers();status('入力変更 · 再実行してください','idle');updateInputMeta();save();});
for(const name of ['source','steps'] as const)element(`${name}-tab`).addEventListener('click',()=>setTab(name));
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();void run(true);}});
element('export').addEventListener('click',()=>{try{download('storm-lua-playground.json',stringify(readProject())+'\n');}catch(error){showError(error);}});
element('import').addEventListener('click',()=>element<HTMLInputElement>('import-file').click());
element<HTMLInputElement>('import-file').addEventListener('change',async event=>{
 const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
 try{if(file.size>3*1024*1024)throw new Error('インポート上限は3MiBです');const project=parseProject(JSON.parse(await file.text()));closeWorkers();busy(false);apply(project);storageBlocked=false;history=[];lastFrame=undefined;canvas.hidden=true;element('monitor-empty').hidden=false;element('frame-meta').hidden=true;renderResults();clearError();status('読み込み完了 · 未実行','idle');save();}catch(error){showError(`インポートを拒否しました。現在の入力は保持しています。\n${errorMessage(error)}`);}finally{input.value='';}
});
element('reset').addEventListener('click',()=>{if(!confirm('入力を選択中の確認例へ戻しますか？必要な入力は先に書き出してください。'))return;storageBlocked=false;selectRecipe(selected);element('recover').hidden=true;});
element('recover').addEventListener('click',()=>download('playground-storage-recovery.json',storageRaw??''));
element('copy-code').addEventListener('click',async()=>{try{const code=latestCode();if(code===undefined)return;await navigator.clipboard.writeText(code);element('result-summary').textContent='生成Luaをコピーしました';}catch(error){showError(`コピーできません: ${errorMessage(error)}`);}});
try{
 storageRaw=localStorage.getItem(storageKey);
 if(storageRaw!==null){
  const state=object(decodeWire(JSON.parse(storageRaw)));
  if(state['kind']!=='storm-lua-playground-state'||state['version']!==1)throw new Error('未対応の保存形式です');
  selected=text(state['selected']);recipe(selected);title=text(state['title']);source.value=text(state['source']);steps.value=text(state['steps']);
  if(state['environment']!=='game'&&state['environment']!=='extended')throw new Error('不正な保存environmentです');environment.value=state['environment'];
  tab=state['tab']==='steps'?'steps':'source';history=Array.isArray(state['history'])?state['history'] as StepResult[]:[];
  lastFrame=state['lastFrame'];heading();updateInputMeta();renderResults();renderFrame(lastFrame);status(history.length?'保存結果を復元 · VMは未実行':'未実行','restored');
 }else{apply(parseProject(recipe(selected)));status('未実行','idle');renderResults();}
}catch(error){storageBlocked=true;selected='vehicle';lastFrame=undefined;apply(parseProject(recipe('vehicle')));history=[];canvas.hidden=true;element('monitor-empty').hidden=false;renderResults();showError(`保存データを読めませんでした。元データは上書きしていません。救出するか、有効なJSONを読み込んでください。\n${errorMessage(error)}`);element('recover').hidden=false;}
setTab(tab);
window.addEventListener('pagehide',()=>{save();closeWorkers();});
