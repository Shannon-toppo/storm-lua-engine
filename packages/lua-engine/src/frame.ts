import { Bridge, EngineError } from './bridge.js';

/** 検証済みの借用参照。フレームの差し替えや破棄の後に pixels を呼び出すと例外をスローします。 */
export class FrameLease {
  readonly format = 'game-rgba8' as const;
  readonly width: number;
  readonly height: number;
  readonly strideBytes: number;
  readonly #epoch: number;
  constructor(readonly bridge: Bridge, readonly handle: number, readonly assertAlive: () => void) {
    assertAlive();
    this.#epoch = bridge.query('frame_epoch', handle);
    this.width = bridge.query('frame_width', handle);
    this.height = bridge.query('frame_height', handle);
    this.strideBytes = this.width * 4;
  }
  /** 次のフレーム変更、メモリ解放、またはメモリ拡張が発生するまで参照します。WASM呼び出し後は再取得してください。 */
  get pixels(): Uint8Array {
    this.assertAlive();
    if (this.bridge.query('frame_epoch', this.handle) !== this.#epoch) throw new EngineError(3, 'Frame lease has expired');
    const pointer = this.bridge.query('frame_ptr', this.handle);
    const length = this.bridge.query('frame_len', this.handle);
    if (length !== this.strideBytes * this.height) throw new EngineError(4, 'Frame metadata and pixel size disagree');
    return this.bridge.bytes(pointer, length);
  }
  /** 所有されたスナップショット。pixels とは異なり、保持したり別のWorkerへ転送したりできます。 */
  copy(): Uint8Array { return this.pixels.slice(); }
}
