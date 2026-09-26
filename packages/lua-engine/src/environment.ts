/** Script-visible environment selection; independent from Vehicle/Addon and host debugging. */
import { encodeLuaValue, type LuaValue } from './values.js';
import type { ServerFunctions } from './host.js';
import type { RequireLoader } from './source.js';
export type EnvironmentProfile = 'game' | 'extended';
export interface HostBindings {
  /** Dot-separated paths. null removes a binding. */
  readonly values?: Readonly<Record<string, LuaValue>>;
  /** Synchronous callbacks; results are lists and cannot contain functions/threads/userdata. */
  readonly functions?: ServerFunctions;
}
/** Paths to supply to compiler options when using these runtime bindings. */
export function bindingPaths(bindings: HostBindings = {}): string[] {
  const paths = [...Object.keys(bindings.values ?? {}), ...Object.keys(bindings.functions ?? {})];
  if (paths.length > 512 || new Set(paths).size !== paths.length) throw new TypeError('Invalid or duplicate host bindings');
  for (const path of paths) {
    if (path.length > 128 || !path.split('.').every(part => /^[A-Za-z_][A-Za-z_0-9]*$/.test(part) && part !== '_ENV' && part !== '_G')) throw new TypeError(`Invalid host binding path: ${path}`);
    if (paths.some(other => other !== path && path.startsWith(other + '.'))) throw new TypeError('Host binding paths overlap');
  }
  return paths.sort();
}
export function environmentWire(environment: EnvironmentProfile = 'game', bindings: HostBindings = {}, requireLoader?: RequireLoader): Record<string, unknown> {
  if (environment !== 'game' && environment !== 'extended') throw new TypeError('Unknown Lua environment');
  const paths = bindingPaths(bindings);
  if (requireLoader !== undefined) {
    if (typeof requireLoader !== 'function') throw new TypeError('requireLoader must be a synchronous function');
    if (environment !== 'extended') throw new TypeError('requireLoader requires the extended environment');
    if (paths.some(path => path === 'require' || path.startsWith('require.'))) throw new TypeError('requireLoader conflicts with require bindings');
  }
  if (paths.length && environment !== 'extended') throw new TypeError('Host bindings require the extended environment');
  if (Object.values(bindings.functions ?? {}).some(value => typeof value !== 'function')) throw new TypeError('Host bindings must be synchronous functions');
  return {environment, requireLoader: requireLoader !== undefined, bindings: {
    values: Object.fromEntries(Object.entries(bindings.values ?? {}).map(([path, value]) => [path, encodeLuaValue(value)])),
    functions: Object.keys(bindings.functions ?? {}),
  }};
}
