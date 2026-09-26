/** ネイティブのサンプルと同じLua/入力fixtureを用いた、エンドツーエンドのWASMベースライン測定。 */
import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import {loadRuntime} from '../packages/lua-engine/dist/index.js';
const root=new URL('../',import.meta.url);
const engine=await loadRuntime({wasmBinary:new Uint8Array(await readFile(new URL('packages/lua-engine/dist/wasm/storm_lua_wasm.wasm',root)))});
const controlSource=await readFile(new URL('fixtures/bench/control.lua',root),'utf8');
const drawSource=await readFile(new URL('fixtures/bench/draw.lua',root),'utf8');
function measure(operation,iterations){
  for(let i=0;i<100;i++)operation();const samples=[];
  for(let b=0;b<9;b++){const start=performance.now();for(let i=0;i<iterations;i++)operation();samples.push((performance.now()-start)*1000/iterations);}
  samples.sort((a,b)=>a-b);return {medianBatchMeanUs:samples[4],maxBatchMeanUs:samples[8],batches:9,iterationsPerBatch:iterations};
}
const control=engine.createVehicle(),drawing=engine.createVehicle();
try{
  control.load(controlSource);drawing.load(drawSource);control.io.inputNumbers[0]=0.8;control.io.inputNumbers[1]=0.25;
  const tick=measure(()=>{control.tick();if(!Number.isFinite(control.io.outputNumbers[0]))throw new Error('invalid output');},5000);
  const draw96=measure(()=>{drawing.draw(96,96);},250);
  const createAndLoad=measure(()=>{const vm=engine.createVehicle();try{vm.load(controlSource);}finally{vm.dispose();}},100);
  console.log(JSON.stringify({runtime:'wasm-release-node',tick,draw96,createAndLoad,debugCompiled:true,breakpoints:false}));
}finally{control.dispose();drawing.dispose();}
