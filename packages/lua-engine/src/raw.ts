import type { MemorySource } from './bridge.js';
import { ABI } from './generated.js';

/** 共有されていない wasm32 メモリへの、有効な借用ウィンドウ。スナップショットではありません。 */
export interface CompositeIoViews {
  readonly inputNumbers: Float32Array;
  readonly inputBooleans: Uint8Array;
  readonly outputNumbers: Float32Array;
  readonly outputBooleans: Uint8Array;
}

/**
 * memory.grow の後にビューを再取得します。所有者はI/Oブロックを解放/再割り当てする前に
 * このオブジェクトを無効化しなければなりません。以前に返された TypedArray を失効させることはできません。
 * メモリ割り当てを伴うWASM呼び出しや await 境界をまたいで借用ビューを保持しないでください。
 */
export class RawIoView {
  readonly #memory: MemorySource;
  readonly #offset: number;
  #alive = true;
  #buffer: ArrayBuffer | undefined;
  #views: CompositeIoViews | undefined;

  constructor(memory: MemorySource, byteOffset: number, abiVersion: number) {
    if (abiVersion !== ABI.abiVersion) throw new RangeError(`Unsupported ABI ${abiVersion}`);
    if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset % ABI.ioAlignment !== 0) {
      throw new RangeError('I/O offset must be a non-negative aligned integer');
    }
    this.#memory = memory;
    this.#offset = byteOffset;
    this.borrow();
  }

  /** 現在のバッファを借用します。データのコピーは行いません。 */
  borrow(): CompositeIoViews {
    if (!this.#alive) throw new Error('I/O block has been invalidated');
    const buffer = this.#memory.buffer;
    if (!(buffer instanceof ArrayBuffer)) throw new TypeError('Shared memory requires a separate synchronization adapter');
    if (this.#offset > buffer.byteLength - ABI.ioByteLength) throw new RangeError('I/O block is outside WASM memory');
    if (this.#buffer !== buffer || this.#views === undefined) {
      this.#buffer = buffer;
      const at = (offset: number): number => this.#offset + offset;
      this.#views = {
        inputNumbers: new Float32Array(buffer, at(ABI.inputNumbersOffset), ABI.channelCount),
        inputBooleans: new Uint8Array(buffer, at(ABI.inputBooleansOffset), ABI.channelCount),
        outputNumbers: new Float32Array(buffer, at(ABI.outputNumbersOffset), ABI.channelCount),
        outputBooleans: new Uint8Array(buffer, at(ABI.outputBooleansOffset), ABI.channelCount),
      };
    }
    return this.#views;
  }

  /** エンジン呼び出しの前に正規のブール値入力を検証します。 */
  validateInputs(): void {
    for (const value of this.borrow().inputBooleans) {
      if (value > 1) throw new RangeError('Boolean input must be encoded as 0 or 1');
    }
  }

  /** 所有者による解放/再割り当てをマークします。WASMメモリ自体を解放するわけではありません。 */
  invalidate(): void { this.#alive = false; this.#views = undefined; this.#buffer = undefined; }
}
