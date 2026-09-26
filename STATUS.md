# Current status

2026-09-26 — **Storm Lua Engine 0.1.0**。ビークル／AddonのLua実行、CPU描画、デバッガとホストサービスを提供します。変更内容は[CHANGELOG](CHANGELOG.md)、配布方法は[導入ガイド](docs/guide/getting-started.md)を参照してください。

## 環境契約の是正（開発ブランチ）

ゲーム向けgameと明示的extendedを分離し、debug.logとホストデバッガを区別した。onLogはprintを注入しない。単一ソースとプロジェクトの診断を共有し、外部名の改名/nil化を修正。_ENVと拡張環境はトークン・行位置を維持する字句短縮を使う。[環境仕様](docs/specs/environments.md)・[ホストガイド](docs/guide/environments.md)。この契約は公開済み0.1.0へ遡及しない。

## Compiler SDK統合（実装済み・未公開）

構文・解析・最適化・ビルドの4クレートとcompiler-only WASM adapterを追加した。既存のCLI/Node/Webは同じ実装を利用する。`/compiler`のTypeScript入口はruntimeをロードしない。最適化はVehicleのみ、Addon指定は明示拒否する。

既定無効4パスを削除し、廃止IDは全入口で拒否する。生成コードの直接確認で見つかったcaptured property/inputの寿命変更と、公開finalizerの不正ソース時panicも修正した。

Engine native 445件、利用側回帰492件、Node/WASM/3ブラウザ、隔離npm consumerで確認。131入力×685条件の出力は従来版と同一で、Native/Engine-WASMも685組一致。詳細は[統合検証](docs/verification/compiler-integration-20260926.md)、使い方は[Compiler guide](docs/guide/compiler.md)。

## Storm Lua Engine: Playground（実装・検証済み、未配備）

Storm Minとは併存するSDK確認用CLI/Webを`app/`へ実装しました。12確認例、共通操作runner、独立compiler/runtime Worker、入力/結果保存、version付き入出力、明示中断に対応します。ホスト・HTTP・地図は明示テスト入力であり、実通信や仮物理は持ちません。

Addon LabとThree.js/CodeMirrorのアプリ依存は撤去し、SDK確認はPlaygroundへ移しました。`app/wrangler.jsonc`は専用routeを持ち、dry-runまで確認。本番公開・SDKバージョン更新・pushは未実施。[操作](app/README.md)・[Playground検証](docs/verification/playground-20260926.md)。

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

今回のローカル測定は[0.1.0検証記録](docs/verification/release-0.1.0.md)、追加の検証・実装項目は[TASKS](TASKS.md)、公開時の確認事項は[リリース手順](docs/release.md)に記載しています。過去のAddon Lab検証は当時の結果として保持し、現行Playgroundの結果と混同しません。
