import {loadRuntime} from '../../packages/lua-engine/dist/index.js';
import {CanvasPresenter} from '../../packages/lua-engine/dist/canvas.js';
const button=document.querySelector('#run'), status=document.querySelector('#status');
const context=document.querySelector('#monitor').getContext('2d');
if(!context)throw new Error('Canvas 2D is unavailable');
const presenter=new CanvasPresenter(context);
let engine,vm;
button.addEventListener('click',async()=>{
  button.disabled=true;
  try {
    engine??=await loadRuntime();vm?.dispose();vm=engine.createVehicle({properties:{Gain:1.5}});
    vm.load(document.querySelector('#source').value);
    vm.io.inputNumbers[0]=0.8;const tick=vm.tick();const draw=vm.draw(96,96);presenter.present(vm.frame());
    status.textContent=`tick: ${tick}; draw: ${draw}; output channel 1: ${vm.io.outputNumbers[0]}`;
  }catch(error){status.textContent=String(error);}
  finally{button.disabled=false;}
});
window.addEventListener('pagehide',()=>vm?.dispose());
