// Luaの実行順と仮ワールドを組み立てる、利用アプリ側のセッションです。
import {decodeSavedata, encodeSavedata, type AddonVm, type LuaEngine, type Outcome} from '@stormcat-works/storm-lua-engine';
import {Host, type LogLine} from './host';
import {World, type WorldSnapshot} from './world';
export interface Settings { fleetCount: number; throttle: number; rate: 1 | 2 | 4 }
export interface Checkpoint { source: string; world: WorldSnapshot; savedata: number[] }
const decoder = new TextDecoder('utf-8', {fatal:true});
function logText(bytes: Uint8Array): string {
  try {return decoder.decode(bytes);}
  catch {return '[非UTF-8] ' + [...bytes].map(b=>b.toString(16).padStart(2,'0')).join(' ');}
}
function completed(outcome: Outcome): void {
  if (outcome==='suspended') throw new Error('このサンプルはデバッガ停止の継続操作を提供していません。');
}
export class Simulation {
  readonly world: World;
  readonly host: Host;
  private vm: AddonVm;
  private failed = false;
  private disposed = false;
  private constructor(engine: LuaEngine, readonly source: string, settings: Settings, log: (record:LogLine)=>void, checkpoint?: Checkpoint) {
    this.world = new World(checkpoint?.world);
    this.host = new Host(this.world,log);
    this.vm = engine.createAddon({
      newWorld:!checkpoint,
      properties:{'船の数':settings.fleetCount,'スロットル':settings.throttle},
      ...(checkpoint ? {savedata:decodeSavedata(Uint8Array.from(checkpoint.savedata))} : {}),
      server:this.host.server,
      onLog:record=>log({tick:this.world.tick,source:record.source,message:logText(record.bytes)}),
      instructionBudget:100_000,
      memoryBytes:8*1024*1024,
    });
  }
  static create(engine: LuaEngine, source: string, settings: Settings, log:(record:LogLine)=>void, checkpoint?: Checkpoint): Simulation {
    const session=new Simulation(engine,source,settings,log,checkpoint);
    try {
      completed(session.vm.load(source,'=addon.lua'));
      completed(session.vm.start());
      session.drain();
      // 保存できない初期状態は成功扱いにせず、候補VMを破棄してから報告します。
      session.capture();
      return session;
    } catch(error) {session.vm.dispose();throw error;}
  }
  private assertUsable(): void {
    if (this.disposed) throw new Error('セッションは終了済みです。');
    if (this.failed) throw new Error('実行に失敗しています。コードの再適用または保存からの復元が必要です。');
  }
  private operation(action:()=>void): void {
    this.assertUsable();
    try {action();}catch(error){this.failed=true;throw error;}
  }
  step(count=1): void {
    this.operation(()=>{
      for(let i=0;i<count;i++) {
        completed(this.vm.tick(1));
        this.drain();
        this.world.step();
      }
    });
  }
  chat(message: string): void {
    if (message.length>512) throw new Error('メッセージは512文字以内で指定してください。');
    this.operation(()=>{completed(this.vm.dispatch('onChatMessage',[0n,'ローカルプレイヤー',message]));this.drain();});
  }
  private drain(): void {
    // 同期server呼び出しの外側でイベントとHTTPを処理します。連鎖にも上限を設けます。
    for(let pass=0;pass<128;pass++) {
      const event=this.host.events.shift();
      if (event) {completed(this.vm.dispatch(event.name,event.args));continue;}
      const requests=this.vm.drainHttpRequests();
      if (!requests.length) return;
      for (const request of requests) {
        const path=logText(request.request);
        if (request.port!==8080 || path!=='/status') {
          this.vm.cancelHttp(request.token);
          throw new Error(`仮HTTPは 8080 /status だけに対応します。実ネットワークへは送信しません: ${request.port} ${path}`);
        }
        this.host.message('http','GET /status → 仮レスポンス 200');
        const body=JSON.stringify({mode:'sample',tick:this.world.tick,boats:this.world.boats.size});
        completed(this.vm.httpReply(request.token,body));
      }
    }
    throw new Error('1回の処理でイベント・HTTPが連鎖する上限を超えました。');
  }
  capture(): Checkpoint {
    this.assertUsable();
    return {source:this.source,world:this.world.snapshot(),savedata:Array.from(encodeSavedata(this.vm.savedata()))};
  }
  stop(): void {
    if (this.disposed) return;
    try {if (!this.failed) completed(this.vm.destroy());}
    finally {this.vm.dispose();this.disposed=true;}
  }
  dispose(): void {if(!this.disposed){this.vm.dispose();this.disposed=true;}}
}
