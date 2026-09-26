/** 所有されたLuaデータ。エントリリスト形式のテーブルにより、整数キー、疎配列、バイト文字列が保持されます。 */
import { byteArray, object } from './bridge.js';
export type LuaValue = null | boolean | number | bigint | string | Uint8Array | LuaTable;
export interface LuaTable { readonly kind: 'table'; readonly entries: readonly (readonly [LuaValue, LuaValue])[] }
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MIN_I64 = -(1n << 63n), MAX_I64 = (1n << 63n) - 1n;
export function luaTable(fields: Readonly<Record<string, LuaValue>>): LuaTable {
  return { kind: 'table', entries: Object.entries(fields) };
}
export function luaText(value: LuaValue): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return decoder.decode(value);
  throw new TypeError('Expected a Lua byte string');
}
export function luaField(table: LuaTable, name: string): LuaValue | undefined {
  const bytes = encoder.encode(name);
  return table.entries.find(([key]) => typeof key === 'string' ? key === name : key instanceof Uint8Array && key.length === bytes.length && key.every((b,i) => b === bytes[i]))?.[1];
}
function dense<T>(values: readonly T[]): void {
  for (let index=0;index<values.length;index++) if (!Object.hasOwn(values,index)) throw new TypeError('Sparse JS arrays are not Lua value lists');
}
/** Luaの整数値floatは整数キーと等価扱いされ、文字列はバイト列で比較されます。 */
function keyIdentity(key: LuaValue): string {
  if (typeof key === 'bigint') return 'i:'+key.toString();
  if (typeof key === 'number') {
    if (Number.isNaN(key)) throw new TypeError('NaN is not a Lua table key');
    if (Number.isInteger(key)) {
      const integer=BigInt(key);
      if (integer>=MIN_I64 && integer<=MAX_I64) return 'i:'+integer.toString();
    }
    const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,key,false);
    return 'n:'+bits.getBigUint64(0,false).toString(16);
  }
  if (typeof key === 'boolean') return key?'b:1':'b:0';
  if (typeof key === 'string' || key instanceof Uint8Array) {
    const bytes=typeof key==='string'?encoder.encode(key):key;
    return 's:'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  throw new TypeError('Table keys must be non-nil scalars');
}
function uniqueKey(seen: Set<string>, key: LuaValue, value: LuaValue): void {
  if (value===null) throw new TypeError('Nil table values must be omitted');
  const identity=keyIdentity(key);
  if (seen.has(identity)) throw new TypeError('Duplicate Lua table key');
  seen.add(identity);
}
class Budget {
  nodes = 0; bytes = 0;
  charge(depth: number, bytes = 0): void {
    this.nodes++; this.bytes += bytes;
    if (depth > 32 || this.nodes > 65536 || this.bytes > 1024 * 1024) throw new RangeError('Lua value exceeds depth, node or byte budget');
  }
}
function encode(value: LuaValue, budget: Budget, depth: number, active: Set<object>): unknown {
  budget.charge(depth);
  if (value === null) return {kind:'nil'};
  if (typeof value === 'boolean') return {kind:'bool',value};
  if (typeof value === 'bigint') {
    if (value < MIN_I64 || value > MAX_I64) throw new RangeError('Lua integer is outside signed i64');
    return {kind:'integer',value:value.toString()};
  }
  if (typeof value === 'number') {
    const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0,value,false);
    return {kind:'number',bits:view.getBigUint64(0,false).toString(16).padStart(16,'0')};
  }
  if (typeof value === 'string' || value instanceof Uint8Array) {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    budget.bytes += bytes.length;
    if (budget.bytes > 1024 * 1024) throw new RangeError('Lua byte budget exceeded');
    return {kind:'bytes',value:Array.from(bytes)};
  }
  if (typeof value !== 'object' || value.kind !== 'table' || !Array.isArray(value.entries)) throw new TypeError('Unsupported Lua value; use luaTable() for records');
  if (active.has(value)) throw new TypeError('Cyclic tables are not supported by owned Lua values');
  if (value.entries.length > 32768) throw new RangeError('Too many table entries');
  dense(value.entries);
  const seen = new Set<string>();
  active.add(value);
  try {
    return {kind:'table',entries:value.entries.map(pair => {
      if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('A table entry must have a key and value');
      const [key, item] = pair;
      if (key === null || (typeof key === 'object' && !(key instanceof Uint8Array)) || (typeof key === 'number' && Number.isNaN(key)) || item === null) throw new TypeError('Invalid table key or nil table value');
      const encoded=[encode(key,budget,depth+1,active),encode(item,budget,depth+1,active)];
      uniqueKey(seen,key,item);
      return encoded;
    })};
  } finally { active.delete(value); }
}

