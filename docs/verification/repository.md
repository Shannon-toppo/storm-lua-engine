# 自己完結したリポジトリの検証

2026-09-25。仕様・データ構成・配布ビルドの整理後に実行した結果です。[機械可読の記録](repository.json)には契約と配布物のSHA256を含めます。

## 変更範囲とデータの保全

外部アプリのvendor、元の採取カード・観察文書・画像由来の元データ、役割を終えた抽出ツール、過去の元ソース別の検証資料を公開treeから除去しました。ビルド/テストで下流アプリをclone・実行する経路はありません。

731ケースの入力と期待RGBAは、整理前後の正規化JSONハッシュで同一と確認しました。フォントも表示上のface名以外の全数値・metricsが同一です。ラスタライザ本体は冒頭の説明/権利表示を除き、アルゴリズムの本文を変更していません。期待値を現行実装から生成し直して通したテストではありません。

移植された描画構成要素のCopyright/許諾は中立の名前で保持し、元のMIT原文とのバイト一致とnpmへの同梱を確認しました。ソースコードや権利の由来を新規独立実装であるかのように扱ってはいません。

## 実行したgate

| 対象 | 結果 |
|---|---|
| Native Rust（all features） | 56テスト成功、failure/skip 0 |
| JavaScript・consumer型検査 | 22テスト成功、型検査成功 |
| 実WASM | 19テスト成功、独立Lua backend probe成功 |
| Pythonの検査ツール | 19テスト成功 |
| screen corpus | 731ケース、全RGBA、Native/WASMそれぞれの直接/Lua経路で一致 |
| Chromium/Firefox/WebKit | 各731直接描画＋731Lua描画、debug、2 Worker、Addon/server/map/HTTP/logsに成功 |
| Addon Lab | 14テスト、3ブラウザで1440×1000/390×844、編集・エラー復旧・import/exportに成功 |
| Cargo | fmt、default check、default/all-features Clippy、Rustdocに成功 |
| Repository | 依存境界、生成API/ABI/font、文書リンク、画面契約hash、権利表示同期に成功 |
| npm package | 独立環境へのoffline install後、公開packageだけからconsumer例を実行。41ファイル |
| 配布パス | SDKと静的サイトの46ファイル/3WASMを検査。既知のホームパスは0件 |

Nativeのtest関数数は、不要になった元資料依存の1テストを除去したため57から56へ変わりました。その代わり、採用済み731ケースを実Lua経路でも全件検証します。異なるコーパスの件数を同じ実ゲーム測定の件数として換算しません。

## 配布物のプライバシー

両WASM targetをパス正規化付きで再ビルドしました。runtime WASMで以前の依存ソース位置に相当する19文字列は、個人のホームではなく`/dependencies/cargo/`を指します。SDK、独立installしたpackage、Addon Labの配布候補を再検査しました。既存バイナリの文字列を手作業で書き換えてはいません。

検査は既知のprefixとホームパス表記が対象です。未知の秘密情報が絶対に存在しないこと、将来の別toolchain/linkerの出力まで保証するものではありません。

## 再実行

[CONTRIBUTING](../../CONTRIBUTING.md)のgateに加えて、`node tools/check-artifacts.mjs packages/lua-engine/dist examples/addon-lab/dist`を実行します。Addon Labの全ブラウザ検証は`LAB_BROWSERS=chromium,firefox,webkit npm --prefix examples/addon-lab run test:e2e`です。

環境はLinux x86_64、Rust1.97.1、Node22.22.1、Emscripten6.0.6。公開契約の検査に外部元データは必要ありません。依存ライブラリやSDKの初回取得は通常のビルド準備です。

## この測定時点の制限

新しい実ゲーム測定、NativeのWindows/macOS/別CPU、実VSCode WebViewの検証は今回行っていません。GitHub Actionsはpush前のため未実行です。この時点で未完了だった配布通知は、0.1.0の[配布設計](../design/distribution.md)で管理しています。

過去のGit履歴は変更せず、push/publishも行っていません。過去commitに含まれる途中資料が消えたとは主張しません。公開手順と現在の版は[リリース手順](../release.md)と[STATUS](../../STATUS.md)を参照してください。
