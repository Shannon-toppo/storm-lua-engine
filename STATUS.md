# Current status

2026-09-26 — **Storm Lua Engine 0.1.0**。ビークル／AddonのLua実行、CPU描画、デバッガとホストサービスを提供します。変更内容は[CHANGELOG](CHANGELOG.md)、配布方法は[導入ガイド](docs/guide/getting-started.md)を参照してください。

| 対象 | 状態 |
|---|---|
| 仕様の正本 | 本リポジトリの仕様・採用済みケース・実装。下流アプリへ逆依存しない |
| 画面契約 | 731ケースの入力と期待RGBAを保持。直接描画と実Lua経路を検証 |
| フォント | 同梱グリフ／metricsを維持。外部取得や抽出は不要 |
| ホスト境界 | ワールド、地形、server関数、通信、実行タイミングは利用アプリが提供 |
| 権利表示 | プロジェクト、描画構成要素、Cargo依存、SDK／システムライブラリ、Rust標準ライブラリの通知を同梱 |
| ローカル検証 | Native 56、JS 26、WASM 19、Python 19、Addon Lab 14が成功 |
| ブラウザ | 3エンジンで本体の直接／Lua描画、ホスト機能、WorkerとAddon Labのdesktop／mobile操作を検証 |
| 梱包 | 43ファイルのnpm packageを独立環境へoffline installしてconsumer例を実行。SDKと静的サイトの48ファイル／3WASMをパス検査 |
| CI | NativeのLinux／Windows／macOSと、WASM・ブラウザの検証をpush時に実行。結果はGitHub Actionsで管理 |

今回のローカル測定は[0.1.0検証記録](docs/verification/release-0.1.0.md)、追加の検証・実装項目は[TASKS](TASKS.md)、公開時の確認事項は[リリース手順](docs/release.md)に記載しています。[Addon Lab](examples/addon-lab/README.md)の仮物理や3Dモデルは、本体の画面仕様の正本として扱いません。
