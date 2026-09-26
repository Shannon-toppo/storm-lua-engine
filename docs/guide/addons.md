# Addonをアプリへ組み込む

## ホストとエンジンの担当

エンジンはLua状態、イベント呼び出し、`g_savedata`の取得・復元、メニュープロパティ、行列関数、制限とデバッグを担当します。プレイヤー、ビークル、天候、ワールドの保存場所、時計、ネットワークはホストが担当します。

例えば`server.getPlayers`を使うスクリプトには、`createAddon({ server: { getPlayers: () => [playerTable] } })`でホスト実装を渡します。存在しない世界を内蔵の空テーブルで代用しません。未登録の`server.*`はLuaから見て未定義です。

## ライフサイクル

`createAddon(options)` → `load(source)` → `start()` → `tick(gameTicks)`／`dispatch(...)` → `destroy()` → `dispose()`。

`load()`はトップレベルだけを実行し、`start()`が`onCreate(newWorld)`を呼びます。デバッグ停止した場合は、`resume()`して完了するまで次の段階へ進めません。二重の`start()`、ロード前のtick、Addonへのvehicle用I/O操作は拒否します。

`tick(400)`は`onTick(400)`を**1回**呼びます。400回の`onTick(1)`へ展開する機能ではありません。ホストが経過tick数と実行順を決めます。チャットなどは`addon.dispatch('onChatMessage', [peerId, senderName, message])`で渡します。一般イベントの名前は`ADDON_EVENTS`と`AddonEvent`に含まれ、`onCreate`／`onTick`／`onDestroy`／`httpReply`は専用メソッドで扱います。

ゲーム内ヘルプの原文では、`onCreate`はワールド生成・読み込み時の初期化、`onTick`の引数はフレーム中の経過tick数として説明されています。[原文掲載ページ](https://wikiwiki.jp/sbarjp/アドオンLua/Callbacks)

## サーバー関数を接続する

TSのホスト関数は`(...args: LuaValue[]) => readonly LuaValue[]`です。引数はすでに所有コピーへ変換されているため、WASMメモリの寿命を気にせず保持できます。戻り値は常に結果のリストであり、`[]`は戻り値なし、`[null]`は1個のnil、`[value, true]`は2個の結果です。

整数は`bigint`、浮動小数点は`number`です。Luaから渡る文字列は`Uint8Array`なので、テキストとして扱う箇所だけ`luaText(value)`でUTF-8へ変換します。不正なUTF-8は例外になり、元データを勝手に置換しません。

文字列キーだけのテーブルには`luaTable({ id: 7n, name: 'Ada' })`を使えます。配列や疎なテーブルは`{ kind: 'table', entries: [[1n, player]] }`のように、Luaのキーを明示します。JSの配列をそのままLuaテーブル扱いにはしません。

ホスト関数は**同期**です。Promiseは拒否します。外部データの取得が必要なら、先に取得したsnapshotを同期的に返すか、HTTPの要求・返信APIを使用します。同じWASM moduleへの再入も禁止です。ホスト関数内でイベントが発生した場合は、関数の戻り値を返した後に、アプリ側のイベントキューからdispatchしてください。

Rustでは`AddonConfig.server`に`HostFunction`を登録します。`LuaValue`と`VmError`を使うだけでよく、通常のホスト実装にmlua型は必要ありません。[Rust例](../../conformance/examples/addon_host.rs)

## プロパティと保存・復元

新規ワールドは`newWorld: true`、既存ワールドは`newWorld: false`と`savedata`を指定します。`property.checkbox`／`property.slider`は新規ワールドの設定値を返し、既存ワールドではnilを返す契約です。UIに必要な宣言は`menuProperties()`から取得できます。

既存ワールドでは、トップレベルが終了した後、`start()`より前に保存した`g_savedata`を適用します。トップレベルで書かれた初期値が保存済みデータを上書きしない順序です。トップレベルで古いテーブルへの参照をローカル変数に保持した場合、その参照まで書き換えません。[ゲーム内ヘルプ原文](https://wikiwiki.jp/sbarjp/アドオンLua/Misc)

保存には`encodeSavedata(addon.savedata())`を使い、ホストがファイルやIndexedDBへ書き込みます。復元は`decodeSavedata(bytes)`です。形式名とversionを検査し、非対応形式をrejectします。整数64bit、バイト列、疎なキー、負のゼロを維持します。循環、関数、thread、userdata、metatable付きテーブルは保存できません。共有テーブル参照は値として複製され、同一オブジェクトという関係は保存しません。

同じソースを再初期化する場合は`addon.reload(checkpoint)`の後に`addon.start()`を呼びます。新しいソースへ切り替える場合は、新しいAddonを`newWorld: false`とcheckpointで作ってから新しいソースをloadします。これはLua VM全体やゲームの`lua_data.xml`の保存ではありません。

## 終了・失敗時

通常の終了時に`onDestroy`が必要なら`destroy()`を実行し、必要な最終checkpointを取り、最後に`dispose()`します。disposeはスクリプトを勝手に実行しません。

Luaやホスト関数の実行中に失敗したAddonは、新規VMまたは保存済みcheckpointからのreloadで復旧します。実行前から持っていたcheckpointを保持し、失敗した状態から必ず保存できるとは想定しないでください。ホストが既に実行したワールド変更や外部I/Oは自動ロールバックされません。

完全な実行例は[Node利用例](../../examples/consumer/node.mjs)。厳密な対応範囲・限界は[Addon仕様](../specs/addon.md)にまとめています。
