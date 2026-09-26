//! アドオンプロファイルの分離、ホスト呼び出し、ライフサイクル、および永続データ。
#[path = "support/assertions.rs"]
mod assertion_support;
use std::{cell::RefCell, collections::BTreeMap, error::Error, rc::Rc};
use storm_lua_addon::{Addon, AddonConfig};
use storm_lua_microcontroller::Microcontroller;
use storm_lua_vm::{
    logging::LogSource,
    runner::{ErrorKind, RunOutcome, StepMode},
    value::{HostFunction, LuaValue},
};
fn field(value: &LuaValue, name: &str) -> Option<LuaValue> {
    if let LuaValue::Table(entries) = value {
        entries
            .iter()
            .find(|(k, _)| *k == LuaValue::text(name))
            .map(|(_, v)| v.clone())
    } else {
        None
    }
}
#[test]
fn profiles_do_not_mix_namespaces_or_callback_contracts() -> Result<(), Box<dyn Error>> {
    let mut addon = Addon::new(Default::default())?;
    assert!(addon.tick(1).is_err());
    addon.load(
        &assertion_support::with_assertions(
            br#"assert(input==nil and output==nil and screen==nil and async==nil)
assert(property.getNumber==nil and type(property.slider)=='function')
assert(debug.getregistry==nil and type(debug.log)=='function' and print==nil)
assert(io==nil and os==nil and require==nil)
g_savedata={ticks=0}
function onCreate(new) assert(new) end
function onTick(dt) g_savedata.ticks=g_savedata.ticks+dt end"#,
        ),
        "=addon",
    )?;
    assert!(addon.tick(1).is_err());
    addon.start()?;
    assert!(addon.start().is_err());
    addon.tick(400)?;
    assert_eq!(
        field(&addon.savedata()?, "ticks"),
        Some(LuaValue::Integer(400))
    );
    assert!(addon.dispatch("onTick", &[]).is_err());
    assert!(addon.dispatch("onDraw", &[]).is_err());
    addon.destroy()?;
    assert!(addon.tick(1).is_err());
    assert!(addon.destroy().is_err());
    let mut vehicle = Microcontroller::new(Default::default())?;
    vehicle.load(&assertion_support::with_assertions(b"assert(server==nil and matrix==nil and g_savedata==nil and property.checkbox==nil); assert(type(async.httpGet)=='function')"), "=vehicle")?;
    Ok(())
}
#[test]
fn top_level_precedes_restore_and_on_create() -> Result<(), Box<dyn Error>> {
    let snapshot = LuaValue::record([("count", LuaValue::Integer(41))]);
    let mut addon = Addon::new(AddonConfig {
        is_world_create: false,
        savedata: Some(snapshot),
        ..Default::default()
    })?;
    addon.load(&assertion_support::with_assertions(br#"assert(g_savedata.count==nil)
g_savedata={count=999, default=property.checkbox('Enabled',true)}
assert(g_savedata.default==nil)
function onCreate(new) assert(not new); assert(g_savedata.count==41);g_savedata.count=g_savedata.count+1 end"#), "=restore")?;
    assert_eq!(
        field(&addon.savedata()?, "count"),
        Some(LuaValue::Integer(41))
    );
    addon.start()?;
    assert_eq!(
        field(&addon.savedata()?, "count"),
        Some(LuaValue::Integer(42))
    );
    Ok(())
}
#[test]
fn synchronous_queries_preserve_tables_i64_bytes_and_trailing_nil() -> Result<(), Box<dyn Error>> {
    let seen = Rc::new(RefCell::new(Vec::new()));
    let capture = Rc::clone(&seen);
    let handler: HostFunction = Rc::new(move |args| {
        *capture.borrow_mut() = args.to_vec();
        Ok(vec![
            LuaValue::record([
                ("id", LuaValue::Integer(i64::MAX)),
                ("name", LuaValue::Bytes(vec![0, 255])),
            ]),
            LuaValue::Bool(true),
            LuaValue::Nil,
        ])
    });
    let mut addon = Addon::new(AddonConfig {
        server: BTreeMap::from([("query".into(), handler)]),
        ..Default::default()
    })?;
    addon.load(&assertion_support::with_assertions(br#"function onCreate()
local r=table.pack(server.query(9223372036854775807, string.char(0,255), nil))
assert(r.n==3 and r[2] and r[3]==nil and r[1].id==9223372036854775807 and r[1].name==string.char(0,255))
end"#), "=query")?;
    addon.start()?;
    assert_eq!(
        *seen.borrow(),
        vec![
            LuaValue::Integer(i64::MAX),
            LuaValue::Bytes(vec![0, 255]),
            LuaValue::Nil
        ]
    );
    Ok(())
}
#[test]
fn missing_services_and_bad_host_data_are_not_success_stubs() -> Result<(), Box<dyn Error>> {
    let mut addon = Addon::new(Default::default())?;
    addon.load(
        &assertion_support::with_assertions(b"function onCreate() server.getPlayers() end"),
        "=missing",
    )?;
    assert_eq!(
        addon.start().err().ok_or("missing error")?.kind,
        ErrorKind::Lua
    );
    assert!(Addon::new(AddonConfig {
        is_world_create: false,
        savedata: Some(LuaValue::Table(vec![
            (LuaValue::Integer(1), LuaValue::Bool(true)),
            (LuaValue::Number(1.0), LuaValue::Bool(false))
        ])),
        ..Default::default()
    })
    .is_err());
    let mut addon = Addon::new(Default::default())?;
    addon.load(
        &assertion_support::with_assertions(b"g_savedata.self=g_savedata"),
        "=cycle",
    )?;
    assert!(addon.savedata().is_err());
    Ok(())
}
#[test]
fn menu_properties_logs_and_reload_checkpoint() -> Result<(), Box<dyn Error>> {
    let mut config = AddonConfig::default();
    config.properties.insert(
        b"Rate".to_vec(),
        storm_lua_spec::property::PropertyValue::Number(2.5),
    );
    config.dev_logs = true;
    config.environment = storm_lua_spec::environment::EnvironmentProfile::Extended;
    let mut addon = Addon::new(config)?;
    addon.load(&assertion_support::with_assertions(br#"g_savedata={rate=property.slider('Rate',0,10,0.5,1),enabled=property.checkbox('Enabled',true)}
print('loaded',string.char(255))
function onCreate(new) debug.log('started',new); assert(g_savedata.rate==2.5 and g_savedata.enabled) end"#), "=menu")?;
    addon.start()?;
    assert_eq!(addon.property_definitions().len(), 2);
    let logs = addon.drain_log_records();
    assert_eq!(logs.len(), 2);
    assert_eq!(logs[0].source, LogSource::Print);
    assert_eq!(logs[0].bytes, b"loaded\t\xff");
    assert_eq!(logs[1].source, LogSource::Debug);
    let saved = addon.savedata()?;
    addon.reload(saved)?;
    addon.start()?;
    assert_eq!(
        field(&addon.savedata()?, "rate"),
        Some(LuaValue::Number(2.5))
    );
    Ok(())
}
#[test]
fn matrix_composition_inverse_and_vector_operations() -> Result<(), Box<dyn Error>> {
    let mut addon = Addon::new(AddonConfig {
        environment: storm_lua_spec::environment::EnvironmentProfile::Extended,
        ..Default::default()
    })?;
    addon.load(&assertion_support::with_assertions(br#"local a=matrix.translation(10,20,30)
local b=matrix.translation(1,2,3)
local x,y,z=matrix.position(matrix.multiply(a,b));assert(x==11 and y==22 and z==33)
local x,y,z,w=matrix.multiplyXYZW(a,2,3,4,1);assert(x==12 and y==23 and z==34 and w==1)
local p=matrix.multiply(a,matrix.rotationY(0.5));local i=matrix.multiply(p,matrix.invert(p));local expected=matrix.identity()
for n=1,16 do assert(math.abs(i[n]-expected[n])<1e-12) end
local tt=matrix.transpose(matrix.transpose(a));for n=1,16 do assert(tt[n]==a[n]) end
assert(matrix.distance(matrix.translation(0,0,0),matrix.translation(3,4,0))==5)
local singular={};for n=1,16 do singular[n]=0 end;assert(not pcall(matrix.invert,singular))"#), "=matrices")?;
    Ok(())
}
#[test]
fn paused_initialization_restores_savedata_only_after_top_level_completes(
) -> Result<(), Box<dyn Error>> {
    let mut addon = Addon::new(AddonConfig {
        is_world_create: false,
        savedata: Some(LuaValue::record([("n", LuaValue::Integer(7))])),
        ..Default::default()
    })?;
    addon.set_breakpoints(vec![("=paused".into(), 2)])?;
    assert_eq!(
        addon.load(
            &assertion_support::with_assertions(
                b"g_savedata.n=1
g_savedata.n=2
function onCreate() assert(g_savedata.n==7) end"
            ),
            "=paused"
        )?,
        RunOutcome::Suspended
    );
    assert!(addon.start().is_err());
    assert!(addon.savedata().is_err());
    addon.set_breakpoints(vec![])?;
    assert_eq!(addon.resume(StepMode::Continue)?, RunOutcome::Completed);
    assert_eq!(field(&addon.savedata()?, "n"), Some(LuaValue::Integer(7)));
    addon.start()?;
    Ok(())
}
