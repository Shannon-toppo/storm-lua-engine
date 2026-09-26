//! 再現可能な小規模ベースライン。バッチ平均値であり、個別呼び出しのレイテンシパーセンタイルではありません。
use std::{error::Error, hint::black_box, time::Instant};
use storm_lua_microcontroller::Microcontroller;
use storm_lua_spec::io::CompositeSignal;
use storm_screen_raster::raster::ScreenRaster;

fn measure(
    mut operation: impl FnMut() -> Result<(), Box<dyn Error>>,
    iterations: usize,
) -> Result<serde_json::Value, Box<dyn Error>> {
    for _ in 0..100 {
        operation()?;
    }
    let mut samples = Vec::new();
    for _ in 0..9 {
        let start = Instant::now();
        for _ in 0..iterations {
            operation()?;
        }
        samples.push(start.elapsed().as_secs_f64() * 1e6 / iterations as f64);
    }
    samples.sort_by(f64::total_cmp);
    Ok(
        serde_json::json!({"medianBatchMeanUs":samples[4],"maxBatchMeanUs":samples[8],"batches":9,"iterationsPerBatch":iterations}),
    )
}
fn main() -> Result<(), Box<dyn Error>> {
    let mut control = Microcontroller::new(Default::default())?;
    control.load(
        include_bytes!("../../fixtures/bench/control.lua"),
        "=control",
    )?;
    let mut input = CompositeSignal::default();
    input.numbers[0] = 0.8;
    input.numbers[1] = 0.25;
    let ticks = measure(
        || {
            control.tick(&input)?;
            black_box(control.output());
            Ok(())
        },
        5000,
    )?;
    let mut drawing = Microcontroller::new(Default::default())?;
    drawing.load(include_bytes!("../../fixtures/bench/draw.lua"), "=drawing")?;
    let mut raster = ScreenRaster::new(96, 96)?;
    let draws = measure(
        || {
            raster.begin_frame();
            drawing.draw(96, 96)?;
            drawing.replay(&mut raster)?;
            black_box(raster.pixels());
            Ok(())
        },
        250,
    )?;
    let create = measure(
        || {
            let mut vm = Microcontroller::new(Default::default())?;
            vm.load(
                include_bytes!("../../fixtures/bench/control.lua"),
                "=control",
            )?;
            black_box(vm);
            Ok(())
        },
        100,
    )?;
    println!(
        "{}",
        serde_json::json!({"runtime":"native-release","tick":ticks,"draw96":draws,"createAndLoad":create,"debugCompiled":true,"breakpoints":false})
    );
    Ok(())
}
