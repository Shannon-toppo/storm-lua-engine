/** raw RGBAをImageDataで表示する、任意の描画アダプタ。 */
import type { FrameLease } from './frame.js';
export class CanvasPresenter {
  #image: ImageData | undefined;
  constructor(readonly context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {}
  /** 再利用可能な ImageData にコピーします。アルファ、ガンマ、またはエンジンの生バッファを変更しません。 */
  present(frame: FrameLease): void {
    if (!this.#image || this.#image.width !== frame.width || this.#image.height !== frame.height) {
      this.context.canvas.width = frame.width;
      this.context.canvas.height = frame.height;
      this.#image = this.context.createImageData(frame.width, frame.height);
    }
    this.#image.data.set(frame.pixels);
    this.context.putImageData(this.#image, 0, 0);
  }
}
