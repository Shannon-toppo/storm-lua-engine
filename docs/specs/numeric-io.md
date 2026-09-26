# Numeric and Composite I/O contract

## Domains

| Domain | Representation | Conversion |
|---|---|---|
| Composite Number | `[f32; 32]`, WASM `Float32Array` | wire/buffer domain |
| `input.getNumber` return | Lua Number (f64) | exact widening from stored f32 |
| Lua arithmetic/registers | f64 Number or i64 Integer | no global f32 quantization |
| `output.setNumber` argument | Lua numeric value | convert to Number, narrow to f32 when written |
| Property Number | f64 host storage | independent contract; see [properties](properties.md) |
| Debug value | i64/f64/bytes | lossless tagged representation, never Composite quantization |

Lua 5.3の標準構成は64bit整数と倍精度浮動小数点を使用する。[Lua manual §2.1](https://www.lua.org/manual/5.3/manual.html#2.1)。本workspaceは選択backendの実サイズをcompile-time assertする。

入出力はホストのf32信号を正本とする。例えばLua内部の`16777217.0 - 16777216.0`は1だが、`output.setNumber(1,16777217.0)`が保存する信号値は16777216。`input.getNumber`はその保存済みf32をf64として返す。f64の入力ビューを作って精度があるように見せない。

Rustの`CompositeSignal`はドメイン型であり、ABIへのメモリcastを許可しない。WASM用の[IoBuffer](wasm-abi.md)は別の`repr(C)`型で、Booleanには0/1のu8を使う。

## Channels and lifecycle

ホストAPIでは1〜32を`Channel`へ検証する。Lua側では不正な型をerror、範囲外/phase外の読み出しを0/false、書き込みを無効とするエンジン契約を実装した。実ゲームの全異常系を測定済みではない。ホストの不正入力をLua互換の既定値に隠さない。

出力は毎tickゼロクリアせず、次の書き込みまで保持する。入力はホストが次のcallback開始前に設定する。tick/drawを同じVM上で並列実行せず、drawのために入力APIを暗黙に有効化しない。実行失敗時の部分出力は完成したtickと区別する。未確認のエラー時出力をロールバックする実装を先に足さない。

## Non-finite and reproducibility

基盤のf32/f64バッファ変換はNaN、±Infinity、-0をJSONや有限値への変換で失わない。NaN payloadのbit一致やすべての数学関数の全CPU bit一致は保証しない。実ゲームの非有限値フィルタが追加で確認された場合は、対応するAPI境界だけに明示する。

fast-math、浮動小数点式の勝手な再結合、描画への一律floor適用を禁止する。境界fixtureとNative/WASMテストは別々に維持する。
