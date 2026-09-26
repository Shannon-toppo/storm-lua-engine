//! README参照: 完全なLuaエンジンとしてではなく、conformanceのサンプルターゲットを通じて実行してください。
use storm_lua_spec::io::{Channel, CompositeSignal};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut output = CompositeSignal::default();
    let channel = Channel::try_from(1)?;
    output.write_number(channel, 16_777_217.0);
    println!("wire output: {}", output.read_number(channel));
    Ok(())
}
