# Changelog

## 0.1.0 — 2026-09-26

Storm Lua Engineの初回リリース。

- RustとTypeScript／WebAssembly向けに、Lua 5.3の実行基盤を提供。
- ビークルとAddonを独立したAPI・実行環境として提供。Composite I/O、プロパティ、コールバック、イベント、savedataに対応。
- CPUラスタライザ、ビットマップフォント、Luaを含まない描画専用WASMを同梱。731件の固定RGBAケースを直接描画と実Lua経路で検証。
- ブレークポイント、ステップ実行、変数・テーブル検査、watch、ログのホスト接続を提供。
- Addonの同期server関数、地図プロバイダー、HTTP要求・返信を利用側の実装へ接続。
- npm SDK、RustのGitタグ、Node／Rust／ブラウザの利用例、Three.jsとCodeMirrorによるAddon Labを提供。
- 配布用の権利表示、toolchain通知、WASM・export・パス検査と独立したnpm consumer検証を整備。

ゲームのワールド、物理、地形、実際のネットワーク通信はホスト側の責務です。対応APIと制約は[利用ガイド](docs/guide/getting-started.md)、追加の検証・実装項目は[TASKS](TASKS.md)、未信頼コードの実行条件は[SECURITY](SECURITY.md)を参照してください。
