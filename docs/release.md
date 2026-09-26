# リリース手順

リリースは管理者の明示指示で行います。CIは検証のみで、通常のpushからregistryへ自動公開しません。RustクレートはGitタグ、JavaScript／TypeScript SDKはnpm、ビルド済み配布物はGitHub Releasesで提供します。

## 版と契約の確認

Cargo workspaceと`packages/lua-engine/package.json`の版を揃え、`CHANGELOG.md`へ利用者に影響する変更を書きます。タグは`v<version>`とします。公開済みのタグやnpmの同じ版を差し替えず、修正は新しい版として出します。

公開API、WASM ABI、描画命令、savedata/checkpoint、Playgroundのproject形式に非互換変更があるか確認します。形式を変える場合は版とreject条件、往復テストを同時に更新し、予定している非互換変更を分散したリリースへ持ち越しません。初版0.1.0では採用済みの画面731ケース、数値規則、保存形式を変更していません。

## 検証とビルド

[CONTRIBUTING](../CONTRIBUTING.md)のNative、型、Python、WASM、ブラウザのゲートを実行します。固定toolchainを用意し、`python3 tools/generate-toolchain-licenses.py --check`で配布通知を照合します。toolchain更新時は先に同じコマンドの`--check`なしで再生成し、原文とmanifestの変更をレビューします。

`node tools/build-wasm.mjs --with-tests`と`node tools/test-wasm.mjs --with-tests`では、製品WASMだけでなく独立したLua backend probeも実行します。`node tools/test-browser.mjs`では3エンジンで直接描画・実Lua描画・ホスト機能を検査します。

Playgroundは`npm --prefix app ci`でローカルSDK依存を更新した後、`npm --prefix app run build`、`npm --prefix app test`を実行します。全ブラウザの操作試験は`npm --prefix app run test:browser`です。

画面のないLinuxランナーでも、Playgroundはheadlessブラウザ試験を`npm --prefix app run test:browser`で実行します。ブラウザ依存はPlaywrightの`install --with-deps`で用意します。

`node tools/check-package.mjs`はJS export、WASM、必須の通知、公開先設定を確認します。`npm pack`のprepackにも組み込まれており、TypeScriptだけをビルドした不完全な配布物を拒否します。パス検査は`node tools/check-artifacts.mjs packages/lua-engine/dist app/dist`で実行します。

## 同じ成果物を検査して公開する

`packages/lua-engine/`で`npm pack --json --pack-destination <出力先>`を実行し、生成したtarballを`node tools/test-package.mjs <tarballのパス>`で検査します。独立環境へoffline installし、Lua・描画・公開exportとドキュメントのconsumer例を実行します。引数なしの場合は検査用tarballを一時生成します。

GitHub Releasesには検査したnpm tarball、Playgroundの静的サイトZIP、`SHA256SUMS`を添付します。静的サイトZIPには`dist/`の内容と必要な権利表示を含めます。個人パス、調査資料、内部履歴のバックアップ、node_modules、Cargo target、テスト専用WASMは配布しません。Rust用ソースはタグから取得します。

公開するcommitのCI成功を確認し、同じcommitへタグを付けます。npmは検査済みtarballを`npm publish <tarballのパス> --access public --tag latest --registry=https://registry.npmjs.org/ --ignore-scripts`で公開します。認証や二要素認証が必要な場合は管理者の認証手順を使い、トークンをコード、ログ、チャットへ記録しません。

公開後、registryのversion・dist-tag・integrityとGitHub Releaseのassetを確認し、registryから新しくインストールしたconsumerを実行します。dry-run、タグ作成、tarballの添付だけでnpm公開済みとは扱いません。

## ブランチ

`main`は公開する版、`develop`は次の変更を管理します。初回公開ではレビュー済みtreeを親なしの1commitにまとめ、そのcommitから`develop`を作成します。公開対象でない開発履歴の復旧用bundleはローカルだけに保存し、公開refやReleaseには含めません。以後の通常リリースで初期化や履歴の作り直しを繰り返しません。

## Compiler assets on the integration branch

A release containing the compiler subpath must additionally run `node tools/build-compiler.mjs`, `npm --prefix packages/lua-engine run test:compiler` and `node tools/test-compiler-browser.mjs`. Build compiler assets before the full package gate. The isolated installed consumer exercises both compiler and runtime together, including property snapshot preservation. Do not reuse the published 0.1.0 number for this expanded SDK; select a new version as an explicit release action.

## Playgroundの配布

`app/`にはCLI/Webと公開用Worker設定を置きます。`npm --prefix app run build`は`app/dist`と専用route向け`app/dist-site`を生成します。`npm --prefix app run deploy:dry-run`は梱包検査であり、本番配備ではありません。Storm Minの製品・Worker・routeは維持します。

Addon Labの現在のソース・CI参照は撤去済みです。過去版ReleaseのLab資産は書き換えません。配布物のライセンスとsource/WASM版の一致を確認し、実配備は明示的に実施します。

## 環境契約変更の公開ゲート

環境プロファイル対応版は、既定のpcall/error/print等、onLogの副作用、コンパイラ診断、外部名と_ENVの扱いを変更します。新しい版で公開し、0.1.0を差し替えません。gameとextendedの同じ条件でNative/WASMを検査し、compiler-workerとホストbindingsを梱包済みconsumerから実行します。既存利用者にはextendedの明示指定と、必要なcompiler側hostBindingsの指定を案内します。
