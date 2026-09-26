/** Development-only source supply. The host chooses logical names and source identities. */
export interface SourceChunk {
  /** Text Lua, not bytecode. The chunk executes in the VM's existing environment. */
  readonly source: string | Uint8Array;
  /** Exact debugger/chunk name, for example @lib/helper.lua. No file is opened by the SDK. */
  readonly name: string;
}
/**
 * Synchronously supply a source for include-once require. Return values from the
 * loaded Lua are discarded (LifeBoat-style, not standard package.loaded).
 * Resolve from a host-owned source snapshot; return no Promise and never call
 * vm.load from here. Throw for missing/denied modules. Reset/reload clears cache.
 */
export type RequireLoader = (moduleName: string) => SourceChunk;
