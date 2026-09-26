# Current status

2026-09-26 — **Storm Lua Engine 0.1.0**。ビークル／AddonのLua実行、CPU描画、デバッガとホストサービスを提供します。変更内容は[CHANGELOG](CHANGELOG.md)、配布方法は[導入ガイド](docs/guide/getting-started.md)を参照してください。

## Compiler SDK統合（実装済み・未公開）

構文・解析・最適化・ビルドの4クレートとcompiler-only WASM adapterを追加した。既存のCLI/Node/Webは同じ実装を利用する。`/compiler`のTypeScript入口はruntimeをロードしない。最適化はVehicleのみ、Addon指定は明示拒否する。

既定無効4パスを削除し、廃止IDは全入口で拒否する。生成コードの直接確認で見つかったcaptured property/inputの寿命変更と、公開finalizerの不正ソース時panicも修正した。

Engine native 445件、利用側回帰492件、Node/WASM/3ブラウザ、隔離npm consumerで確認。131入力×685条件の出力は従来版と同一で、Native/Engine-WASMも685組一致。詳細は[統合検証](docs/verification/compiler-integration-20260926.md)、使い方は[Compiler guide](docs/guide/compiler.md)。

公式CLI/WebのEngineリポジトリへの移設、makkii.jp配備、Addon最適化、リリースと版の更新は未実施。[目標設計](docs/design/compiler-sdk.md)の全項目を完了したとはしない。

## v0.1.0の実装済み範囲

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
