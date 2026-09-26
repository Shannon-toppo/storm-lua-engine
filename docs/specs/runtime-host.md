# Runtime and host services

## 共通VM

PUC-Lua 5.3/mlua 0.10.5のstateを所有thread/Worker内で生成・実行・破棄する。Nativeの通常APIにSend、Rayon、特定async runtimeを要求しない。各VMの乱数列は独立だが、実ゲームの未公開乱数列との一致を保証しない。

許可environmentだけでsourceを実行し、io/os/package/require/load/raw debugをscriptに渡さない。string.dumpも隠す。全source/callbackにLua命令予算とheap上限を適用する。命令予算をpcall/xpcallで繰り返し捕捉して回避できないようにする。長時間のホスト関数の途中停止を保証するwall-clock timeoutではない。

`backend-mlua`のconfigureは信頼された拡張用。通常consumerは`HostFunction`／`LuaValue`、MapProvider、公開profile APIを利用でき、mluaを直接扱う必要はない。

## ビークルとAddon

vehicleはinput/output/property/screenとComposite、draw commandの所有者。Addonはserver/matrix/menu property/g_savedataとevent lifecycleの所有者。片方の環境へもう片方のAPIを単に追加する構造にはしない。

vehicleでは入力f32→Lua f64、出力Lua f64→f32。outputは保持し、複数drawでもLua stateを共有する。draw中のCompositeアクセスの詳細や異常引数の規則はエンジン契約と実ゲーム実測を区別する。[数値仕様](numeric-io.md)

Addonはtop-level終了後に既存checkpointを復元し、その後にonCreateを呼ぶ。tickのgame_ticksは引数として1回配送する。停止中・異なるlifecycle段階のeventを拒否する。[Addon仕様](addon.md)

## 同期hostサービス

world queryは同期で戻る必要がある。Nativeのserver callbackはowned LuaValue結果、WASMのserver callbackは同じ値のtagged codecを通してJSへ接続する。JSのPromise結果・同一moduleへの再入は拒否し、host側のイベントはcallback復帰後に配送する。

mapは描画命令列の中で同期providerを呼び、正確な寸法のRGBAを受け取る。描画省略、空の地形、未提供関数の成功を暗黙に返さない。ゲームのworld/terrain/タイマー/HTTP clientの実体はhostが提供する。

## HTTPとログ

HTTPはvehicleのasync.httpGet、Addonのserver.httpGetからbounded request queueへ記録する。hostがdrainして通信し、idleでhttpReplyを配送する。VM世代付きtokenによりstale/foreign/duplicate replyをrejectする。cancelは失敗したtransportを明示破棄する操作で、架空のLua返信を作らない。

loggingはVM側が共通所有する。制限付きdebug.logとprintの公開はprofile/opt-inで区別する。レコードはsourceとbytes。TSのonLogはLuaから復帰後に呼び、失敗したcallbackが出したログも取り出す。配送先の例外とLuaエラーは両方保持する。ログcallbackも同期である。Promiseの戻り値はエラーとして観測し、別の未処理Promise rejectionを発生させないよう、そのPromiseは結果を採用せず監視する。

各サービスの上限、利用側のネットワークpolicy、手動配送と自動配送の選択は[host services guide](../guide/host-services.md)を参照。
