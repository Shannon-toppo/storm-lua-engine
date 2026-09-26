//! 検出可能なAPIメタデータと実際にインストールされた関数の一致を保証します。
use storm_lua_microcontroller::Microcontroller;
use storm_lua_spec::catalog::FUNCTIONS;

#[test]
fn every_catalog_entry_matches_its_implemented_profile() -> Result<(), Box<dyn std::error::Error>> {
    let mut plain = Microcontroller::new(Default::default())?;
    let mut developer = Microcontroller::new(Default::default())?;
    developer.enable_dev_logs()?;
    let mut regular = String::new();
    let mut extended = String::new();
    let mut seen = std::collections::HashSet::new();
    for function in FUNCTIONS {
        assert!(seen.insert(function.path));
        if function.availability == "host-extension" {
            extended.push_str(&format!("assert(type({})=='function')\n", function.path));
        } else {
            regular.push_str(&format!("assert(type({})=='function')\n", function.path));
        }
    }
    regular.push_str("assert(print==nil and debug==nil)");
    plain.load(regular.as_bytes(), "=catalog")?;
    developer.load(extended.as_bytes(), "=developer-catalog")?;
    Ok(())
}

#[test]
fn addon_catalog_is_distinct_and_all_owned_functions_exist(
) -> Result<(), Box<dyn std::error::Error>> {
    let mut addon = storm_lua_addon::Addon::new(Default::default())?;
    let mut script =
        String::from("assert(screen==nil and input==nil and output==nil and async==nil)\n");
    let mut seen = std::collections::HashSet::new();
    for path in storm_lua_spec::addon::FUNCTIONS {
        assert!(seen.insert(path));
        script.push_str(&format!("assert(type({path})=='function')\n"));
    }
    addon.load(script.as_bytes(), "=addon-catalog")?;
    let mut events = std::collections::HashSet::new();
    for callback in storm_lua_spec::addon::EVENTS {
        assert!(events.insert(callback));
        assert!(!["onCreate", "onTick", "onDestroy", "httpReply"].contains(callback));
    }
    Ok(())
}
