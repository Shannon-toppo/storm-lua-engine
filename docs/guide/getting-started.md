# 利用をはじめる

IDE・シミュレータ・画像生成ツール・自動テストへLua実行を組み込む開発者向けのガイドです。エンジン自身を開発するための手順は[CONTRIBUTING](../../CONTRIBUTING.md)に分離しています。

## 1. 必要な入口だけを選ぶ

| アプリケーション側の目的 | TypeScript | Rust |
|---|---|---|
| ビークルの制御と画面 | `loadRuntime()` → `createVehicle()` | `storm-lua-microcontroller` |
| アドオン・ミッション | `loadRuntime()` → `createAddon()` | `storm-lua-addon` |
| 描画命令から画像を生成 | `/raster` → `loadRaster()` | `storm-screen-raster` |
| API情報やデータ型だけ | モード別catalog | `storm-lua-spec` |

ビークルとAddonの型・環境・生のWASMハンドルの検査を分離しています。`createVm()`という曖昧な入口はありません。ビークルには`createVehicle()`、Addonには`createAddon()`を使用してください。

## 2. インストールする

TypeScript／JavaScriptでは`npm install @stormcat-works/storm-lua-engine`を実行します。JS、型定義、実行用・描画専用WASMを同梱しています。利用するだけならRustやEmscriptenは不要です。

オフライン環境では[GitHub Releases](https://github.com/Stormcat-Works/storm-lua-engine/releases/tag/v0.1.0)のtarballを取得し、`npm install ./stormcat-works-storm-lua-engine-0.1.0.tgz`でインストールできます。

Rustでは、アプリのCargo.tomlに例えば`storm-lua-addon = { git = "https://github.com/Stormcat-Works/storm-lua-engine", tag = "v0.1.0" }`を追加します。debuggerを使う場合は`features = ["debug"]`を指定します。Lua実行クレートはvendored LuaのビルドにCコンパイラを使用します。描画専用クレートにLuaバックエンドは含まれません。

RustクレートはGit依存で配布します。描画だけなら同じGit URLとタグで`storm-screen-raster`を指定してください。ローカルで本体を開発する場合には、クローンしたクレートへの`path`依存も使えます。

## 3. 初期化と実行

ブラウザでは`await loadRuntime()`で初期化します。以後の`load`、`tick`、`draw`は同じスレッド上で同期実行されます。bundler/WebViewでアセットURLを変更する場合は`moduleUrl`と`wasmUrl`を渡すか、初期化済みEmscripten moduleを`fromEmscripten(module)`へ渡します。

Nodeでは`import.meta.resolve('@stormcat-works/storm-lua-engine/wasm/storm_lua_wasm.wasm')`でパッケージ内のWASMを解決し、読み込んだbytesを`loadRuntime({ wasmBinary })`へ渡します。ファイルの読み込みはNode側が担当します。

全体を試す場合は、[Node利用例](../../examples/consumer/node.mjs)をインストール済みアプリへコピーして`node node.mjs`を実行します。ビークル制御、ホスト地図、Addonのサーバー関数、ログ、HTTPの手動返信、保存・復元まで含みます。合成した地図と手動返信は例のホストが明示提供するもので、エンジンの暗黙フォールバックではありません。

Rustの対応例は[addon_host.rs](../../conformance/examples/addon_host.rs)です。このリポジトリ内では`cargo run -p storm-lua-conformance --example addon_host --locked`で実行できます。consumerがconformanceクレートへ依存する必要はありません。

## 4. 結果とメモリを扱う

`load`／`tick`／`draw`／`resume`は`completed`、`suspended`、`missing`を区別します。`suspended`はデバッグ停止であり、コールバック終了ではありません。別のtickや設定更新を行わず、検査後に`resume()`してください。

Rustの失敗は`Result`、TSのエンジン失敗は`EngineError`で返します。JS側の不正な型・範囲は`TypeError`／`RangeError`の場合もあります。複数の失敗（Luaとログ配送など）が同時に起きた場合は`AggregateError`で両方を保持します。

`vehicle.io`は320byteのI/Oへの借用ビューです。LuaやWASMで確保が起きた後は`vehicle.io`を取り直します。`vehicle.frame().pixels`は次のフレーム変更・reset・disposeまでの借用で、`vehicle.frame().copy()`は保持やWorker transfer用の所有コピーです。既に取得したTypedArrayを後から強制回収できる仕組みではありません。

## 5. 実行環境へ接続する

表示には任意のCanvas/GPU処理を使えます。`/canvas`の`CanvasPresenter`は、ホストが渡したcanvasへ明示的にコピーします。ループやWorkerは作りません。[ブラウザ例](../../examples/browser/index.html)と[Worker例](../../examples/browser/runtime-worker.js)を参照してください。

未信頼LuaをUIスレッドで長時間動かすことは避け、必要ならWorkerへ分離します。Lua命令予算は長時間のホスト関数を中断する保証ではありません。使用後は必ず`dispose()`を呼びます。Addonの`onDestroy`も実行する場合は、その前に`destroy()`を明示します。

次は[Addonガイド](addons.md)、[ホスト機能・ログガイド](host-services.md)、[API一覧](api-reference.md)から目的の項目へ進んでください。
