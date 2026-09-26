/** 採用済み画面契約の呼び出しを、公開バイナリコマンドの入力型に変換します。 */
export function convert(op){
  switch(op.type){
    case 'setColour':return {kind:'color',rgba:[op.r,op.g,op.b,op.a??255].map(v=>Math.max(0,Math.min(255,Math.round(v))))};
    case 'clear':return {kind:'clear'};
    case 'line':return {kind:'line',from:[op.x1,op.y1],to:[op.x2,op.y2]};
    case 'rect':case 'rectF':return {kind:'rect',x:op.x,y:op.y,width:op.w,height:op.h,fill:op.type==='rectF'};
    case 'circle':case 'circleF':return {kind:'circle',x:op.x,y:op.y,radius:op.radius,fill:op.type==='circleF'};
    case 'triangle':case 'triangleF':return {kind:'triangle',points:[[op.x1,op.y1],[op.x2,op.y2],[op.x3,op.y3]],fill:op.type==='triangleF'};
    case 'text':return {kind:'text',x:op.x,y:op.y,text:op.text};
    case 'textBox':return {kind:'textBox',x:op.x,y:op.y,width:op.w,height:op.h,horizontalAlign:op.horizontalAlign,verticalAlign:op.verticalAlign,text:op.text};
    default:throw new Error(`Unknown reference command ${op.type}`);
  }
}

/** 採用済みの入力だけをLuaへ変換します。画素の期待値を候補エンジンから生成しません。 */
export function luaSource(ops) {
  const signatures = {
    setColour: ['setColor','r','g','b'], clear: ['drawClear'],
    line: ['drawLine','x1','y1','x2','y2'], rect: ['drawRect','x','y','w','h'], rectF: ['drawRectF','x','y','w','h'],
    circle: ['drawCircle','x','y','radius'], circleF: ['drawCircleF','x','y','radius'],
    triangle: ['drawTriangle','x1','y1','x2','y2','x3','y3'], triangleF: ['drawTriangleF','x1','y1','x2','y2','x3','y3'],
    text: ['drawText','x','y'], textBox: ['drawTextBox','x','y','w','h']
  };
  const number = value => {
    if(typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Non-finite fixture coordinate');
    return Object.is(value,-0) ? '-0.0' : String(value);
  };
  return 'function onDraw()\n'+ops.map(op=>{
    const signature=signatures[op.type];
    if(!signature)throw new TypeError('Unknown screen fixture operation');
    const [name,...fields]=signature, args=fields.map(field=>number(op[field]));
    if(op.type==='setColour' && Object.hasOwn(op,'a'))args.push(number(op.a));
    if(op.type==='text'||op.type==='textBox') {
      if(typeof op.text!=='string')throw new TypeError('Fixture text is missing');
      const escaped=Array.from(new TextEncoder().encode(op.text),byte=>'\\'+String(byte).padStart(3,'0')).join('');
      args.push('"'+escaped+'"');
    }
    if(op.type==='textBox')args.push(number(op.horizontalAlign),number(op.verticalAlign));
    return 'screen.'+name+'('+args.join(',')+')';
  }).join('\n')+'\nend';
}
