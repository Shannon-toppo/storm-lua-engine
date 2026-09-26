import { loadCompiler, type Compiler, type LuaProject } from '../../src/compiler.js';

const project: LuaProject = { entry: 'main', modules: { main: 'function onTick()end' } };
function consumer(compiler: Compiler): void {
  compiler.minify('function onTick()end', { target: 'vehicle', numericMode: 'exact' });
  compiler.build(project, { target: 'vehicle', minify: false });
  compiler.analyze(project, { target: 'vehicle' });
  const ids: string[] = compiler.passIds();
  void ids;
  // @ts-expect-error Addon optimization is not a supported compiler profile yet.
  compiler.minify('function onTick()end', { target: 'addon' });
  // @ts-expect-error Compiler instances do not expose VM state or scheduling.
  compiler.tick();
}
void consumer;
void loadCompiler({ wasmBinary: new Uint8Array() });
