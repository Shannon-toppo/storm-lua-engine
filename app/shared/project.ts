/** 1つの確認用入力と操作列。VMの実行継続そのものを保存したとは扱いません。 */
import {object,text,errorMessage,decodeWire,stringify} from './wire.js';
import type {Command} from './session.js';
export interface PlaygroundProject {
  kind:'storm-lua-playground';version:1;title:string;source:string;
  environment:'game'|'extended';steps:Command[];
}
export function parseProject(input:unknown):PlaygroundProject {
  const p=object(input);
  if(p['kind']!=='storm-lua-playground'||p['version']!==1)throw new Error('未対応のPlayground形式・versionです');
  const title=text(p['title']), source=text(p['source']);
  if(title.length>200||source.length>1024*1024)throw new Error('タイトルまたはソースが大きすぎます');
  if(p['environment']!=='game'&&p['environment']!=='extended')throw new Error('不正なenvironmentです');
  if(!Array.isArray(p['steps'])||p['steps'].length>256)throw new Error('操作列は256件までの配列で指定してください');
  const steps=p['steps'].map(item=>{
    const step=object(item);text(step['op'],'op');
    if(step['as']!==undefined&&!/^[A-Za-z_][A-Za-z_0-9]*$/.test(text(step['as'])))throw new Error('結果のas名が不正です');
    if(step['expectError']!==undefined)text(step['expectError']);
    return structuredClone(step) as Command;
  });
  // JSONで往復できない構造や循環をここで拒否し、現在の入力を置き換える前に検査します。
  if(stringify(steps).length>2*1024*1024)throw new Error('操作列が大きすぎます');
  return {kind:'storm-lua-playground',version:1,title,source,environment:p['environment'],steps};
}
export interface StepResult {index:number;op:string;ok:boolean;expectedError?:boolean;value?:unknown;error?:string}
/** 実行はホストから呼ばれたときだけ。参照は自身の結果だけを辿り、prototypeを見ません。 */
export class StepRunner {
  readonly results:StepResult[]=[];
  readonly #saved=new Map<string,unknown>();
  cursor=0;
  constructor(readonly project:PlaygroundProject,private readonly execute:(command:Command)=>Promise<unknown>){}
  private resolve(value:unknown,depth=0):unknown {
    if(depth>64)throw new Error('操作の入れ子が深すぎます');
    if(Array.isArray(value))return value.map(v=>this.resolve(v,depth+1));
    if(!value||typeof value!=='object')return value;
    const record=object(value),keys=Object.keys(record);
    if(keys.length===1&&record['$source']===true)return this.project.source;
    if(keys.length===1&&record['$environment']===true)return this.project.environment;
    if(keys.length===1&&typeof record['$ref']==='string'){
      const [name,...path]=record['$ref'].split('.');
      if(name===undefined||!this.#saved.has(name))throw new Error(`結果参照がありません: ${record['$ref']}`);
      let current=this.#saved.get(name);
      for(const key of path){
        if(!current||typeof current!=='object'||!Object.hasOwn(current,key))throw new Error(`結果のパスがありません: ${record['$ref']}`);
        current=(current as Record<string,unknown>)[key];
      }
      return structuredClone(current);
    }
    return decodeWire(Object.fromEntries(Object.entries(record).map(([k,v])=>[k,this.resolve(v,depth+1)])));
  }
  async next():Promise<StepResult> {
    const index=this.cursor,raw=this.project.steps[index];if(!raw)throw new Error('全操作が終了しました');
    let result:StepResult;
    try {
      const command=this.resolve(raw) as Command;
      const value=await this.execute(command);
      if(raw['expectError']!==undefined)throw new Error('期待したエラーが発生しませんでした');
      result={index,op:raw.op,ok:true,value};
      if(typeof raw['as']==='string')this.#saved.set(raw['as'],value);
    }catch(error){
      const message=errorMessage(error);
      if(typeof raw['expectError']==='string'&&message.includes(raw['expectError']))result={index,op:raw.op,ok:true,expectedError:true,error:message};
      else result={index,op:raw.op,ok:false,error:message};
    }
    this.cursor++;this.results.push(result);return result;
  }
  async all(onStep?:(result:StepResult)=>void):Promise<StepResult[]> {
    while(this.cursor<this.project.steps.length){const result=await this.next();onStep?.(result);if(!result.ok)break;}
    return this.results;
  }
}
