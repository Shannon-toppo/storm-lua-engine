import {test} from 'node:test';
import assert from 'node:assert/strict';
import {luaTable,luaField,encodeSavedata,decodeSavedata} from '../dist/index.js';
import {encodeLuaValue,decodeLuaValue,encodeLuaValues} from '../dist/values.js';

test('portable savedata preserves mixed keys, byte strings and numeric bit patterns',()=>{
 const table={kind:'table',entries:[[1n,9223372036854775807n],[true,new Uint8Array([0,255])],['n',-0],['nan',NaN],['infinity',Infinity],['child',luaTable({x:'value'})]]};
 const decoded=decodeSavedata(encodeSavedata(table));
 assert.equal(decoded.entries[0][0],1n);assert.equal(decoded.entries[0][1],9223372036854775807n);
 assert.deepEqual(decoded.entries[1],[true,new Uint8Array([0,255])]);
 assert.ok(Object.is(luaField(decoded,'n'),-0));assert.ok(Number.isNaN(luaField(decoded,'nan')));assert.equal(luaField(decoded,'infinity'),Infinity);
});
test('owned codecs reject duplicate Lua-equivalent keys in both directions',()=>{
 for(const keys of [[1n,1],[-0,0],['same',new TextEncoder().encode('same')],[Infinity,Infinity]]){
  const value={kind:'table',entries:keys.map(key=>[key,true])};
  assert.throws(()=>encodeLuaValue(value),/duplicate/i);
 }
 const invalid={kind:'table',entries:[[{kind:'integer',value:'1'},{kind:'bool',value:true}],[{kind:'number',bits:'3ff0000000000000'},{kind:'bool',value:false}]]};
 assert.throws(()=>decodeLuaValue(invalid),/duplicate/i);
});
test('nil, NaN and table keys are invalid; bigint and floating keys outside exact range stay distinct',()=>{
 for(const key of [null,NaN,luaTable({a:1})]) assert.throws(()=>encodeLuaValue({kind:'table',entries:[[key,true]]}));
 assert.throws(()=>decodeLuaValue({kind:'table',entries:[[{kind:'nil'},{kind:'bool',value:true}]]}));
 assert.doesNotThrow(()=>encodeLuaValue({kind:'table',entries:[[9223372036854775807n,true],[9223372036854775808,false]]}));
});
test('sparse JS arrays are rejected rather than silently becoming nil or empty entries',()=>{
 assert.throws(()=>encodeLuaValues(new Array(2)),/sparse/i);
 assert.throws(()=>encodeLuaValue({kind:'table',entries:new Array(2)}),/sparse/i);
});
test('cycles, depth, byte budgets and unsupported checkpoint versions are bounded',()=>{
 const cycle=luaTable({});cycle.entries.push(['self',cycle]);assert.throws(()=>encodeSavedata(cycle),/cyclic/i);
 let deep=luaTable({});for(let n=0;n<35;n++)deep=luaTable({child:deep});assert.throws(()=>encodeSavedata(deep),/depth/i);
 assert.throws(()=>encodeLuaValue(new Uint8Array(1024*1024+1)),/budget/i);
 assert.throws(()=>encodeLuaValue(1n<<63n),/i64/);
 assert.throws(()=>decodeSavedata(new TextEncoder().encode(JSON.stringify({format:'storm-lua-addon-savedata',version:2,value:{kind:'table',entries:[]}}))),/version/);
});
