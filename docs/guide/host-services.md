# 地図・ログ・HTTPをホストへ接続する

## `drawMap()`を実装する

TypeScriptのビークルには`createVehicle({ mapProvider })`で関数を渡します。`mapProvider(request)`には画面のwidth／height、ワールド中心の`center: [x, z]`、zoom、`setMapColor*`で明示されたpaletteが渡ります。未指定色はプロパティ自体がなく、黒に変換されません。

返す値は**同期的な`Uint8Array`で、長さは正確に`width × height × 4`**です。RGBA画像は描画命令列中の`drawMap`の位置でフレームを置換し、その後の図形・文字は通常どおり上に描かれます。地図を描いても現在の`screen.setColor`は変わりません。複数の`drawMap`や、デバッガによる途中停止・再開でも命令順を保持します。

この契約はホストの地形データを接続するためのものです。エンジンは地形・タイル・ゲームの既定paletteを所有せず、地図画像自体の実ゲーム互換性を保証しません。線・矩形・円・文字はこのリポジトリの描画仕様と採用済みケースに従います。

Rustでは`ScreenRaster::set_map_provider(Some(Rc::new(provider)))`を使用します。独自GPUなどへ描く場合は`ScreenSink`で`DrawCommand::Map`と`MapColor`を直接処理することもできます。microcontrollerクレートは地図やCPUラスタライザに依存しません。

TSの描画専用`/raster`モジュールは、現在はJSホストコールバックをリンクしません。地図命令を渡すと未提供エラーになります。JSの地図プロバイダーを利用する場合は実行用moduleのvehicle APIを使ってください。Rustのラスタライザ単体にはプロバイダーを指定できます。

### 失敗と寿命

プロバイダーが無い場合はUnsupported、例外・Promise・長さ不一致は明示的な失敗です。架空の地形へのfallbackはありません。途中まで描かれたフレームが残ることはありますが、失敗したdrawを完成扱いにしません。

画像はJSからWASMへコピーします。この境界はゼロコピーではありません。頻繁に使用する地形データはホストでキャッシュし、ネットワーク取得は描画の前に済ませてください。callback中の同一WASMへの再入、`vehicle.io`の新規借用、保持済み生ビューへの書き込みは禁止です。

## `print()`と`debug.log()`を出力する

最も簡単な入口は`createVehicle({ onLog })`／`createAddon({ onLog })`です。`onLog(record)`はLuaの呼び出しが戻った後に実行され、正常終了だけでなく、デバッグ停止・Lua実行エラー前のログも受け取れます。Lua実行中にJSのUI関数へ再入する方式ではありません。

recordには`source: 'print' | 'debug.log'`と`bytes: Uint8Array`があります。行末改行は含まず、複数のLua引数はタブ区切りです。テーブルなどの非スカラーは型名を表示し、ログ整形のために任意のユーザーmetamethodを実行しません。

例えば`onLog: record => { console.log(record.source, new TextDecoder().decode(record.bytes)); }`とすればブラウザのコンソールへ接続できます。これは表示用の例です。厳密なUTF-8検査には`new TextDecoder('utf-8', { fatal: true })`を使用し、生データを保存するならbytesをそのまま扱います。

Vehicle/Addonとも`debug.log`はgame環境から利用できます。`onLog`は配送先の設定だけで、公開関数を増やしません。`print`は`environment: "extended"`で明示的に使用します。`devLogs`／`enableLogs()`もextended専用です。Lua標準debugライブラリを公開する意味ではありません。[環境ガイド](environments.md)を参照してください。

自動配送が不要なら`drainLogRecords()`で構造化ログ、`drainLogs()`でbytesだけを取得できます。`flushLogs(handler)`は蓄積済みログを明示配送します。Rustでは`drain_log_records()`をアプリのloggerやIDEへ渡してください。

ログは1行16KiB、最大128行／合計64KiBに制限します。drainせず上限を超えると実行エラーです。`onLog`は同期で軽い処理にし、ファイル書き込み等はアプリ側のキューへ渡してください。配送先で例外が出た場合、drainした全行を1回ずつ試みたうえで失敗を通知します。Luaのエラーも同時に起きていた場合は両方を`AggregateError`で保持します。

## HTTPを実装する

ビークルの`async.httpGet(port, request)`、Addonの`server.httpGet(port, request)`は、要求をキューへ追加するだけです。実際の通信はありません。

ホストは`drainHttpRequests()`で新しい要求を取り、port／pathを許可規則に照らして検査し、選んだHTTPクライアントで通信します。完了後、VMが次のコールバックを受け取れる時点で`httpReply(token, bytes)`を呼びます。Lua側には`httpReply(port, request, reply)`が届きます。失敗・タイムアウト時は`cancelHttp(token)`で破棄し、アプリの診断へ実際の理由を記録します。成功に見える空の返信は捏造しません。

返信tokenはVM世代と要求番号を持ちます。重複・別VM・reload/reset前の返信は拒否します。デバッグ停止中の返信はBusyとなりtokenを消費しないため、ホスト側で保留して後から再送できます。ネットワーク完了順ではなく、ホストが選んだ配送順にコールバックが実行されます。

最大128個の未完了要求を保持し、drainしただけでは枠を解放しません。portは1〜65535、requestは`/`で始まるpath/queryで最大4096bytes、`//`・NUL・CR・LFを拒否します。返信と元のrequestの合計は1MiB以内です。これらはエンジンの安全上限であり、実ゲームの全限界を再現する数値ではありません。

URL・port・認証・リダイレクト・レスポンスサイズ・CORS・timeoutはホストの責任です。requestを無制限に任意URLへ連結しないでください。fetchやNode HTTPへの実装をエンジンの必須依存にしないことで、ブラウザ、Native、オフラインテストで同じLua側の契約を利用できます。
