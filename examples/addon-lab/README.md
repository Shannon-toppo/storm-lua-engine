# Addon Lab

**Luaを編集して、TypeScriptのホストが動かす港のワールドで試すブラウザサンプル。**

Three.jsの3D表示、CodeMirror 6のLuaエディタ、本物のAddon WASMを組み合わせています。仮のワールドはすべてこのサンプル内のTypeScriptが所有し、本体エンジンには追加していません。説明・コメント・UIは日本語です。

## 起動する

Node.js 22.18以降を使用します。リポジトリルートから、最初に`npm --prefix packages/lua-engine ci`、続けて`npm --prefix packages/lua-engine run build`を実行してください。

実行用WASMがまだない場合は、[本体のビルド手順](../../docs/design/distribution.md)に従い、Emscripten SDKを有効にして`node tools/build-wasm.mjs`を実行します。すでに`packages/lua-engine/dist/wasm/`がある場合は不要です。

サンプルを準備するコマンドは`npm --prefix examples/addon-lab ci`。起動は`npm --prefix examples/addon-lab run dev`です。ポートは**5178**、待受アドレスは`0.0.0.0`なので、同じLANの別端末からもアクセスできます。開発サーバーをインターネットへ公開しないでください。

本体のAPIを変更した後は、本体をビルドし直し、サンプルの`npm ci`も再実行してください。サンプルは`file:`依存でインストールされたnpmパッケージの公開APIを利用します。

## 操作

| 操作 | 動作 |
|---|---|
| 適用・初期化 | 編集コードを新規Addonと新しい仮ワールドへ読み込み、`onCreate(true)`を呼ぶ |
| 再生／一時停止 | ホストの固定60Hzループを開始・停止する。速度は1×／2×／4× |
| 1 tick | `onTick(1)`、イベント配送、仮物理を1回進める |
| addon.lua／host.ts／world.ts | Luaを編集、または実際のTSホスト・仮物理ソースを読む。TSタブは読み取り専用 |
| イベント送信 | `onChatMessage`を呼ぶ。船団サンプルは`/spawn`、`/stop`、`/go`、`/ping`に対応 |
| ビークル選択・カメラ | 船または一覧をクリックして選択。ドラッグで回転、ホイールでズーム |
| 出力ログ／g_savedata／ホスト API | ログ、最後の保存データ、ホスト関数の署名と呼出回数を表示 |
| 書き出し／読み込み | バージョン付きJSONで、ソース・ワールド・Lua保存データを移行 |

初期サンプルは船団の巡回です。もう一つの「イベントと保存」は、1隻の船と基本コールバックを使う短いコードです。キーパッド名`Throttle`／`Steering`をサンプルの推進・旋回に接続しています。

## ホストの責任分担を読む

| ファイル | 役割 |
|---|---|
| [host.ts](src/host.ts) | `server.*`の実処理、戻り値、ログ、イベントの予約 |
| [world.ts](src/world.ts) | 船とワールドの正本、固定tickの簡易運動モデル |
| [session.ts](src/session.ts) | Addonの生成、load/start/tick、コールバックと仮HTTPの配送 |
| [project.ts](src/project.ts) | プロジェクト形式の検査、ローカル保存、import/export |
| [scene.ts](src/scene.ts) | ワールドをThree.jsへ投影、カメラ、選択、リソース解放 |
| [editor.ts](src/editor.ts) | CodeMirror、Lua構文表示、補完、読み取り専用のTS参照 |
| [main.ts](src/main.ts) | UI操作とセッションの合成。エンジン内部へのアクセスはしない |

`server`の呼び出しからそのままLuaへ再入しません。生成・削除で発生したイベントは予約しておき、呼び出しが戻ってから順番に`dispatch`します。

**ホストAPIは部分実装です。** `spawnVehicle`に渡せるプレハブは`rescue_boat`と`cargo_boat`だけで、ゲームのビークル保存ファイルを読み込む機能ではありません。未登録のサーバー関数、未知のモデル、未接続のキーパッドは明示的に失敗します。変換行列はY軸回転と平行移動だけをサポートし、ピッチ・ロール・拡大縮小を黙って捨てません。

`server.httpGet`は8080番ポートの`/status`だけに仮応答します。ネットワーク通信は一切行わず、それ以外の要求はキャンセルしてエラーにします。ユーザーコード、保存データ、ログを外部へ送信する処理もありません。

