/** 2つの検証済みC ABIへの最小限の型付きアクセス。スケジューラやUIへの依存はありません。 */
import { ABI } from './generated.js';

export type Outcome = 'completed' | 'suspended' | 'missing';
export class EngineError extends Error {
  constructor(readonly code: number, message: string) { super(message); this.name = 'EngineError'; }
}
export interface MemorySource { readonly buffer: ArrayBufferLike }
export type WasmFunction = (...args: number[]) => number;
export interface Backend { readonly memory: MemorySource; readonly functions: Readonly<Record<string, WasmFunction>> }
const utf8 = new TextDecoder('utf-8', { fatal: true });

export function unsigned(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${label} must be a u32`);
  return value;
}
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Expected a protocol object');
  return value as Record<string, unknown>;
}
export function byteArray(value: unknown): Uint8Array {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255)) throw new TypeError('Invalid protocol byte array');
  return Uint8Array.from(value as number[]);
}
export class Bridge {
  #inCall = false;
  readonly capabilities: number;
  constructor(readonly backend: Backend) {
    if (this.invoke('abi_version') !== ABI.abiVersion) throw new EngineError(6, 'Unsupported engine ABI version');
    this.capabilities = this.invoke('capabilities');
  }
  /** 同期ホストコールバックがWASMに割り込んでいる間、新規のメモリ参照を拒絶します。 */
  assertIdle(): void { if (this.#inCall) throw new EngineError(5, 'WASM is executing a host callback'); }
  invoke(name: string, ...args: number[]): number {
    const fn = this.backend.functions[name];
    if (!fn) throw new EngineError(6, `Missing WASM export: ${name}`);
    if (this.#inCall) throw new EngineError(5, 'Reentrant call into the same WASM module');
    this.#inCall = true;
    try { return fn(...args); } finally { this.#inCall = false; }
  }
  bytes(pointer: number, length: number): Uint8Array {
    const buffer = this.backend.memory.buffer;
    if (!(buffer instanceof ArrayBuffer)) throw new EngineError(6, 'Shared memory requires an explicit synchronization adapter');
    unsigned(pointer, 'pointer'); unsigned(length, 'length');
    if (pointer > buffer.byteLength - length) throw new RangeError('Buffer lies outside WASM memory');
    return new Uint8Array(buffer, pointer, length);
  }
  error(code: number): EngineError {
    // 通常のABI呼び出し（解放処理を含む）によって診断情報がクリアされる前に読み取ります。
    const pointer = this.invoke('error_ptr') >>> 0;
    const length = this.invoke('error_len') >>> 0;
    return new EngineError(code, length ? utf8.decode(this.bytes(pointer, length)) : `Engine status ${code}`);
  }
  status(code: number): Outcome {
    if (code === 0) return 'completed';
    if (code === 7) return 'suspended';
    if (code === 8) return 'missing';
    throw this.error(code);
  }
  call(name: string, ...args: number[]): Outcome { return this.status(this.invoke(name, ...args)); }
  query(name: string, ...args: number[]): number {
    const value = this.invoke(name, ...args) >>> 0;
    const error = this.invoke('error_status');
    if (error !== 0) throw this.error(error);
    return value;
  }
  upload<T>(input: Uint8Array, action: (pointer: number, length: number) => T): T {
    if (input.byteLength > 16 * 1024 * 1024) throw new RangeError('Upload exceeds 16 MiB');
    // 入力データ自体がWASMメモリをエイリアスしている可能性があるため、メモリ伸長に伴うdetachが発生する前にコピーします。
    const stable = input.buffer === this.backend.memory.buffer ? input.slice() : input;
    const pointer = this.query('alloc', Math.max(1, stable.byteLength));
    if (pointer === 0) throw new EngineError(2, 'Upload allocation returned a null pointer');
    try {
      this.bytes(pointer, stable.byteLength).set(stable);
      // クリーンアップ前に、アクション側でステータス変換/レスポンス読み取りを完了させる必要があります。
      return action(pointer, stable.byteLength);
    } finally { this.call('dealloc', pointer); }
  }
  response(): unknown {
    const pointer = this.invoke('response_ptr') >>> 0;
    const length = this.invoke('response_len') >>> 0;
    return JSON.parse(utf8.decode(this.bytes(pointer, length))) as unknown;
  }
}

/** 外部モジュールを一度だけ検証し、ホットコール用に直接の関数参照を保持します。 */
export function adaptModule(module: unknown, prefix: 'sle' | 'sls', emscripten = false): Backend {
  const record = object(module);
  const functions: Record<string, WasmFunction> = {};
  const marker = (emscripten ? '_' : '') + prefix + '_';
  for (const [name, value] of Object.entries(record)) {
    if (name.startsWith(marker) && typeof value === 'function') functions[name.slice(marker.length)] = value as WasmFunction;
  }
  const memory: MemorySource = emscripten ? {
    get buffer(): ArrayBufferLike {
      const heap = record['HEAPU8'];
      if (!(heap instanceof Uint8Array)) throw new TypeError('Emscripten module has no HEAPU8');
      return heap.buffer;
    },
  } : (() => {
    const value = record['memory'];
    if (!(value instanceof WebAssembly.Memory)) throw new TypeError('WASM module has no exported memory');
    return value;
  })();
  return { memory, functions };
}
