import { adaptModule, Bridge, unsigned, type Backend } from './bridge.js';
import { encodeCommands, type DrawCommand } from './commands.js';
import { FrameLease } from './frame.js';

export class Raster {
  #disposed = false;
  constructor(readonly bridge: Bridge, readonly handle: number) {}
  #alive = (): void => { if (this.#disposed) throw new Error('Raster is disposed'); };
  /** 完全なバイナリバッチごとに1つの境界呼び出しを行います。呼び出し元は繰り返し使用する入力を事前エンコードできます。 */
  render(commands: readonly DrawCommand[] | Uint8Array): FrameLease {
    this.#alive();
    const bytes = commands instanceof Uint8Array ? commands : encodeCommands(commands);
    this.bridge.upload(bytes, (pointer, length) => this.bridge.call('render', this.handle, pointer, length));
    return this.frame();
  }
  frame(): FrameLease { this.#alive(); return new FrameLease(this.bridge, this.handle, this.#alive); }
  dispose(): void {
    if (!this.#disposed) { this.bridge.call('dispose', this.handle); this.#disposed = true; }
  }
}
export class RasterEngine {
  readonly bridge: Bridge;
  constructor(backend: Backend) { this.bridge = new Bridge(backend); if (!(this.bridge.capabilities & 1)) throw new Error('Module does not support rasterization'); }
  createRaster(width: number, height: number): Raster {
    return new Raster(this.bridge, this.bridge.query('new', unsigned(width, 'width'), unsigned(height, 'height')));
  }
}
export interface RasterInitOptions { readonly wasmUrl?: string | URL; readonly wasmBinary?: Uint8Array }
/** Node環境の呼び出し元はバイト列を直接渡すことができます。ブラウザ環境ではデフォルトの隣接WASM URLを使用できます。 */
export async function loadRaster(options: RasterInitOptions = {}): Promise<RasterEngine> {
  let bytes = options.wasmBinary;
  if (!bytes) {
    const response = await fetch(options.wasmUrl ?? new URL('./wasm/screen.wasm', import.meta.url));
    if (!response.ok) throw new Error(`Raster WASM fetch failed: HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const { instance } = await WebAssembly.instantiate(bytes);
  return new RasterEngine(adaptModule(instance.exports, 'sls'));
}
export { encodeCommands } from './commands.js';
export type { DrawCommand } from './commands.js';
export { FrameLease } from './frame.js';
