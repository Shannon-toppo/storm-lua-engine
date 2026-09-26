# 利用側APIリファレンス

この一覧はエンジンを利用するアプリケーション向けです。Luaスクリプト内で見えるゲームAPIは、モード別の`VEHICLE_API_CATALOG`／`ADDON_API_CATALOG`と[仕様](../specs/api.md)を参照してください。

## 初期化と生成

| API | 入力・結果 |
|---|---|
| `loadRuntime(options?)` | Promiseで`LuaEngine`を返す。`moduleUrl`、`wasmUrl`、`wasmBinary`を指定可能 |
| `fromEmscripten(module)` | 初期化済みmoduleを包む。同じmoduleは同じengineを返す |
| `engine.createVehicle(options?)` | `VehicleVm`。property、ログ、mapProviderをsource実行前に設定 |
| `engine.createAddon(options?)` | `AddonVm`。newWorld、savedata、メニュープロパティ、server関数、ログを設定 |
| `/raster`の`loadRaster(options?)` | Luaなしの描画用engine。`createRaster(width,height)`で描画先を作成 |

共通生成設定は`environment`（既定`game`）、`bindings`（extended専用のホスト値・同期関数）、`instructionBudget`（既定1,000,000）、`memoryBytes`（既定8MiB）、`devLogs`、`onLog`です。WASM adapterのLuaメモリ設定は最大256MiB。予算はコールバック単位で、ホスト関数の壁時計実行時間を中断する機構ではありません。

## 両モード共通

| メソッド | 契約 |
|---|---|
| `load(source, name?)` | stringまたはUint8ArrayのテキストLuaをロード。結果はcompleted/suspended/missing |
| `enableLogs()` | extended専用。gameでは拒否。debug.logは両環境で常時使用可能 |
| `drainLogRecords()` | sourceとbytesを持つ所有ログを取り出す |
| `drainLogs()` | bytesのみを取り出す |
| `flushLogs(handler)` | 明示配送し、件数を返す |
| `drainHttpRequests()` | 未配送の要求を取得。未返信管理は残る |
| `httpReply(token, reply)` | string/bytesをLuaへ配送。busyならtokenを消費しない |
| `cancelHttp(token)` | 実際に失敗した通信を取り消す。Luaへ偽返信しない |
| `dispose()` | 破棄。同じ高レベルobjectへの再度のdisposeは何もしない |

`mode`は`'vehicle'`または`'addon'`の読み取り専用識別子です。生のABIには別途世代付きhandleの検査があり、不正ハンドルやraw double-disposeはエラーになります。

## ビークル専用

| API | 契約 |
|---|---|
| `vehicle.io` | input/outputのNumberとBoolean配列。NumberはFloat32Array、Booleanは0/1のUint8Array |
| `tick()` | 現在の入力でonTickを1回実行。未書き込みの出力は保持 |
| `draw(width,height)` | onDrawを1回実行して順番に描画。複数画面でもLua呼び出しを省略しない |
| `frame()` | 世代検査付き`FrameLease` |
| `setProperties(properties)` | idle時に全置き換え。既存Lua変数のキャッシュは変更しない |
| `reset()` | 現在のプロパティで最後のsourceを再実行。HTTP/debugの古い識別子は失効 |

`frame.pixels`は借用、`frame.copy()`は所有コピー。width／height／strideBytes／formatを確認できます。frameのraw形式は`game-rgba8`です。`/canvas`は表示用adapterであり、このraw契約を書き換えません。

## Addon専用

| API | 契約 |
|---|---|
| `start()` | load完了後にonCreate(newWorld)を1回実行 |
| `tick(gameTicks = 1)` | onTick(gameTicks)を1回実行。正のu32 |
| `dispatch(callback,args?)` | `AddonEvent`のイベントをlossless引数列で配送 |
| `savedata()` | idleのg_savedataを所有テーブルとして取得 |
| `reload(checkpoint)` | 同じsourceを既存ワールドとして再初期化。別途startが必要 |
| `menuProperties()` | checkbox／sliderの宣言を取得 |
| `destroy()` | onDestroyを明示実行。以後のtickは拒否 |

Addonには`io`、`draw`、`frame`、`setProperties`はありません。vehicleの操作をAddon handleへ渡してもraw ABIで拒否します。セーブ全体のUI設定、sourceファイル、hostのワールド状態は、`g_savedata`とは別にアプリ側で保存してください。

## デバッガ

両モードで`setBreakpoints(points)`、`resume(mode?)`、`stack()`、`locals(level?)`、`upvalues(level?)`、`expandTable(handle,start?,limit?)`、`evaluateWatch(expression,level?)`を提供します。標準配布のruntimeにはdebug featureを含めます。

modeはcontinue／into／over／outです。watchは副作用を起こす明示操作。localsとtableのraw検査はユーザーmetamethodを実行しません。デバッグtable handleはVMと停止世代に紐づき、resume／watch／reload後に使い回せません。[詳細](../specs/debugger.md)

## 値と保存ヘルパー

`LuaValue`はnull、boolean、number、bigint、string、Uint8Array、`LuaTable`。Luaから戻る文字列はbytesです。`luaText`は明示的なUTF-8 decode、`luaTable`は文字列キーのrecord作成、`luaField`は文字列キーの読み取りに使います。

`encodeSavedata`／`decodeSavedata`はversion付きの携帯可能な保存形式です。型付き配列やbigintへ直接JSON.stringifyする必要はありません。テーブルのキーはscalarのみで、nil値は項目そのものを省略します。Luaで同じキーになる整数／浮動小数点、UTF-8文字列／同じbytesの重複は拒否します。

## エラー番号

| Code | 意味 |
|---:|---|
| 1 | Luaのcompile/runtime失敗 |
| 2 | リソース上限 |
| 3 | 無効・期限切れhandle |
| 4 | 引数・モード・形式の不正 |
| 5 | 再入、停止中、現在の状態では実行不可 |
| 6 | 対応機能・provider不在 |
| 9 | VMが失敗状態で、再作成が必要 |
| 10 | 提供されたhostサービスの失敗 |

raw statusの0はcompleted、7はsuspended、8はmissingです。JSの引数検証や配送先の例外は、この表の番号だけに正規化されるとは限りません。

## 環境とホスト拡張

`game`と`extended`はVehicle/Addonの区別とは別です。`onLog`は配送先だけを指定し、printを有効化しません。任意の標準関数置換・独自関数・値はextendedの`bindings`で初期化前に指定します。reset/reloadでも同じ設定を再適用します。[利用例と制約](environments.md)。
