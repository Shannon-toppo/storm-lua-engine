# ゲーム環境・拡張環境とホストの組み込み

環境プロファイル対応の開発ブランチ用ガイドです。公開済み0.1.0では、このガイドの`environment`／`bindings`／Compiler Workerアダプタは利用できません。対応するソースとWASMを同じ版でビルドしてください。

## 普通に実ゲーム向けLuaを試す

`engine.createVehicle()`は`game`環境を作ります。`debug.log`でログを出せますが、`print`・`pcall`・`error`はnilです。`onLog`を設定しても、Luaに公開する関数の集合は変わりません。

ログの受信は`engine.createVehicle({onLog: record => console.log(record.source, record.bytes)})`です。テキストとして表示する場合だけ`luaText(record.bytes)`でデコードします。元のLua文字列はバイト列であり、不正UTF-8を黙って置換する契約ではありません。

Addonでも同じ環境指定を使います。`engine.createAddon({server: {...}})`の`server`はホストが実装するAddon機能です。ゲームにない独自グローバルや標準関数の置換は、次のextendedで明示します。

## pcallやprintを使って開発する

`engine.createVehicle({environment: "extended"})`または`engine.createAddon({environment: "extended"})`を使います。`pcall`・`xpcall`・`error`・`assert`・`print`・グローバル`unpack`が追加されます。`os`やファイル読み込み、Lua標準debugライブラリまで開放されるわけではありません。

同じソースを短縮するときも、`compiler.minify(source, {environment: "extended"})`を指定します。この環境では、例外捕捉やホスト独自の振る舞いを壊さない字句短縮を行います。生成結果の`conservative-minification`は失敗ではなく、AST最適化を行わず名前・トークン・行番号を維持したことを示します。

extendedで動いたことは、ゲームへ貼り付けても動くという保証ではありません。ゲームへ出す段階ではgame環境で診断し、実ゲーム内でも確認してください。

## 標準関数を置き換える／ホスト関数を追加する

TypeScriptでは、たとえば`bindings = {values: {"host.offset": 11, pcall: null}, functions: {"math.abs": () => [99], "host.echo": (...args) => args}}`を作り、`engine.createVehicle({environment: "extended", bindings})`へ渡せます。

この設定では`math.abs(-3)`がホストの99を返し、`host.offset`は11、`pcall`はnilです。関数は戻り値が一つでも配列を返します。`[]`と`[null]`は別の結果です。Promiseは受け付けません。

同じプログラムをコンパイルする設定は、`{environment: "extended", hostBindings: bindingPaths(bindings)}`です。`bindingPaths`はSDKの通常の入口からimportできます。宣言と実行時の実装はホストが同じ設定から作り、最適化器に標準`math.abs`だと思わせたまま独自関数を置き換えないでください。

Rustは`MicrocontrollerConfig`／`AddonConfig`の`environment`と`HostBindings`を使用します。値は`LuaValue`、関数は`HostFunction`です。必要な拡張だけのために、マイコンI/OやAddonのライフサイクルを再実装する必要はありません。

設定はload前に適用され、reset／reloadでも維持します。設定済み関数と衝突するパス、不正な名前、game環境への任意bindingsは明示的に拒否します。ホストclosureの外部状態は自動で巻き戻りません。

## デバッグはgameでも使える

`setBreakpoints`、`resume`、`stack`、`locals`、`upvalues`、`expandTable`、`evaluateWatch`はホスト側のAPIです。スクリプトの`debug`が`log`だけでも利用できます。

watchは明示的にLua式を評価し、副作用を起こし得ます。表示だけのテーブル検査とは区別してください。ハンドルは停止世代に依存するため、再開・watch・resetの後に使い回しません。独自のデバッガ画面はこれらのAPIを利用し、SDKの命令制限フックを置き換えません。

## 動的な_ENVアクセスを短縮する

`caption = "HELLO"; function onDraw() local key = property.getText("name"); screen.drawText(0, 0, _ENV[key]) end`は、名前を実行時に選びます。SDKは`caption`を別名へ変換せず、字句短縮だけを行います。`_ENV`の別名化、書き込み、局所的な再束縛も同様です。

結果の`search.mode`は`lexical`です。元の名前・数値型に関わる綴り・行番号・評価順を保持するため、通常より短縮率が低くなる場合があります。目標サイズを超えても、強い最適化へ切り替えて意味を変えることはありません。

## Worker接続を共有する

ブラウザの`compiler.minify()`自体は同期処理です。UIやシミュレーションを止めないため、ホストが作ったmodule Workerから使用してください。

`@stormcat-works/storm-lua-engine/compiler-worker`の`serveCompiler(workerScope, initOptions)`をWorker側で明示登録します。呼び出し側は`new CompilerWorkerClient(worker)`を作り、非同期の`minify`／`build`／`analyze`などを呼びます。アダプタはWorkerを勝手に作りません。

`client.dispose()`は未完了の要求を拒否し、listenerを外します。CPU処理の中断や独立したメモリの破棄は、所有者であるホストが`worker.terminate()`で行います。runtime用とcompiler用のWorkerを分離すれば、コード変換と実行の寿命を独立に管理できます。

詳細な判定と制約は[環境仕様](../specs/environments.md)、コンパイラ操作は[Compiler guide](compiler.md)、通常実行は[利用側API](api-reference.md)を参照してください。
