# Vehicle property contract

## Values and ownership

specが`PropertyBag`/`PropertyValue`を所有し、microcontrollerがLua getterを登録する。UI表示名、slider範囲、dropdown選択肢、ファイルの探索順と保存先はホスト側。

Numberはf64、Booleanはbool、Textとlabelはbytes。labelはcase-sensitive。Compositeのf32境界をpropertiesへ自動適用しない。実ゲームのProperty Numberの保存精度は未確定であり、このf64保持を実ゲーム確認済みという意味で使わない。

Rustは`PropertyBag::insert/get/remove`、TSは`{Gain:1.5,Enabled:true,Title:"TEXT"}`のrecord、またはbyte labelを含むtyped entry配列を使える。TS→WASMのcold codecはf64を16桁のIEEE754 hex、text/labelをbyte配列とする。NaN/Infinity/-0/NUL/非UTF-8をJSONの暗黙変換で失わない。壊れたJSON・重複label・型不一致のホスト設定はエラー。

## Execution

VM生成後・load前に設定する。トップレベルの`property.getNumber`で初期値を読める。1callback中は同じbagを参照し、Running/Suspended時の更新はBusyとして拒否する。全設定をparse/検証してから一括置換し、部分更新しない。

Luaのlocalへ既にキャッシュした値は書き換えない。resetは現在のpropertiesでVMを再構築し、保持sourceを再実行する。標準Luaテーブルにはgetterのみを置き、勝手にsim.setPropertyを追加しない。

## Getter behavior and evidence

現在のengine getterは、欠損または値型違いをNumber=0、Bool=false、Text=空bytesとして扱う。これはエンジンの明示規則であり、実ゲームの全異常系を測定済みではない。hostの不正JSONやバッファ破損までこの既定値へ隠蔽しない。

f64保持、case/bytes、initialization順、cached localとreset、停止中の更新拒否はNative/WASMのテストで検証する。実ゲームの保存精度とgetterの異常系oracleは[TASKS](../../TASKS.md)に残す。

Addonのmenu propertyは別APIであり、[Addon仕様](addon.md)を参照。vehicleのsetPropertiesをAddonへ流用しない。
