//! 両プロファイルにおけるホストHTTPの識別性、順序付け、およびコールバック契約。
use std::error::Error;
use storm_lua_addon::Addon;
use storm_lua_microcontroller::Microcontroller;
use storm_lua_vm::runner::{RunOutcome, StepMode};
#[test]
fn addon_reply_is_once_only_and_reload_invalidates_old_generation() -> Result<(), Box<dyn Error>> {
    let mut addon = Addon::new(Default::default())?;
    addon.load(br#"g_savedata={count=0}
function onCreate() server.httpGet(8080,'/hello') end
function httpReply(port,request,reply) assert(port==8080 and request=='/hello'); g_savedata.count=g_savedata.count+1;debug.log(reply) end"#,"=http")?;
    addon.start()?;
    let request = addon.drain_http_requests().pop().ok_or("missing request")?;
    assert!(addon.drain_http_requests().is_empty());
    addon.http_reply(request.token, b"raw\0\xff")?;
    assert_eq!(addon.drain_log_records()[0].bytes, b"raw\0\xff");
    assert!(addon.http_reply(request.token, b"duplicate").is_err());
    let snapshot = addon.savedata()?;
    addon.reload(snapshot)?;
    addon.start()?;
    let next = addon
        .drain_http_requests()
        .pop()
        .ok_or("missing reloaded request")?;
    assert_ne!(request.token.generation, next.token.generation);
    assert!(addon.http_reply(request.token, b"stale").is_err());
    addon.cancel_http(next.token)?;
    assert!(addon.http_reply(next.token, b"cancelled").is_err());
    Ok(())
}
#[test]
fn vehicle_reply_waits_for_idle_and_keeps_the_token_when_busy() -> Result<(), Box<dyn Error>> {
    let mut vm = Microcontroller::new(Default::default())?;
    vm.enable_dev_logs()?;
    vm.load(
        b"async.httpGet(9000,'/status')
function onTick()
local a=1
a=a+1
end
function httpReply(p,q,r) print(r) end",
        "=vehicle",
    )?;
    let request = vm.drain_http_requests().pop().ok_or("request")?;
    vm.set_breakpoints(vec![("=vehicle".into(), 4)])?;
    assert_eq!(vm.tick(&Default::default())?, RunOutcome::Suspended);
    assert!(vm.http_reply(request.token, b"first").is_err());
    vm.set_breakpoints(vec![])?;
    vm.resume(StepMode::Continue)?;
    vm.http_reply(request.token, b"second")?;
    assert_eq!(vm.drain_logs(), vec![b"second".to_vec()]);
    Ok(())
}
#[test]
fn queue_limits_apply_to_inflight_requests_and_foreign_tokens_reject() -> Result<(), Box<dyn Error>>
{
    use storm_lua_spec::http::HttpQueue;
    let mut q = HttpQueue::new()?;
    for path in [b"//evil".as_slice(), b"http://evil", b"/a\r\nb", b"/a\0b"] {
        assert!(q.request(80, path).is_err());
    }
    assert!(q.request(0, b"/").is_err());
    for _ in 0..128 {
        q.request(80, b"/ok")?;
    }
    let requests = q.drain();
    assert!(q.request(80, b"/overflow").is_err());
    let mut other = HttpQueue::new()?;
    assert!(other.reply(requests[0].token, b"foreign").is_err());
    q.cancel(requests[0].token)?;
    q.request(80, b"/replacement")?;
    Ok(())
}

#[test]
fn oversized_aggregate_reply_does_not_consume_the_request() -> Result<(), Box<dyn std::error::Error>>
{
    let mut queue = storm_lua_spec::http::HttpQueue::new()?;
    queue.request(8080, b"/status")?;
    let request = queue.drain().pop().ok_or("request")?;
    assert!(queue.reply(request.token, &vec![0; 1024 * 1024]).is_err());
    queue.reply(request.token, b"small valid reply")?;
    Ok(())
}
