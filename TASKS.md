# Implementation tasks

現状と検証結果は[STATUS](STATUS.md)、[API](docs/specs/api.md)、[verification](docs/verification/release-0.1.0.md)。完了と未検証を分離する。

## Completed implementation

| Priority | Task | Evidence |
|---|---|---|
| P1 | scalar line/rect/triangle/circle/text/textbox/clear | 731件の採用済みRGBAを直接描画と実Lua経路で検証。元データ・外部実装へ依存しない |
| P1 | DrawCommand/ScreenSink/command buffer | specに所有、microcontrollerはrasterに依存しない |
| P1 | 制限付きVM・sandbox・top-level・明示error | Native/Emscriptenでpcall回避防止・heap・syntax/runtime検査 |
| P1 | input/output/property/callback lifecycle | f32境界、出力保持、property初期化/atomic更新、複数draw副作用 |
| P1 | create/load/tick/draw/reset/dispose WASM＋TS SDK | 世代handle・memory growth・borrow/copy・Busy/破棄検査 |
| P2 | ホストdebugger | breakpoints/into/over/out、raw検査、table epoch、watch予算/副作用 |
| P2 | API catalog / 開発支援profile | Rust正本→TS/JSON、Lua登録とのparity。print/debug.log opt-in |
| P2 | font/Unicode/text layout | 採用済みfont同梱、degree/tofu、大文字fallback、UTF-16 textbox |
| P2 | browser組み込み | Chromium/Firefox/WebKitで731ケース、Lua/debug、Canvas、2 Worker |
| P2 | 独立Addon profileとモード分離 | 専用Rust crate、createVehicle/createAddon、型・raw handleのmode検査 |
| P2 | Addon lifecycle／savedata／menu property | top-level→restore→onCreate、tick/event/destroy、version付きcheckpoint往復 |
| P2 | Host server登録／matrix基盤 | 同期host callback、lossless multi-return、matrix11関数、未提供をstub化しない |
| P2 | drawMapとmap paletteのhost接続 | Native provider、runtime WASMのJS provider、命令順と失敗検査 |
| P2 | print/debug.logの出力ルート | onLog／flush／drain、source+bytes、Lua失敗時の配送、sink error明示 |
| P3 | HTTP request/reply/cancel | vehicle async／addon server、世代token、再入・duplicate・size検証 |
| P2 sample | Three.js / CodeMirrorのAddonホスト例 | examples/addon-lab。TSホスト、仮物理、3ブラウザ操作検証、project往復 |
| P2 platforms | Native Linux／Windows／macOS | GitHub Actionsで全featuresのテスト、lints、型検証を実行 |
| P2 docs | OSS README・consumer guide・実行例 | Node例をpacked packageの独立offline install先で実行。Rust例も実行 |
| P3 | owned Worker transferとCanvas adapter | libraryのscheduler強制なし、host-owned exampleで実行検証 |
| P3 | Native/WASM性能baseline | 同じLua fixtures、9batch測定、JSON receipt |
| Release prep | Rust依存license自動生成・描画構成要素のMIT表示 | Cargo依存、描画構成要素、固定toolchainと標準ライブラリの通知を配布物へ同梱 |

| P2 public structure | 仕様・採用済みfixtureの自己完結化、不要な元ソース/採取資料/抽出ツールの除去 | 731ケースの入力/期待値と同梱グリフを保持、外部cloneなしで直接/Lua両経路を検証 |
| P2 release privacy | 配布WASMのビルドパス正規化と成果物検査 | 両targetの正規化、梱包後と静的サイトの再検査。結果はverificationに記録 |

## Remaining work, not counted as completed

| Priority | Task | Exit gate |
|---|---|---|
| P1 evidence | Property Numberの実ゲーム保存精度、missing/type mismatch等の実機規則 | ゲーム観察の独立oracle。現行エンジン規則と区別 |
| P2 integration | 各consumerのgame互換harnessを本engineへ置換 | consumer単位で差分検証。独立した汎用Lua oracleは必要に応じ維持 |
| P2 platforms | 実VSCode WebView | 実WebViewでSDK/CSP/loader/エラー処理を確認 |
| P3 platforms | i686/armv7など追加CPU・OS組み合わせのNative実行matrix | C toolchain、整数/浮動小数点、raster、limits/debugを実行 |
| P2 integration | 最初の実Addon consumer向けhost adapterと必要server署名 | worldを持つconsumerへ接続し実script/event列で検証。共通engineに偽worldを入れない |
| P2 evidence | Addonの実ゲームoracle追加、matrix.rotationToFaceXZ、極端値と保存のedge case | 文書由来契約とゲーム内実測を区別。根拠なく未実装を埋めない |
| P3 services | standalone TS rasterへのJS map provider、必要なmap座標変換等 | 実consumer要件と入出力/精度検証。現状の制約はガイドへ明記 |
| P3 performance | 必要な場合のSIMD/shared memory/並列pool/batch拡張 | 既存正確性維持＋改善の実測。不要な必須依存を増やさない |

consumer向けの[Native differential example](conformance/examples/differential.rs)は実行済みだが、consumer本体の移行済みとは扱わない。未完了サービスを代用品や固定値で成功にしない。実行0件/fixture不在をPASSに数えない。

現段階で優先するのは、hostを持つ実consumerへの接続と、そこで必要なserver関数の具体的な契約検証。全API名を一括でstub登録する作業や、根拠のない並列化を完了条件にしない。


## リリース管理

版と配布物の管理は[リリース手順](docs/release.md)に従います。ignore領域の調査資料や作業履歴を配布物へ含めず、必要なcopyright/許諾文を維持します。上の未完了事項は追加の検証・対応範囲であり、実装済み機能の利用条件と区別します。

## Compiler SDKとPlayground

初回のsyntax/analysis/minify/build移管、compiler-only WASM/TS入口、既存Storm Min接続、4パス撤去と追加修正は実装・検証済み。[統合検証](docs/verification/compiler-integration-20260926.md)を参照する。

| 作業 | 完了条件 | 状態 |
| --- | --- | --- |
| Storm Minとの併存・Playgroundの範囲とapp配置 | [Playground設計](docs/design/playground.md)・[ADR 0006](docs/adr/0006-playground-coexistence.md)に従う | 方針確定 |
| `app/cli/`・`app/web/` | 全公開SDK機能と操作/実行例/テストの対応を確認。実行・解析・描画・debug・Addon・サービスを含め、未対応は明示 | 未実装 |
| Addon Labの整理・廃止 | SDK確認部分と必要テストをappへ移管し、仮物理/3Dワールドと旧アプリ、旧CI/配布参照を撤去 | 未実施 |
| makkii.jp向け公開用Worker | 設定と必要な配信処理をapp内で管理。サブパス・WASM/Worker・通知・版を検査し、Storm Minのrouteを維持 | 未実装・未配備 |
| SDK公開前の追加整理 | API-profile照合、必要な全件回帰・性能測定、版・配布手順と公開ガイドの整合 | 残件 |
| Addonコンパイラ・高度な最適化後debug等 | 独立の機能追加として設計・検証。Playground追加のために実装したことにしない | 将来対応 |

Storm MinのCLI/WebをEngineへ移設・廃止する作業は行わない。PlaygroundへIDE、共同編集、クラウド同期、ゲーム世界のシミュレーションを追加しない。公開・配備は別の明示操作とする。
