//! コンパイラへの依存なしに、エンジンを通じてゲーム向け最適化を検証します。
use std::error::Error;
use storm_lua_microcontroller::Microcontroller;
use storm_lua_spec::io::CompositeSignal;
use storm_screen_raster::raster::ScreenRaster;
fn main() -> Result<(), Box<dyn Error>> {
    let original = br#"local value=0
function onTick() value=input.getNumber(1)*2 output.setNumber(1,value) end
function onDraw() screen.setColor(255,255,255) screen.drawRectF(value,2,3,4) end"#;
    let compact=br#"local a=0 function onTick()a=input.getNumber(1)*2 output.setNumber(1,a)end function onDraw()screen.setColor(255,255,255)screen.drawRectF(a,2,3,4)end"#;
    let mut before = Microcontroller::new(Default::default())?;
    before.load(original, "=original")?;
    let mut after = Microcontroller::new(Default::default())?;
    after.load(compact, "=compact")?;
    let mut a = ScreenRaster::new(32, 32)?;
    let mut b = ScreenRaster::new(32, 32)?;
    for n in [0.0, 0.25, 1.0, -2.5, 16_777_217.0] {
        let mut input = CompositeSignal::default();
        input.numbers[0] = n;
        if before.tick(&input)? != after.tick(&input)? || before.output() != after.output() {
            return Err("I/O mismatch".into());
        }
        before.draw(32, 32)?;
        after.draw(32, 32)?;
        a.begin_frame();
        b.begin_frame();
        before.replay(&mut a)?;
        after.replay(&mut b)?;
        if a.pixels() != b.pixels() {
            return Err("raw framebuffer mismatch".into());
        }
    }
    println!("Five input steps have matching output signals and screen-contract raw RGBA.");
    Ok(())
}
