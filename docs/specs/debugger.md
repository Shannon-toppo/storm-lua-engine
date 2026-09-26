# Host debugger and execution control

## Three separate concerns

| Concern | Owner | Policy |
|---|---|---|
| Runtime errors, source identity, execution limits | vm | 通常実行でも必須。debug featureを切っても消えない |
| Breakpoints, stepping, stack/locals/upvalues/watch | vm `debug` feature | ホスト専用。UIやDAPへ依存しない |
| `print`/`debug.log`など開発支援Lua関数 | 明示的なホスト拡張 | ゲーム標準APIと混同せず、debug機構の有無から勝手に追加しない |

マイコンのtick/draw phaseと保留描画命令はmicrocontroller、VSCode/DAP/Monaco、ソースマップ表示、キー操作はホストが所有する。数行のコードのために別debug crateへは分割しない。

## Execution state

同じVMでIdle→Running→Completed/FailedまたはSuspendedへ遷移する。Suspendedでは同じcontinuationを保持し、continueで先頭から再実行しない。新しいtick/draw、resetなしの別チャンク実行、property変更は拒否する。reset/disposeはcontinuationと全debug handleを無効化する。

top-levelを含むすべての実行入口に制限を適用する。ブレークポイントと命令予算は**1つのhook管理者**で合成し、debugを有効にして制限フックが上書きされないようにする。命令予算はresume間で累積する。現在はinstruction/heap制限であり、壁時計timeoutは未実装。停止中の待ち時間を命令予算として消費しない。

ステップはinto/over/outを設計対象とするが、未実装の種類をintoで代用して成功扱いしない。call/returnイベントは深さの追跡、停止はyield可能な境界で行う。外部C/Rust処理を安全に途中停止できるとは保証しない。[Lua manual §4.7](https://www.lua.org/manual/5.3/manual.html#4.7)。

## Inspection and values

source IDと行番号を保持し、名前が不明な関数は不明と返す。内部変数名をUIの都合だけで捨てず、raw inspectionで確認可能にする。tablesは停止中のhandleとpage単位の列挙にし、循環するLua heapを全体JSON化しない。handleはVM identity、pause epoch、slotで識別し、resume後に他のオブジェクトへ誤接続しない。

整数はi64、数値はf64、文字列はbytes。JS APIはbigint/number/Uint8Arrayを用いる。JSON経路では整数をタグ付き10進文字列、bytesを明示エンコード、f64の非有限値/-0をbit表現などのタグ付き形式にする。`JSON.stringify`をLuaの値へ無条件に適用しない。[Lua values](https://www.lua.org/manual/5.3/manual.html#2.1)。

通常の検査はraw readとし、`__index`/`__pairs`/`__tostring`を実行して副作用を起こさない。任意watch式の評価は別の明示操作とし、副作用を起こし得ることをホストへ示す。別の環境テーブルに式を置くだけでは、共有tableや関数の変更を防げないため、read-onlyだと主張しない。watch自身にも命令・メモリ・出力量の上限を設ける。

## Isolation and frames

本物のLua debug libraryやraw VMアクセスをスクリプトへ渡さない。実装時にunsafeなbackend初期化が必要な場合は、専用moduleに閉じ、スクリプトから到達しないことをテストする。

停止中の描画命令は未完了のprefixであり、完成フレームと区別する。continue時にprefixを再発行して二重alpha blendしない。部分出力・部分描画を表示する場合はデバッグ用snapshotとして明示する。

## Implemented status

`debug` featureにbreakpoints、into/over/out、stack/locals/upvalues、世代付きtable展開、制限付きwatch評価を実装した。Native、実WASM、Chromium/Firefox/WebKitで停止・再開とi64を検証する。

通常実行ではdebugをcompileしただけでline/call hooksを付けない。breakpoint/step使用時にのみ追加し、instruction budget hookを維持する。watchによるhookの置換後はresume時に制限を保守的に継続する。

line breakpointはsource名と行番号、空sourceは全chunk一致。Cの非yieldable領域で無理に停止しない。raw inspectionは上限付き、完全なDAP serverやtime-travel debuggerではない。
