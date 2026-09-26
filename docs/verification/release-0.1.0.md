# 0.1.0 ローカル検証記録

2026-09-26。Linux x86_64、Rust 1.97.1、Node 22.22.1、Emscripten 6.0.6で実行しました。ここに記載するローカル測定とGitHub Actionsの実行結果は区別します。公開commitのCI結果とReleaseの成果物はGitHub上で確認してください。

## 変更と契約

初回公開に向けて利用者向け文書、npm metadata、配布通知、梱包ゲートを整備しました。開発段階を示すだけの`IMPLEMENTATION_STATUS` exportは削除しました。Rust／Luaの実行処理、WASM ABI、数値規則、描画731ケース、フォント数値、savedata／checkpointとAddon Labのproject形式は変更していません。

SDKの通知とRust標準ライブラリの通知を追加し、生成されたJSにもEmscriptenの許諾表示を残してWASMを再ビルドしました。通知の元ファイルと生成物は[manifest](../../tools/toolchain-licenses.json)のSHA256で照合します。

## 実行結果

| 対象 | 結果 |
|---|---|
| Cargo | fmt、default check、default／all-targets・all-features Clippy、Rustdoc成功 |
| Native Rust | 56テスト成功、失敗・skip 0 |
| Rust利用例 | microcontroller、differential、addon_host成功 |
| JavaScript／TypeScript | 26テスト成功、consumer型検査成功 |
| Python検査ツール | 19テスト成功、固定toolchain通知の再生成照合成功 |
| 製品WASM | 19テスト成功、独立Lua backend probe成功 |
| Chromium 151.0.7922.34 | 731直接描画＋731実Lua描画、debugger、2 Worker、Addon／host機能成功 |
| Firefox 153.0 | 同上 |
| WebKit 26.5 | 同上 |
| Addon Lab | 14テスト成功、3ブラウザで1440×1000／390×844の編集・復旧・保存／復元・ホスト操作成功 |
| 梱包 | 43ファイル、独立offline npm install後にLua・描画・exportとNode consumer例を実行 |
| パス | SDK＋Addon Labの48ファイル／3WASMで配布パス検査成功 |

梱包ゲートの追加4テストは、完全なpackageの受理、WASM欠損、壊れたWASM、通知の改変・除外、不要な成果物の混入を検査します。検査用の最小WASMはゲート自体のunit test専用です。製品の実行検証には実際にビルドしたWASMを使用しました。

## CI環境との差分確認

Addon Labはnpm 10.9.8でもclean install・build・14テストを実行しました。`.npmrc`でfile依存の梱包方式を固定し、npmの既定値の違いを排除しています。

DISPLAY／WAYLAND_DISPLAYを除いたLinux環境ではFirefoxがWebGL2を作成できないことを確認しました。同じ環境にXvfbを用意すると3ブラウザすべてでdesktop／mobile試験が成功しました。CIでもこの仮想画面を使い、起動失敗時にはconsoleとネットワークエラーを出力します。

## 再実行と範囲

コマンドは[CONTRIBUTING](../../CONTRIBUTING.md)と[リリース手順](../release.md)を参照してください。配布直前に生成したtarballを`node tools/test-package.mjs <tarball>`へ渡すことで、公開対象そのものを再検査できます。

この測定は新たなゲーム内観察ではありません。実VSCode WebView、別CPU／OSの実測範囲、未確認のゲーム挙動は[TASKS](../../TASKS.md)とCI結果で管理します。ローカルの成功だけを、未実行のGitHub CIやnpm公開の成功として数えません。
