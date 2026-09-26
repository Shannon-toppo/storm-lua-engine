// アプリケーションが所有する実装例: ライブラリはスケジューラやWorkerプールを作成しません。
import {loadRuntime} from '../../packages/lua-engine/dist/index.js';
const ready=loadRuntime();
self.onmessage=async({data})=>{
  let vm;
  try{
    const engine=await ready;vm=engine.createVehicle({properties:data.properties??{}});
    vm.load(data.source);vm.io.inputNumbers.set(data.inputs??[]);const tick=vm.tick();
    const draw=vm.draw(data.width,data.height);const pixels=vm.frame().copy();
    // モジュールの線形メモリではなく、所有されたJS側のコピーのみを転送します。
    self.postMessage({id:data.id,tick,draw,outputs:Array.from(vm.io.outputNumbers),pixels},[pixels.buffer]);
  }catch(error){self.postMessage({id:data.id,error:String(error)});}
  finally{vm?.dispose();}
};
