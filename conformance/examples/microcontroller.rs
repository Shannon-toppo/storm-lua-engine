//! WASMやUIへの依存がない、完全なネイティブ組み込みの例。
use std::error::Error;
use storm_lua_microcontroller::{Microcontroller, MicrocontrollerConfig};
use storm_lua_spec::{
    io::CompositeSignal,
    property::{PropertyBag, PropertyValue},
};
use storm_screen_raster::raster::ScreenRaster;
fn main() -> Result<(), Box<dyn Error>> {
    let mut properties = PropertyBag::default();
    properties.insert(b"Gain".to_vec(), PropertyValue::Number(1.5));
    let mut vm = Microcontroller::new(MicrocontrollerConfig {
        properties,
        ..Default::default()
    })?;
    vm.load(br#"local gain=property.getNumber("Gain")
function onTick() output.setNumber(1,input.getNumber(1)*gain) end
function onDraw() screen.setColor(25,50,75) screen.drawClear() screen.setColor(255,255,255) screen.drawText(2,2,"LUA") end"#,"=native-example")?;
    let mut input = CompositeSignal::default();
    input.numbers[0] = 0.8;
    let tick = vm.tick(&input)?;
    let draw = vm.draw(32, 32)?;
    let mut raster = ScreenRaster::new(32, 32)?;
    vm.replay(&mut raster)?;
    println!(
        "tick={tick:?} draw={draw:?} output={} frame={} bytes",
        vm.output().numbers[0],
        raster.pixels().len()
    );
    Ok(())
}
