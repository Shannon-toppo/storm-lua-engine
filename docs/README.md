# Documentation index

## 利用するアプリケーションを開発する

[インストール・初期化](guide/getting-started.md) · [Addon](guide/addons.md) · [地図・ログ・HTTP](guide/host-services.md) · [利用側API](guide/api-reference.md) · [実行例](../examples/README.md)

## エンジンを開発・検証する

仕様は「このライブラリの契約」と「実装済み範囲」を分離する。未確認のゲーム挙動は確定事実として扱わず、対応するfixtureゲートと[TASKS](../TASKS.md)で管理する。

| Document | Owns |
|---|---|
| [Architecture](design/architecture.md) | crate責務・依存方向・ホストとの境界 |
| [Compiler SDK plan](design/compiler-sdk.md) | 未実装の言語処理統合設計・ホストAPI・公式CLI/Web提案・移行ゲート |
| [Compiler integration decision](adr/0005-compiler-sdk-integration.md) | 言語処理移管の判断理由と保留事項 |
| [API surface](specs/api.md) | 現在の公開API、今後の高/低レイヤーAPI |
| [Numeric I/O](specs/numeric-io.md) | f32/f64の境界・チャネル・出力保持 |
| [Addon](specs/addon.md) | 独立profile・lifecycle・savedata・host server契約 |
| [Properties](specs/properties.md) | 型・精度・更新時点・欠損処理 |
| [Debugger](specs/debugger.md) | ホスト検査・実行制御・値転送・デバッグ拡張 |
| [Screen](specs/screen.md) | 描画・RGBA・同梱フォント |
| [WASM ABI](specs/wasm-abi.md) | レイアウト・寿命・エラー・Worker |
| [Runtime and host](specs/runtime-host.md) | サンドボックス・Addon・HTTP・地図 |
| [Release](release.md) | 版・配布物・公開手順 |
| [Distribution](design/distribution.md) | Cargo/npm、target、ビルド手順 |
| [Integration](design/integration.md) | 利用形態・最適化ツールの移行判断 |
| [Testing and performance](design/testing-performance.md) | fixture・CI・性能測定 |
| [Dependencies](design/dependencies.md) | 外部依存の採否・backendバージョン |
| [Decisions](adr/0004-self-contained-contracts.md) | 採用判断と理由 |
| [Verification](verification/repository.md) | 今回の実行結果と未検証範囲 |

[AGENTS](../AGENTS.md)は作業規則、[CONTRIBUTING](../CONTRIBUTING.md)は開発手順、[STATUS](../STATUS.md)は現在地の単一正本。
