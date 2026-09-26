/** 配布時のパス正規化と検出器を、実ビルドとは独立した小入力で検証します。 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEnvironment} from '../../../tools/build-paths.mjs';
import {findPrivatePaths} from '../../../tools/check-artifacts.mjs';

test('配布ビルドのパス置換は具体的な規則を最後にし、元の環境を変更しない',()=>{
  const env={CARGO_HOME:'/home/example/cache',CARGO_ENCODED_RUSTFLAGS:'-C\x1fopt-level=3'};
  const result=buildEnvironment('/home/example/repo','/tmp/build',env,'/home/example');
  const flags=result.CARGO_ENCODED_RUSTFLAGS.split('\x1f');
  assert.deepEqual(flags.slice(0,2),['-C','opt-level=3']);
  assert.equal(flags.at(-1),'--remap-path-prefix=/home/example/repo=/workspace/storm-lua-engine');
  assert.ok(flags.includes('--remap-path-prefix=/home/example/cache=/dependencies/cargo'));
  assert.equal(env.CARGO_ENCODED_RUSTFLAGS,'-C\x1fopt-level=3');
});
test('曖昧なRUSTFLAGSやルート全体の置換は拒否する',()=>{
  assert.throws(()=>buildEnvironment('/repo','/build',{RUSTFLAGS:'-C opt-level=3'},'/home/example'));
  assert.throws(()=>buildEnvironment('/repo','/build',{},'/'));
});
test('Windowsの両区切り文字にパス正規化を適用する',()=>{
  const env=buildEnvironment('C:\\Users\\Example\\repo','C:\\build',{},'C:\\Users\\Example');
  assert.ok(env.CARGO_ENCODED_RUSTFLAGS.includes('--remap-path-prefix=C:/Users/Example/repo=/workspace/storm-lua-engine'));
});
test('既知のホームとUTF-8/UTF-16のユーザーパスを検出する',()=>{
  for (const [path,encoding] of [['/home/example/file.rs','utf8'],['/Users/example/src.rs','utf8'],['C:\\Users\\Example\\file.rs','utf16le']]) {
    assert.ok(findPrivatePaths(Buffer.from(path,encoding),[]).length>0);
  }
  assert.ok(findPrivatePaths(Buffer.from('/private/build/source.rs'),['/private/build']).length>0);
});
test('正規化済みの依存パスと仮想FSの標準ユーザーは個人情報と誤認しない',()=>{
  assert.deepEqual(findPrivatePaths(Buffer.from('/dependencies/cargo/src/lib.rs /workspace/storm-lua-engine/src/lib.rs /home/web_user/'),[]),[]);
});
