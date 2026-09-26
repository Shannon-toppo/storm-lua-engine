/** 配布用Rustビルドだけに適用するパス正規化。利用者のグローバル設定は変更しません。 */
import {homedir} from 'node:os';
import {join} from 'node:path';

export function buildEnvironment(root, target, environment = process.env, home = homedir()) {
  const inherited = environment.CARGO_ENCODED_RUSTFLAGS;
  if (environment.RUSTFLAGS && !inherited) throw new Error('Use CARGO_ENCODED_RUSTFLAGS instead of ambiguous RUSTFLAGS for distribution builds');
  // rustcは最後に一致した規則を使うため、広いホームの置換より具体的な規則を後に置きます。
  const rules = [
    [home, '/build-home'],
    [environment.CARGO_HOME || join(home, '.cargo'), '/dependencies/cargo'],
    [target, '/build/target'],
    [root, '/workspace/storm-lua-engine'],
  ];
  const flags = [];
  for (const [from, to] of rules) {
    if (!from || from === '/' || from === '\\') throw new Error('Refusing an empty or root path remapping');
    for (const spelling of new Set([from, from.replaceAll('\\', '/')])) flags.push(`--remap-path-prefix=${spelling}=${to}`);
  }
  return {...environment, CARGO_ENCODED_RUSTFLAGS: [inherited, ...flags].filter(Boolean).join('\x1f')};
}
