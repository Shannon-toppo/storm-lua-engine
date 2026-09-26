/** バイナリ描画バッチ: 8バイトのヘッダーに続き、バイトカラーまたはf64座標が配置されます。 */
export type Point = readonly [number, number];
export const MAP_COLORS = ['ocean','shallows','land','grass','sand','snow','rock','gravel'] as const;
export type MapColorKind = typeof MAP_COLORS[number];
export type DrawCommand =
  | { readonly kind: 'map'; readonly x: number; readonly z: number; readonly zoom: number }
  | { readonly kind: 'mapColor'; readonly target: MapColorKind; readonly rgba: readonly [number,number,number,number] }
  | { readonly kind: 'color'; readonly rgba: readonly [number, number, number, number] }
  | { readonly kind: 'clear' }
  | { readonly kind: 'line'; readonly from: Point; readonly to: Point }
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly fill: boolean }
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly radius: number; readonly fill: boolean }
  | { readonly kind: 'triangle'; readonly points: readonly [Point, Point, Point]; readonly fill: boolean }
  | { readonly kind: 'text'; readonly x: number; readonly y: number; readonly text: string | Uint8Array }
  | { readonly kind: 'textBox'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly horizontalAlign: number; readonly verticalAlign: number; readonly text: string | Uint8Array };
const encoder = new TextEncoder();
interface RecordData { opcode: number; numbers: readonly number[]; bytes: Uint8Array }
function record(command: DrawCommand): RecordData {
  const empty = new Uint8Array(0);
  switch (command.kind) {
    case 'color':
      if (command.rgba.length !== 4 || command.rgba.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new RangeError('RGBA must contain four byte components');
      return { opcode: 1, numbers: [], bytes: Uint8Array.from(command.rgba) };
    case 'map': return { opcode: 12, numbers: [command.x,command.z,command.zoom], bytes: empty };
    case 'mapColor': {
      const index = MAP_COLORS.indexOf(command.target);
      if (index < 0 || command.rgba.length !== 4 || command.rgba.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new RangeError('Invalid map palette color');
      return { opcode: 13, numbers: [], bytes: Uint8Array.from([index,...command.rgba]) };
    }
    case 'clear': return { opcode: 2, numbers: [], bytes: empty };
    case 'line': return { opcode: 3, numbers: [...command.from, ...command.to], bytes: empty };
    case 'rect': return { opcode: command.fill ? 5 : 4, numbers: [command.x, command.y, command.width, command.height], bytes: empty };
    case 'circle': return { opcode: command.fill ? 7 : 6, numbers: [command.x, command.y, command.radius], bytes: empty };
    case 'triangle': return { opcode: command.fill ? 9 : 8, numbers: command.points.flat(), bytes: empty };
    case 'text': return { opcode: 10, numbers: [command.x, command.y], bytes: typeof command.text === 'string' ? encoder.encode(command.text) : command.text };
    case 'textBox': return { opcode: 11, numbers: [command.x, command.y, command.width, command.height, command.horizontalAlign, command.verticalAlign], bytes: typeof command.text === 'string' ? encoder.encode(command.text) : command.text };
  }
}
/** 一度エンコードしたバイト列を再利用して、繰り返しラスタライズできます。 */
export function encodeCommands(commands: readonly DrawCommand[]): Uint8Array {
  if (commands.length > 65536) throw new RangeError('Too many drawing commands');
  const records = commands.map(record);
  let length = 0;
  for (const r of records) {
    length += 8 + r.numbers.length * 8 + r.bytes.byteLength;
    if (length > 8 * 1024 * 1024) throw new RangeError('Drawing batch exceeds 8 MiB');
  }
  const result = new Uint8Array(length);
  const view = new DataView(result.buffer);
  let offset = 0;
  for (const r of records) {
    view.setUint16(offset, r.opcode, true);
    view.setUint32(offset + 4, r.numbers.length * 8 + r.bytes.byteLength, true);
    offset += 8;
    for (const n of r.numbers) { view.setFloat64(offset, n, true); offset += 8; }
    result.set(r.bytes, offset); offset += r.bytes.byteLength;
  }
  return result;
}
