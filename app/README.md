# Storm Lua Engine: Playground

SDKの全公開機能を試し、何ができるか確認するための公式CLI/Webです。**現在は設計を記録した段階で、アプリ・公開用Worker・Addon Labからの移行は未実装です。**

Storm Minの既存CLI/Webとは併存します。短縮ツールの置き換えや、完全なIDE・ゲームワールドの開発は行いません。

[Playground設計](../docs/design/playground.md)が範囲・配置・完了条件の正本です。[ADR 0006](../docs/adr/0006-playground-coexistence.md)は採用理由、[STATUS](../STATUS.md)は実装状況を示します。

## このディレクトリで管理するもの

| 予定配置 | 役割 |
| --- | --- |
| `cli/` | SDKを操作するCLI |
| `web/` | SDKを試すブラウザ画面 |
| `wrangler.jsonc`と必要な配信処理・スクリプト | makkii.jpでLua Engine / Playgroundを公開するCloudflare Worker |

これらは今後の配置であり、現時点で実行できるコマンドを示していません。SDKのライブラリ・汎用アダプタは既存のcrate/packageに維持し、Playgroundのアプリ依存をSDKへ混入させません。

[Addon Lab](../examples/addon-lab/README.md)は必要なSDK接続・確認ケースをここへ移行し、移行先の動作確認後に旧アプリを削除します。港・船・仮物理の独立シミュレータは引き継ぎません。
