/** PlaygroundのJSON入出力。Luaの値の妥当性はSDKが検査します。 */
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('オブジェクトが必要です');
  return value as Record<string, unknown>;
}
export function text(value: unknown, label = '値'): string {
  if (typeof value !== 'string') throw new TypeError(`${label}は文字列で指定してください`);
  return value;
}
export function integer(value: unknown, minimum = 0, maximum = 4096): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`${minimum}〜${maximum}の整数が必要です`);
  return value;
}
export function decodeWire(value: unknown, depth = 0): unknown {
  if (depth > 64) throw new RangeError('入力が深すぎます');
  if (value instanceof Uint8Array || value instanceof Float32Array) return value;
  if (Array.isArray(value)) return value.map(v => decodeWire(v, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const record = object(value), keys = Object.keys(record);
  if (keys.length === 1 && '$i64' in record) {
    const v = BigInt(text(record['$i64']));
    if (v < -(1n << 63n) || v >= (1n << 63n)) throw new RangeError('i64範囲外');
    return v;
  }
  if (keys.length === 1 && '$bytes' in record) {
    const bytes = record['$bytes'];
    if (!Array.isArray(bytes)) throw new TypeError('$bytesには配列が必要です');
    return Uint8Array.from(bytes.map(v => integer(v, 0, 255)));
  }
  if (keys.length === 1 && '$number' in record) {
    switch (record['$number']) {
      case 'NaN': return NaN; case 'Infinity': return Infinity; case '-Infinity': return -Infinity; case '-0': return -0;
      default: throw new TypeError('不正な特殊数値');
    }
  }
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, decodeWire(v, depth + 1)]));
}
export function stringify(value: unknown, space = 2): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (typeof entry === 'bigint') return {$i64: entry.toString()};
    if (entry instanceof Uint8Array || entry instanceof Uint8ClampedArray) return {$bytes: Array.from(entry)};
    if (entry instanceof Float32Array) return Array.from(entry);
    if (typeof entry === 'number' && (!Number.isFinite(entry) || Object.is(entry, -0))) return {$number: Object.is(entry, -0) ? '-0' : String(entry)};
    return entry;
  }, space) ?? 'null';
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
