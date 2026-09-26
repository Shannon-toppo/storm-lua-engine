/** Lua実行・描画はUIから分離したWorker内だけで行います。 */
import {PlaygroundSession,type SessionInit,type Command} from '../shared/session.js';
import {errorMessage,object} from '../shared/wire.js';
let session:PlaygroundSession|undefined;
let queue=Promise.resolve();
self.addEventListener('message',(event:MessageEvent<unknown>)=>{
 queue=queue.then(async()=>{
  let id:unknown;
  try{
   const request=object(event.data);id=request['id'];
   if(request['kind']==='init'){
    if(session)throw new Error('Workerは初期化済みです');
    session=new PlaygroundSession(request['options'] as SessionInit);
    self.postMessage({kind:'ready'});return;
   }
   if(!session||request['kind']!=='command'||typeof id!=='number')throw new Error('不正なWorker要求です');
   const value=await session.execute(object(request['command']) as Command);
   self.postMessage({id,ok:true,value});
  }catch(error){self.postMessage({id,ok:false,error:errorMessage(error)});}
 });
});
