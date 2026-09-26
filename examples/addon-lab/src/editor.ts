// Luaは編集可能、TSホストと仮物理は同じ画面で読める参照タブにします。
import {EditorState} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';
import {basicSetup} from 'codemirror';
import {StreamLanguage} from '@codemirror/language';
import {lua} from '@codemirror/legacy-modes/mode/lua';
import {javascript} from '@codemirror/lang-javascript';
import {autocompletion, type Completion} from '@codemirror/autocomplete';
import {oneDark} from '@codemirror/theme-one-dark';
import {HOST_API} from './host';
import hostSource from './host.ts?raw';
import worldSource from './world.ts?raw';
export type FileTab='lua'|'host'|'physics';
export class CodePanel {
  readonly view:EditorView;
  private luaState:EditorState;
  private active:FileTab='lua';
  constructor(parent:HTMLElement,source:string,changed:(source:string,anchor:number,head:number)=>void,run:()=>void) {
    const chrome=EditorView.theme({
      '&':{height:'100%',backgroundColor:'#15222f'},
      '.cm-scroller':{fontFamily:'"SFMono-Regular", Consolas, "Noto Sans Mono", monospace',fontSize:'13px',lineHeight:'1.65',overflow:'auto'},
      '.cm-content':{padding:'16px 0'},
      '.cm-gutters':{backgroundColor:'#15222f',borderRight:'1px solid #263846',color:'#728898'},
      '.cm-activeLine, .cm-activeLineGutter':{backgroundColor:'#1e3040'},
      '.cm-focused':{outline:'none'},
    },{dark:true});
    const completion=autocompletion({override:[context=>{
      const token=context.matchBefore(/[\w.]+/);if(!token)return null;
      const options:Completion[]=HOST_API.map(([name,params,returns,detail])=>({label:`server.${name}`,type:'function',detail:params,info:`${detail}\n戻り値: ${returns}`}));
      options.push({label:'server.httpGet',type:'function',detail:'port, path',info:'8080 /status への仮HTTP要求'});
      return {from:token.from,options,validFor:/[\w.]*/};
    }]});
    this.luaState=EditorState.create({doc:source,extensions:[basicSetup,oneDark,chrome,StreamLanguage.define(lua),completion,
      EditorView.contentAttributes.of({'aria-label':'Addon Luaコード','spellcheck':'false'}),
      keymap.of([{key:'Mod-Enter',run:()=>{run();return true;}}]),
      EditorView.updateListener.of(update=>{
        if(this.active==='lua' && (update.docChanged||update.selectionSet)){
          const selection=update.state.selection.main;
          changed(update.state.doc.toString(),selection.anchor,selection.head);
        }
      }),
    ]});
    this.view=new EditorView({state:this.luaState,parent});
    this.chrome=chrome;
  }
  private readonly chrome;
  tab(file:FileTab):void {
    if(file===this.active)return;
    if(this.active==='lua')this.luaState=this.view.state;
    this.active=file;
    if(file==='lua'){this.view.setState(this.luaState);return;}
    this.view.setState(EditorState.create({doc:file==='host'?hostSource:worldSource,extensions:[basicSetup,oneDark,this.chrome,javascript({typescript:true}),EditorState.readOnly.of(true),EditorView.editable.of(false),EditorView.contentAttributes.of({'aria-label':file==='host'?'TSホスト実装（読み取り専用）':'仮物理実装（読み取り専用）'})]}));
  }
  replace(source:string):void {this.tab('lua');this.view.dispatch({changes:{from:0,to:this.view.state.doc.length,insert:source},selection:{anchor:0}});}
  select(anchor:number,head:number):void {this.tab('lua');this.view.dispatch({selection:{anchor,head}});}
  focusError(message:string):void {
    const match=message.match(/(?:addon\.lua|\[string[^\]]*\]):(\d+):/);
    if(!match)return;this.tab('lua');
    const number=Number(match[1]);if(number<1||number>this.view.state.doc.lines)return;
    const line=this.view.state.doc.line(number);
    this.view.dispatch({selection:{anchor:line.from,head:line.to},effects:EditorView.scrollIntoView(line.from,{y:'center'})});
  }
  dispose():void {this.view.destroy();}
}
