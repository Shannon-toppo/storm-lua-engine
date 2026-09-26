/** Compiler専用Worker。生成と終了はmain側が管理します。 */
import {serveCompiler,type CompilerEndpoint} from '@stormcat-works/storm-lua-engine/compiler-worker';
import type {CompilerInitOptions} from '@stormcat-works/storm-lua-engine/compiler';
let attached=false;
self.addEventListener('message',(event:MessageEvent<unknown>)=>{
 const value=event.data as {kind?:string;options?:CompilerInitOptions};
 if(value?.kind!=='init'||attached)return;
 attached=true;
 serveCompiler(self as unknown as CompilerEndpoint,value.options??{});
 self.postMessage({kind:'ready'});
});
