# Storm Lua Engine

**StormworksのビークルLuaとAddon Luaを、アプリケーションに組み込むためのWASM SDK。**

このパッケージはRust製Lua 5.3実行系、Stormworks向けのCPU描画、同梱フォント、デバッガ、型定義を含みます。実際のワールド、地形データ、UI、ネットワーク通信は利用するアプリケーションが担当します。

## インストール

`npm install @stormcat-works/storm-lua-engine`

WASMと型定義は同梱済みです。利用時にRustやEmscriptenをインストールする必要はありません。

## 入口を選ぶ

| 目的 | 入口 |
|---|---|
| ビークルLua | `loadRuntime()` → `engine.createVehicle(options)` |
| Addon Lua | `loadRuntime()` → `engine.createAddon(options)` |
| 描画のみ | `/raster`の`loadRaster()` → `createRaster(width, height)` |
| Canvas表示 | `/canvas`の`CanvasPresenter` |

ビークルは`load(source)`、`tick()`、`draw(width, height)`で駆動します。Compositeは`vehicle.io`のFloat32Array/Uint8Arrayから読み書きし、画素は`vehicle.frame().pixels`で借用、`copy()`で所有します。メモリ拡張後はビューを取り直してください。

Addonは`load(source)`、`start()`、`tick(gameTicks)`、`dispatch(callback, args)`で駆動します。`g_savedata`は`savedata()`で取得し、`encodeSavedata`／`decodeSavedata`で携帯可能な形式にします。復元は新しいAddonの`newWorld:false`と`savedata`、または`reload(checkpoint)`を使用します。AddonにはComposite I/Oやdrawメソッドはありません。

## ホスト機能をつなぐ

`createVehicle({ mapProvider })`で`drawMap`用の同期地図rendererを指定できます。返す値は正確にwidth×height×4のRGBA bytes。未指定の地形を架空画像で代用しません。

`createAddon({ server: { getPlayers: () => [playerTable] } })`のように必要なserver関数を登録します。戻り値は常に結果の配列です。Lua integerにはbigint、floatにはnumber、byte stringにはUint8Array、テーブルには`luaTable`または明示的なentry listを使用します。同期queryへPromiseを返すことはできません。

`onLog(record)`でprint/debug.logをコンソールやIDEへ接続できます。recordはsourceとbytesを持ち、Luaの実行が戻った後に配送されます。手動処理には`drainLogRecords`／`flushLogs`もあります。

HTTPは`drainHttpRequests`からhostへ渡され、hostが実通信を行ってから`httpReply(token, bytes)`または`cancelHttp(token)`を呼びます。自動で外部へ通信しません。

## ロードと破棄

ブラウザは`await loadRuntime()`、NodeではWASMを明示的に読み`loadRuntime({ wasmBinary })`を使用します。WASMのexport pathは`@stormcat-works/storm-lua-engine/wasm/storm_lua_wasm.wasm`。独自bundlerやWebViewでは`moduleUrl`／`wasmUrl`または`fromEmscripten(module)`でアセットを接続します。

load/tick/draw/start/resumeはcompleted/suspended/missingを返し、エラーはEngineErrorなどの例外です。停止中は次のcallbackを重ねず、debuggerで確認してresumeします。使用後は必ずdispose。AddonのonDestroyも呼びたい場合は先にdestroyを明示してください。

## 配布とライセンス

npm registryまたはGitHub Releasesのtarballからインストールできます。runtime npm依存はありません。ブラウザごとの制約、全server APIのホスト実装、ゲームのsave XML直接互換は含まれません。

詳しい利用ガイド・検証範囲・そのまま実行できるNode/Rust例は、ソースリポジトリ`Stormcat-Works/storm-lua-engine`の`docs/guide/`と`examples/`にあります。MIT License。描画構成要素と外部依存の権利表示は同梱のSCREEN_COMPONENTS_LICENSE、THIRD_PARTY_LICENSES.txt、TOOLCHAIN_LICENSES.txt、RUST_STD_LICENSES.htmlを参照してください。
