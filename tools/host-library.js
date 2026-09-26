/** Emscripten --js-library 入力。eval、関数ポインタレジストリ、非同期中断は含みません。 */
addToLibrary({
  sle_host_invoke__sig: 'iiii',
  sle_host_invoke: function(key, pointer, length) {
    Module['sleHostBuffer'] = new Uint8Array(0);
    try {
      pointer = pointer >>> 0; length = length >>> 0;
      if (length > 4 * 1024 * 1024 || pointer > HEAPU8.length - length) throw new RangeError('Invalid host request memory');
      var handler = Module['sleHost'];
      if (typeof handler !== 'function') throw new Error('No host service dispatcher was installed');
      var result = handler(key >>> 0, HEAPU8.slice(pointer, pointer + length));
      if (!(result instanceof Uint8Array)) throw new TypeError('Host services must synchronously return Uint8Array, not a Promise');
      if (result.length > 16 * 1024 * 1024) throw new RangeError('Host response exceeds 16 MiB');
      Module['sleHostBuffer'] = result.slice();
      return 0;
    } catch (error) {
      var message = error instanceof Error ? error.message : String(error);
      Module['sleHostBuffer'] = new TextEncoder().encode(message.slice(0,16384));
      return error && [2,4,5,6].includes(error.code) ? error.code : 10;
    }
  },
  sle_host_length__sig: 'i',
  sle_host_length: function() {
    var bytes = Module['sleHostBuffer'];
    return bytes instanceof Uint8Array ? bytes.length : 0;
  },
  sle_host_read__sig: 'iii',
  sle_host_read: function(pointer, length) {
    pointer = pointer >>> 0; length = length >>> 0;
    var bytes = Module['sleHostBuffer'];
    if (!(bytes instanceof Uint8Array) || bytes.length !== length || pointer > HEAPU8.length - length) return -1;
    HEAPU8.set(bytes, pointer);
    Module['sleHostBuffer'] = new Uint8Array(0);
    return length;
  }
});
