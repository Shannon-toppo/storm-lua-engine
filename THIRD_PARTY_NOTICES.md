# 第三者の権利表示

## 新規実装と文書

新規コードと文書は[プロジェクトのMIT License](LICENSE)で提供します。既存の第三者由来部分の表示を置き換えるものではありません。

## 描画構成要素

CPUラスタライザ、グリフ表、採用済みの描画回帰データには、MITで提供された実装・データに由来する部分があります。単なる関数名や仕様の参照だけではなく移植部分を含むため、Copyright (c) 2026 Shannon-Toppoと[MIT許諾原文](licenses/screen-components-MIT.txt)を保持します。

この表示は開発上の依存先や仕様の正本を指定するものではありません。仕様・実装・採用済みケースは本リポジトリが所有し、他のアプリケーションをビルド・実行・CIに必要としません。移植した部分を含むことと、現在の依存方向は区別します。

npmには同じ原文を`SCREEN_COMPONENTS_LICENSE`として同梱します。ブラウザサンプルの静的配布にも引き継ぎます。元ソース一式の保持と、この権利表示の保持は別です。

## RustとLuaの依存

mlua、Lua5.3、Serde等の解決済み依存については[自動生成一覧](packages/lua-engine/THIRD_PARTY_LICENSES.txt)に許諾全文を収録します。生成方法は[配布設計](docs/design/distribution.md)を参照してください。lockfileのbuild helperと選択した実行backendを混同せず、実行backendはLua5.3です。

## Toolchainとシステムライブラリ

配布WASMとJSに関連するEmscriptenおよびシステムライブラリの通知を[TOOLCHAIN_LICENSES.txt](packages/lua-engine/TOOLCHAIN_LICENSES.txt)へ、固定Rust toolchainの標準ライブラリ通知原文を[RUST_STD_LICENSES.html](packages/lua-engine/RUST_STD_LICENSES.html)へ収録しています。Cargo依存の一覧とは別に同梱し、Addon Labの静的配布にも引き継ぎます。

生成元の相対パス・SHA256は[manifest](tools/toolchain-licenses.json)、更新手順は[配布設計](docs/design/distribution.md)を参照してください。通知は対応するtoolchainの保守的な上位集合です。任意のSDK設定や別のビルド形態まで無条件に網羅するものではありません。

## ブラウザサンプル

サンプルは独立したnpm packageです。Three.js、CodeMirror等、実際に解決した実行時依存のlicenseをbuild時に収集します。港と船の簡易モデルはサンプルコードが作成し、エンジン本体に3D/UI依存を追加しません。[サンプル](examples/addon-lab/README.md)を参照してください。