## 物理とアセットの範囲

速度の一次遅れ、舵によるヨー回転、小さな上下動のみを実装しています。流体、浮力、衝突、エンジン、ビークル構造の物理的な再現ではありません。最大24隻です。

港、船、海、灯台、木などはThree.jsの形状から組み立てたサンプル独自のモデルです。ゲームの地形・画像・モデルは使っていません。このサンプルの見た目や物理を本体の適合性判定用oracleにしてはいけません。画素描画の正本は本体の仕様と採用済みケースです。

WebGL 2が必要です。未対応環境やコンテキスト喪失は表示エラーとして報告し、静止画で動作しているように装いません。

## 保存・失敗・復元

編集中ソース、適用済みソース、仮ワールド、`g_savedata`、直近200件までのログをプロジェクトとして保持します。カメラ・選択・ソースタブなどのUI状態は同じブラウザ内だけに保存します。実行状態は1秒ごととページ終了時にチェックポイント化します。

ページ再読み込み時は、適用済みソースと保存したワールド・`g_savedata`からAddonを再生成し、`onCreate(false)`で復帰します。安全のため再生は自動再開しません。Lua VM全体やコルーチンの継続位置の保存ではありません。トップレベルと`onCreate(false)`に再実行の副作用があるコードでは、復元時にもその処理が実行されます。

不正なJSONや未対応versionをimportしても現在のprojectは破棄しません。新しいコードの初期化に失敗した場合は最後の正常なチェックポイントと編集内容を保持し、エラーを表示して停止します。循環テーブルなど保存できない`g_savedata`も、初期化成功として隠しません。ローカル保存の読み込みに失敗した場合は元データを上書きせず、有効なprojectのimportで復旧できます。

他のブラウザ・端末への移行には「書き出し」のJSONを使用してください。保存やimportはスクリプトの安全性を保証するものではありません。知らない人のコード・projectを実行する前には内容を確認してください。

## ビルドと検証

`npm --prefix examples/addon-lab run build`で`dist/`を生成します。任意の静的HTTPサーバーに配置でき、サブディレクトリ配信にも対応します。ローカル確認は`npm --prefix examples/addon-lab run preview`、ポート4178です。

`npm --prefix examples/addon-lab test`は仮物理・ホスト・保存形式・実Addon WASMのテストを実行します。`npm --prefix examples/addon-lab run test:e2e`はビルド済み`dist/`を起動してChromiumで操作検証します。先に`npx playwright install chromium firefox webkit`でブラウザを導入してください。

`LAB_BROWSERS=chromium,firefox,webkit`で3種類のブラウザを選択できます。QA出力先は環境変数`LAB_EVIDENCE_DIR`で指定します。指定がなければ一時ディレクトリを使用し、スクリーンショット・エクスポート結果はGitへ追加しません。GPUのないLinuxでは`LIBGL_ALWAYS_SOFTWARE=1`も使用できます。

検証では、デスクトップ1440×1000とモバイル390×844、編集・実行・一時停止・イベント・仮HTTP・復元・不正import・エラー後の復帰を確認します。WebKit上の成功をmacOSやiOS実機の動作保証とは扱いません。

## 配布とライセンス

このサンプルはprivate packageで、npmへ公開しません。本体のnpm成果物にもサンプルのThree.jsやCodeMirrorは入りません。21個の実行時依存のライセンス原文を`npm run licenses`で収集し、ブラウザ配布物の`THIRD_PARTY_LICENSES.txt`へ含めます。本体の描画構成要素／Rust依存の通知も`engine/`へ収録します。

`public/engine`、`dist`、`node_modules`、生成した権利表示ファイルはビルド成果物としてignoreしています。公開可否の最終判断や本体側アセットの監査は、このサンプルの動作確認とは別に扱ってください。


本体packageのファイル構成を変更した後は、このサンプルで`npm ci`を再実行してください。ローカルfile依存をコピーするnpm構成では、既存node_modulesが古いファイル一覧を保持する場合があります。`prepare:engine`は配信用の生成ディレクトリを作り直し、過去のファイルを静的配布へ混ぜません。

ローカルSDKは`.npmrc`の`install-links=true`で通常の梱包済み依存として導入します。npmの既定値に依存せず、lockfileと`npm ci`を一致させるための設定です。
