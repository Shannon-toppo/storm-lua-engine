// Test-local Lua assertions without injecting a standard global into the game profile.
/// Prefix on the same line so existing source-line breakpoint expectations are unchanged.
pub fn with_assertions(source: &[u8]) -> Vec<u8> {
    let mut script =
        b"local function assert(v)if not v then local fail=nil;fail()end return v end;".to_vec();
    script.extend_from_slice(source);
    script
}
