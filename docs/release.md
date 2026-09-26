# リリース手順

リリースは管理者の明示指示で行います。CIは検証のみで、通常のpushからregistryへ自動公開しません。RustクレートはGitタグ、JavaScript／TypeScript SDKはnpm、ビルド済み配布物はGitHub Releasesで提供します。

## 版と契約の確認

Cargo workspaceと`packages/lua-engine/package.json`の版を揃え、`CHANGELOG.md`へ利用者に影響する変更を書きます。タグは`v<version>`とします。公開済みのタグやnpmの同じ版を差し替えず、修正は新しい版として出します。

公開API、WASM ABI、描画命令、savedata/checkpoint、Addon Labのproject形式に非互換変更があるか確認します。形式を変える場合は版とreject条件、往復テストを同時に更新し、予定している非互換変更を分散したリリースへ持ち越しません。初版0.1.0では採用済みの画面731ケース、数値規則、保存形式を変更していません。

## 検証とビルド

[CONTRIBUTING](../CONTRIBUTING.md)のNative、型、Python、WASM、ブラウザのゲートを実行します。固定toolchainを用意し、`python3 tools/generate-toolchain-licenses.py --check`で配布通知を照合します。toolchain更新時は先に同じコマンドの`--check`なしで再生成し、原文とmanifestの変更をレビューします。

`node tools/build-wasm.mjs --with-tests`と`node tools/test-wasm.mjs --with-tests`では、製品WASMだけでなく独立したLua backend probeも実行します。`node tools/test-browser.mjs`では3エンジンで直接描画・実Lua描画・ホスト機能を検査します。

Addon Labは`npm --prefix examples/addon-lab ci`でローカルSDK依存を更新した後、`npm --prefix examples/addon-lab run build`、`npm --prefix examples/addon-lab test`を実行します。全ブラウザの操作試験は`LAB_BROWSERS=chromium,firefox,webkit npm --prefix examples/addon-lab run test:e2e`です。

画面のないLinuxランナーでは、Addon LabのWebGL試験を`LAB_BROWSERS=chromium,firefox,webkit LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a npm --prefix examples/addon-lab run test:e2e`で実行します。Xvfbとブラウザ依存はPlaywrightの`install --with-deps`で用意します。

`node tools/check-package.mjs`はJS export、WASM、必須の通知、公開先設定を確認します。`npm pack`のprepackにも組み込まれており、TypeScriptだけをビルドした不完全な配布物を拒否します。パス検査は`node tools/check-artifacts.mjs packages/lua-engine/dist examples/addon-lab/dist`で実行します。

## 同じ成果物を検査して公開する

`packages/lua-engine/`で`npm pack --json --pack-destination <出力先>`を実行し、生成したtarballを`node tools/test-package.mjs <tarballのパス>`で検査します。独立環境へoffline installし、Lua・描画・公開exportとドキュメントのconsumer例を実行します。引数なしの場合は検査用tarballを一時生成します。

GitHub Releasesには検査したnpm tarball、Addon Labの静的サイトZIP、`SHA256SUMS`を添付します。静的サイトZIPには`dist/`の内容と必要な権利表示を含めます。個人パス、調査資料、内部履歴のバックアップ、node_modules、Cargo target、テスト専用WASMは配布しません。Rust用ソースはタグから取得します。

公開するcommitのCI成功を確認し、同じcommitへタグを付けます。npmは検査済みtarballを`npm publish <tarballのパス> --access public --tag latest --registry=https://registry.npmjs.org/ --ignore-scripts`で公開します。認証や二要素認証が必要な場合は管理者の認証手順を使い、トークンをコード、ログ、チャットへ記録しません。

公開後、registryのversion・dist-tag・integrityとGitHub Releaseのassetを確認し、registryから新しくインストールしたconsumerを実行します。dry-run、タグ作成、tarballの添付だけでnpm公開済みとは扱いません。

## ブランチ

`main`は公開する版、`develop`は次の変更を管理します。初回公開ではレビュー済みtreeを親なしの1commitにまとめ、そのcommitから`develop`を作成します。公開対象でない開発履歴の復旧用bundleはローカルだけに保存し、公開refやReleaseには含めません。以後の通常リリースで初期化や履歴の作り直しを繰り返しません。

## Compiler assets on the integration branch

A release containing the compiler subpath must additionally run `node tools/build-compiler.mjs`, `npm --prefix packages/lua-engine run test:compiler` and `node tools/test-compiler-browser.mjs`. Build compiler assets before the full package gate. The isolated installed consumer exercises both compiler and runtime together, including property snapshot preservation. Do not reuse the published 0.1.0 number for this expanded SDK; select a new version as an explicit release action.
