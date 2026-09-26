# Architecture

## Semantic owners

| Owner | Responsibility | Direct internal dependencies |
|---|---|---|
| `storm-lua-spec` | I/O・property・draw types、ScreenSink、binary batch、API catalog、ABI constants | none |
| `storm-screen-raster` | 画面契約の幾何/文字/色をpixelへ展開、同梱font | spec |
| `storm-lua-vm` | Lua backend、sandbox、制限・continuation・debugger、owned values、構造化log | none |
| `storm-lua-microcontroller` | Lua API登録、tick/draw phase、signal/property/command状態 | spec, vm |
| `storm-lua-addon` | Addon lifecycle、menu property、savedata、server登録、matrix、HTTP | spec, vm |
| `storm-lua-bridge` | adapter間で共有する世代付きhandle、upload/response/errorの所有権 | spec |
| `storm-lua-wasm` | Native契約のEmscripten公開、JSON cold codec、mode検査、JS host import、I/O/frame所有 | spec, vm, microcontroller, addon, raster, bridge |
| `storm-screen-wasm` | Lua非依存のbinary raster境界 | spec, raster, bridge |

許可edgeは[architecture.json](../../tools/architecture.json)で機械検査する。大小やLOCではなく、実際の利用条件と所有者で分割する。共有bridgeは2つのWASM adapterに重複していた安全な所有権処理のownerで、ゲーム処理・Lua・JSON・rasterへ依存しない。

microcontrollerはrasterに依存しない。DrawCommandとScreenSinkを通して、命令記録・CPU frame・独自描画先を合成する。WASM runtimeは利用者の便宜のためrasterを合成するが、Native APIへ強制しない。

## Native and JS

NativeはCargoによるsource依存で、C ABI/JSONへ迂回しない。backend固有の拡張はVMの`backend-mlua`featureに明示する。通常利用APIのために全mlua型をre-exportしない。

JSは1npm packageでruntime/raster/raw/debug/commands/canvasの入口を持つ。raster-onlyはLuaをロードしない。runtimeとrasterのmoduleを両方作るとmemory/allocator/handle registryは独立する。相互にpointerを渡さない。

hot pathは固定binary32 I/O、command batch、借用frame。cold pathはsource/property/debug/logの構造化codec。propertyとdebugの数値/文字列は損失のないタグ付き表現を使う。Canvas、Worker、物理世界、実通信はhostが明示的に組み立てる。

## Tests and growth

conformanceはtest-only、xtaskはtoolであり、製品から依存できない。declared dependenciesはtarget/optional/dev/aliasを含めて検査する。generated API/ABI/fontと採用済み画面コーパスのhashも同じgateで検証する。

Addonはvmを直接使う別crateとして実装した。microcontroller/rasterへ依存しない。TSもVehicleVm/AddonVmを分け、runtimeの単一registryにenumとして保持する。ログとowned-value変換はVM側で共有し、モードごとに重複実装しない。

worldに作用するserver関数、HTTPクライアント、地形データ、物理計算、IDE永続状態はhostが提供する。host-serviceの同期呼び出しとHTTPの非同期request/replyを区別する。map providerはrasterの任意依存で、Lua-onlyの命令記録には不要。必要なcallerがない抽象や空の成功stubは追加しない。
