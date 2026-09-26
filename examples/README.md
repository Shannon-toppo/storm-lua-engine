# Embedding examples

## Playground

SDK全体の対話的な確認は[Storm Lua Engine: Playground](../app/README.md)を利用してください。Addon Labのホスト・イベント・保存・エラー確認はappへ整理し、旧Labと仮物理・3Dワールドを削除しました。以下の小さな組み込み例は維持しています。

## Native

`cargo run -p storm-lua-conformance --example native-foundation --locked`は数値境界の小例。`cargo run -p storm-lua-conformance --example microcontroller --locked`は実際のload/tick/drawとCPU framebuffer、`--example differential`は最適化前後の同じI/O/画素比較を行う。

例はtest-only memberへ配置し、製品側へexamples/テスト用依存を混入させない。

## Browser and Worker

TSとWASMをbuildした後、リポジトリルートから`python3 -m http.server 8080`で配信し、[browser example](browser/index.html)を開く。Runボタンで明示的にsourceをloadし、1tick/1drawを実行する。CanvasPresenterはraw RGBAをImageDataへcopyする。

[module Worker example](browser/runtime-worker.js)は1jobごとにVMを生成し、owned frame copyだけをtransferする。Workerの生成/終了、job schedulingはアプリ側が所有する。`node tools/test-browser.mjs`は3ブラウザそれぞれで2 Workerの独立実行も検証する。

## Performance

`cargo run --release -p storm-lua-conformance --example benchmark --locked`と`node tools/bench-wasm.mjs`が同じLua fixtureを測る。測定範囲と注意点は[testing/performance](../docs/design/testing-performance.md)。

## 利用アプリ側から実行する例

[Node consumer](consumer/node.mjs)は公開package名だけをimportし、vehicle制御・ホスト地図・Addon lifecycle/server・ログ・HTTP・checkpoint roundtripを実行する。ローカルでpacked packageをインストールしたアプリへ、このファイルをコピーして実行する。`tools/test-package.mjs`はその手順を独立したofflineインストール環境で自動検証する。

[Native addon host](../conformance/examples/addon_host.rs)はRustのserver callback、ログ、保存・復元、map providerを示す。`cargo run -p storm-lua-conformance --example addon_host --locked`で実行できる。conformanceは例の起動用targetであり、製品側から依存するcrateではない。

例に含む地図・プレイヤー・HTTP replyはテストホストが明示的に用意したデータであり、ゲーム環境が無い場合のengine fallbackではない。詳細は[consumer guides](../docs/guide/getting-started.md)。

## 開発用の名前付きソース

[source-loading.mjs](consumer/source-loading.mjs)はインストール済みSDKだけを利用し、require先のブレークポイントと前置き・本体・後置きのresetを確認します。`node tools/test-package.mjs`も同じ例を隔離consumerで実行します。利用手順は[ソースガイド](https://docs.makkii.jp/storm-lua-engine/source-loading)を正本とします。