function decode(value: unknown, budget: Budget, depth: number): LuaValue {
  budget.charge(depth);
  const v = object(value);
  switch (v['kind']) {
    case 'nil': return null;
    case 'bool': if (typeof v['value'] !== 'boolean') throw new TypeError('Invalid Boolean'); return v['value'];
    case 'integer': {
      const text = v['value'];
      if (typeof text !== 'string' || !/^-?\d+$/.test(text) || text.length > 20) throw new TypeError('Invalid i64 text');
      const integer = BigInt(text);
      if (integer < MIN_I64 || integer > MAX_I64) throw new RangeError('Lua integer is outside signed i64');
      return integer;
    }
    case 'number': {
      const bits = v['bits'];
      if (typeof bits !== 'string' || !/^[0-9a-fA-F]{16}$/.test(bits)) throw new TypeError('Invalid binary64 bits');
      const view = new DataView(new ArrayBuffer(8)); view.setBigUint64(0,BigInt('0x'+bits),false); return view.getFloat64(0,false);
    }
    case 'bytes': {
      const bytes = byteArray(v['value']); budget.bytes += bytes.length;
      if (budget.bytes > 1024*1024) throw new RangeError('Lua byte budget exceeded'); return bytes;
    }
    case 'table': {
      const entries = v['entries'];
      if (!Array.isArray(entries) || entries.length > 32768) throw new TypeError('Invalid table entries');
      dense(entries);
      const seen = new Set<string>();
      return {kind:'table',entries:entries.map(pair => {
        if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('Invalid table pair');
        const key=decode(pair[0],budget,depth+1), item=decode(pair[1],budget,depth+1);
        uniqueKey(seen,key,item);
        return [key,item] as const;
      })};
    }
    default: throw new TypeError('Unknown Lua value kind');
  }
}
/** ワイヤヘルパーは、プレーンなJSONへの強制変換を行わず、bigint/number/string の各ドメインを保持します。 */
export function encodeLuaValue(value: LuaValue): unknown { return encode(value,new Budget(),0,new Set()); }
export function decodeLuaValue(value: unknown): LuaValue { return decode(value,new Budget(),0); }
export function encodeLuaValues(values: readonly LuaValue[]): unknown[] {
  if (!Array.isArray(values)) throw new TypeError('Host functions must return an explicit result array');
  if (values.length > 65536) throw new RangeError('Too many Lua arguments/results');
  dense(values);
  const budget = new Budget(); const active = new Set<object>();
  return values.map(value => encode(value,budget,0,active));
}
export function decodeLuaValues(values: unknown): LuaValue[] {
  if (!Array.isArray(values)) throw new TypeError('Expected a Lua argument/result list');
  if (values.length > 65536) throw new RangeError('Too many Lua arguments/results');
  dense(values);
  const budget = new Budget(); return values.map(value => decode(value,budget,0));
}
/** バージョン管理されたポータブルなセーブデータ。シリアライズされたVMやゲームの lua_data.xml ではありません。 */
export function encodeSavedata(table: LuaTable): Uint8Array {
  if (table.kind !== 'table') throw new TypeError('Savedata must be a table');
  const bytes = encoder.encode(JSON.stringify({format:'storm-lua-addon-savedata',version:1,value:encodeLuaValue(table)}));
  if (bytes.length > 4*1024*1024) throw new RangeError('Savedata envelope exceeds 4 MiB');
  return bytes;
}
export function decodeSavedata(bytes: Uint8Array): LuaTable {
  if (bytes.length > 4*1024*1024) throw new RangeError('Savedata envelope exceeds 4 MiB');
  const data = object(JSON.parse(decoder.decode(bytes)) as unknown);
  if (data['format'] !== 'storm-lua-addon-savedata' || data['version'] !== 1) throw new TypeError('Unsupported savedata format/version');
  const value = decodeLuaValue(data['value']);
  if (value === null || typeof value !== 'object' || value instanceof Uint8Array || value.kind !== 'table') throw new TypeError('Savedata must be a table');
  return value;
}
