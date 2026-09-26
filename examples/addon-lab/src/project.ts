// プロジェクトの永続化はこのファイルだけが担当します。Lua VM全体の保存ではありません。
import {decodeSavedata} from '@stormcat-works/storm-lua-engine';
import {parseWorld, integer, finite, object, text} from './world';
import type {Checkpoint, Settings} from './session';
import type {LogLine} from './host';
export const STORAGE_KEY='storm-lua-addon-lab-v1';
export interface Project {
  format: 'storm-lua-addon-lab'; version: 1; draft: string; settings: Settings;
  checkpoint: Checkpoint | null; logs: LogLine[];
}
export interface UiState {
  selected: number | null; pane:'code'|'world'; file:'lua'|'host'|'physics';
  camera:{position:[number,number,number];target:[number,number,number]} | null;
  selection:{anchor:number;head:number};
}
export interface LocalState {project:Project;ui:UiState}
export function parseSettings(value: unknown): Settings {
  const s=object(value,'settings');
  const throttle=finite(s.throttle,'スロットル',1);
  if(throttle<0.1) throw new Error('スロットルは0.1〜1です。');
  if(s.rate!==1 && s.rate!==2 && s.rate!==4)throw new Error('実行速度が不正です。');
  return {fleetCount:integer(s.fleetCount,'船の数',1,8),throttle,rate:s.rate};
}
export function parseProject(value: unknown): Project {
  const p=object(value,'project');
  if(p.format!=='storm-lua-addon-lab'||p.version!==1)throw new Error('未対応のプロジェクト形式です。');
  const draft=text(p.draft,'Luaソース',65536),settings=parseSettings(p.settings);
  let checkpoint:Checkpoint|null=null;
  if(p.checkpoint!==null) {
    const c=object(p.checkpoint,'checkpoint');
    if(!Array.isArray(c.savedata)||c.savedata.length>4*1024*1024||c.savedata.some(x=>typeof x!=='number'||!Number.isInteger(x)||x<0||x>255))throw new Error('セーブデータのバイト列が不正です。');
    const savedata=c.savedata as number[];
    decodeSavedata(Uint8Array.from(savedata));
    checkpoint={source:text(c.source,'適用済みソース',65536),world:parseWorld(c.world),savedata:[...savedata]};
  }
  if(!Array.isArray(p.logs)||p.logs.length>200)throw new Error('ログ件数が不正です。');
  const logs=p.logs.map(value=>{const l=object(value,'log');return {tick:integer(l.tick,'log tick',0,1e12),source:text(l.source,'log source',32),message:text(l.message,'log message',2048)};});
  return {format:'storm-lua-addon-lab',version:1,draft,settings,checkpoint,logs};
}
export function parseUi(value: unknown, length: number): UiState {
  const u=object(value,'ui'),s=object(u.selection,'selection');
  if(u.pane!=='code'&&u.pane!=='world')throw new Error('表示パネルが不正です。');
  if(u.file!=='lua'&&u.file!=='host'&&u.file!=='physics')throw new Error('表示ファイルが不正です。');
  const selected=u.selected===null?null:integer(u.selected,'選択ID',1,1e9);
  let camera:UiState['camera']=null;
  if(u.camera!==null) {
    const c=object(u.camera,'camera');
    const vector=(v:unknown):[number,number,number]=>{
      if(!Array.isArray(v)||v.length!==3)throw new Error('カメラ座標が不正です。');
      return [finite(v[0],'camera',2000),finite(v[1],'camera',2000),finite(v[2],'camera',2000)];
    };
    camera={position:vector(c.position),target:vector(c.target)};
  }
  return {selected,pane:u.pane,file:u.file,camera,selection:{anchor:integer(s.anchor,'anchor',0,length),head:integer(s.head,'head',0,length)}};
}
export function encodeProject(project: Project): string {return JSON.stringify(parseProject(project),null,2);}
export function decodeProject(json: string): Project {
  if(json.length>12*1024*1024)throw new Error('プロジェクトは12MiB以内です。');
  return parseProject(JSON.parse(json) as unknown);
}
export function readLocal(storage: Pick<Storage,'getItem'>): LocalState | null {
  const value=storage.getItem(STORAGE_KEY);
  if(value===null)return null;
  if(value.length>12*1024*1024)throw new Error('ローカル保存データが大きすぎます。');
  const envelope=object(JSON.parse(value) as unknown,'local');
  const project=parseProject(envelope.project);
  return {project,ui:parseUi(envelope.ui,project.draft.length)};
}
export function writeLocal(storage: Pick<Storage,'setItem'>, state: LocalState): void {
  storage.setItem(STORAGE_KEY,JSON.stringify(state));
}
export function initialProject(source:string): Project {
  return {format:'storm-lua-addon-lab',version:1,draft:source,settings:{fleetCount:3,throttle:0.7,rate:1},checkpoint:null,logs:[]};
}
export function initialUi(): UiState {return {selected:null,pane:'code',file:'lua',camera:null,selection:{anchor:0,head:0}};}
