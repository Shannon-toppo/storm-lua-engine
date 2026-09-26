// server.* の実処理はアプリ側に置きます。本体エンジンやThree.jsの内部状態には依存しません。
import {luaTable, luaText, type AddonEvent, type LuaTable, type LuaValue, type ServerFunctions} from '@stormcat-works/storm-lua-engine';
import {World, BOAT_TYPES, finite, integer, type Boat, type BoatKind} from './world';
export interface HostEvent { name: AddonEvent; args: LuaValue[] }
export interface LogLine { tick: number; source: string; message: string }
export const HOST_API = [
  ['spawnVehicle', 'transform, prefab', 'id, success', 'rescue_boat / cargo_boat のサンプルモデルを生成'],
  ['despawnVehicle', 'id, immediate?', 'success', '削除とイベントの予約'],
  ['getVehiclePos', 'id', 'transform, success', 'ワールドの現在姿勢を取得'],
  ['setVehiclePos', 'id, transform', 'success', '平面上の姿勢を即時変更'],
  ['setVehicleKeypad', 'id, name, value', 'success', 'Throttle / Steering を簡易モデルに接続'],
  ['setVehicleTooltip', 'id, text', 'success', '一覧と3D選択表示の名前を更新'],
  ['getVehicleData', 'id', 'data, success', 'サンプルの名前・種別を取得'],
  ['getVehicleSimulating', 'id', 'simulating, success', '存在する船は常にシミュレーション対象'],
  ['getPlayers', '', 'players', 'ローカルの仮プレイヤー1名'],
  ['getPlayerPos', 'peer_id', 'transform, success', '仮プレイヤーの固定位置'],
  ['getTimeMillisec', '', 'milliseconds', '固定tickに対応するサンプル時計'],
  ['announce', 'title, message, peer?', '', '出力パネルへ表示'],
] as const;
function number(value: LuaValue | undefined, name: string): number {
  if (typeof value !== 'number' && typeof value !== 'bigint') throw new Error(`${name}は数値で指定してください。`);
  return finite(Number(value), name);
}
function id(value: LuaValue | undefined): number { return integer(number(value,'vehicle id'),'vehicle id',1,1e9); }
function string(value: LuaValue | undefined, name: string, limit = 512): string {
  if (value === undefined) throw new Error(`${name}が指定されていません。`);
  const result = luaText(value);
  if (result.length > limit) throw new Error(`${name}が長すぎます。`);
  return result;
}
export function transform(x: number, y: number, z: number, heading = 0): LuaTable {
  const c=Math.cos(heading), s=Math.sin(heading);
  const values=[c,0,-s,0, 0,1,0,0, s,0,c,0, x,y,z,1];
  return {kind:'table',entries:values.map((value,index)=>[BigInt(index+1),value] as const)};
}
function pose(value: LuaValue | undefined): {x:number;y:number;z:number;heading:number} {
  if (!value || typeof value !== 'object' || value instanceof Uint8Array || value.kind !== 'table') throw new Error('transformは16要素の行列で指定してください。');
  const m = Array<number>(16).fill(NaN);
  for (const [key,item] of value.entries) {
    const index=integer(number(key,'matrix index'),'matrix index',1,16)-1;
    m[index]=number(item,'matrix component');
  }
  if (!m.every(Number.isFinite)) throw new Error('transformに欠けている要素があります。');
  // 平面移動だけの仮物理なので、ロール・ピッチ・拡大縮小は黙って捨てず拒否します。
  const expected = new Map([[1,0],[3,0],[4,0],[5,1],[6,0],[7,0],[9,0],[11,0],[15,1]]);
  for (const [index,v] of expected) if (Math.abs(m[index]! - v)>1e-6) throw new Error('このサンプルのtransformはY軸回転と平行移動だけに対応します。');
  const heading=Math.atan2(m[8]!,m[10]!);
  if (Math.abs(m[0]!-Math.cos(heading))>1e-6 || Math.abs(m[2]!+Math.sin(heading))>1e-6 || Math.abs(m[8]!-Math.sin(heading))>1e-6) throw new Error('剛体変換ではない行列です。');
  return {x:m[12]!,y:m[13]!,z:m[14]!,heading};
}
export class Host {
  readonly events: HostEvent[] = [];
  readonly calls: Record<string, number> = {};
  readonly server: ServerFunctions;
  constructor(readonly world: World, readonly log: (record: LogLine) => void) {
    const query = (value: LuaValue | undefined): Boat | undefined => world.boats.get(id(value));
    const emit = (name: AddonEvent, args: LuaValue[]): void => {
      if (this.events.length >= 128) throw new Error('ホストイベントキューの上限を超えました。');
      this.events.push({name,args});
    };
    const functions: ServerFunctions = {
      spawnVehicle: (matrix, prefab) => {
        const kind=string(prefab,'prefab',64);
        if (kind!=='rescue_boat' && kind!=='cargo_boat') throw new Error(`未登録のサンプルモデル: ${kind}`);
        const p=pose(matrix), boat=world.spawn(kind,p.x,p.y,p.z,p.heading);
        // Lua呼び出しの最中にはdispatchしません。戻ってからSessionが順番に配送します。
        emit('onVehicleSpawn',[BigInt(boat.id),-1n,boat.x,boat.y,boat.z,0,BigInt(boat.id)]);
        emit('onVehicleLoad',[BigInt(boat.id)]);
        this.message('host',`#${boat.id} ${BOAT_TYPES[kind].name} を生成`);
        return [BigInt(boat.id),true];
      },
      despawnVehicle: value => {
        const boat=query(value); if (!boat) return [false];
        if (this.events.length>126) throw new Error('ホストイベントキューの上限を超えました。');
        world.boats.delete(boat.id);emit('onVehicleUnload',[BigInt(boat.id)]);emit('onVehicleDespawn',[BigInt(boat.id),-1n]);
        this.message('host',`#${boat.id} を削除`);return [true];
      },
      getVehiclePos: value => { const boat=query(value);return boat?[transform(boat.x,boat.y,boat.z,boat.heading),true]:[null,false]; },
      setVehiclePos: (value,matrix) => {
        const p=pose(matrix), boat=query(value); if (!boat) return [false];
        Object.assign(boat,p);return [true];
      },
      setVehicleKeypad: (value,label,input) => {
        const name=string(label,'keypad',64), amount=number(input,'keypad value');
        if (!['Throttle','Steering'].includes(name)) throw new Error(`仮物理に接続されていないキーパッド: ${name}`);
        if (amount < -1 || amount > 1) throw new Error('キーパッド値は-1〜1です。');
        const boat=query(value);if (!boat)return [false];
        if (name==='Throttle') boat.throttle=amount;else boat.steering=amount;return [true];
      },
      setVehicleTooltip: (value,label) => {
        const name=string(label,'tooltip'), boat=query(value);if (!boat)return [false];boat.tooltip=name;return [true];
      },
      getVehicleData: value => {
        const boat=query(value);return boat?[luaTable({name:boat.tooltip,tags:luaTable({prefab:boat.kind})}),true]:[null,false];
      },
      getVehicleSimulating: value => {const exists=world.boats.has(id(value));return [exists,exists];},
      getPlayers: () => [{kind:'table',entries:[[1n,luaTable({id:0n,name:'ローカルプレイヤー',admin:true,auth:true})]]}],
      getPlayerPos: value => number(value,'peer id')===0?[transform(0,2,52),true]:[null,false],
      getTimeMillisec: () => [Math.round(world.tick*1000/60)],
      announce: (title,message) => {this.message('announce',`${string(title,'title',128)}: ${string(message,'message',2048)}`);return [];},
    };
    this.server=Object.fromEntries(Object.entries(functions).map(([name,handler])=>[name,(...args: LuaValue[])=>{
      this.calls[name]=(this.calls[name]??0)+1;return handler(...args);
    }]));
  }
  message(source: string, message: string): void {this.log({tick:this.world.tick,source,message});}
}
