# Addon Lab の検証

2026-09-25。対象は`examples/addon-lab`のTypeScriptホスト実装例です。本体描画の正本・既存fixtureは変更していません。

## 実行範囲

| 項目 | 結果 |
|---|---|
| TypeScript strict / Vite production build | PASS |
| サンプルのunit・保存・実Addon WASMテスト | 14件 PASS |
| 本体Native回帰テスト | 57件 PASS |
| 本体JS・consumer型検証 | 17件 PASS |
| Cargoの生成物・境界・文書検査 / fmt check | PASS |
| Chromium / Firefox / WebKit | 各ブラウザで下記操作がPASS |
| 配信パス | production distを`/lab/`配下から配信し、相対URLとWASMを確認 |
| ブラウザエラー | pageerror / console.error / failed request なし |

Browserプラグインは利用できないため、通常のPlaywrightを使用しました。Linux上のheadless検証で、ChromiumはSwiftShader、他のエンジンはソフトウェアGLを使用しています。物理GPU・Windows/macOS/iOS実機での確認を意味しません。

## 操作確認

初回画面で本物のWASMを読み込み、3隻の船を生成。1tickと連続再生・停止を確認し、/spawnで4隻へ増加、/pingで仮HTTPの返信を確認しました。host.tsとworld.tsは実際のソースを読み取り専用で表示します。

CodeMirrorへ不正なLuaを入力して適用し、エラー表示を確認後、正常なprojectをimportして復旧しました。JSON書き出し・再読み込み・importでは船の数・位置・tickとg_savedataを保持。不正なimportでは元のprojectを破棄しません。ヘルプダイアログも実際に開閉しています。

画面サイズはデスクトップ1440×1000とモバイル390×844。スクリーンショットを目視確認し、状態表示の見切れを修正しました。モバイルで横方向のはみ出しはありません。画像・exportされた検証用projectはGit管理外のQA出力先に保存します。

## 環境

- chromium: 151.0.7922.34
- firefox: 153.0
- webkit: 26.5

依存版はサンプルのpackage-lock.jsonへ固定しています。ビルド時にはCodeMirrorとThree.jsのチャンクが500kBを超える旨の警告が出ます。機能上の失敗ではなく、サンプルではライブラリを分離した上で警告を残しています。

## 再実行

`npm --prefix examples/addon-lab ci`、`npm --prefix examples/addon-lab run build`、`npm --prefix examples/addon-lab test`、`npm --prefix examples/addon-lab run test:e2e`。

3エンジンの操作確認は`LAB_BROWSERS=chromium,firefox,webkit`を指定してください。ポートはQAプロセスが自動選択し、終了時にブラウザとサーバーを閉じます。devコマンドの常駐プロセスを本検証から残しません。

## 非対象

この仮物理をゲームの検証oracleにすること、全server APIを実装済みとすること、実ネットワーク通信、Luaコルーチンそのものの保存、実Addonシミュレータへの組み込みは対象外です。公開可否の監査も、この動作検証の合格とは別の判断です。
