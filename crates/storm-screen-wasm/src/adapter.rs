//! Luaランタイムモジュールのアロケータおよびレジストリから分離された、ラスタライザ専用モジュールの状態。
use std::cell::RefCell;
use storm_lua_bridge::{BridgeError, Registry, Status};
use storm_screen_raster::raster::ScreenRaster;
pub(crate) struct Session {
    pub(crate) raster: ScreenRaster,
    pub(crate) epoch: u32,
}
thread_local! {static SESSIONS:RefCell<Registry<Session>>=RefCell::new(Registry::default());}
pub(crate) fn with<T>(
    handle: u32,
    operation: impl FnOnce(&mut Session) -> Result<T, BridgeError>,
) -> Result<T, BridgeError> {
    SESSIONS.with(|registry| {
        operation(
            registry
                .try_borrow_mut()
                .map_err(|_| BridgeError::new(Status::Busy, "raster registry is busy"))?
                .get_mut(handle)?,
        )
    })
}
pub(crate) fn new(width: u32, height: u32) -> Result<usize, BridgeError> {
    let raster = ScreenRaster::new(width, height)?;
    SESSIONS.with(|registry| {
        Ok(registry
            .try_borrow_mut()
            .map_err(|_| BridgeError::new(Status::Busy, "raster registry is busy"))?
            .insert(Session { raster, epoch: 1 })? as usize)
    })
}
pub(crate) fn dispose(handle: u32) -> Result<Status, BridgeError> {
    SESSIONS.with(|registry| {
        registry
            .try_borrow_mut()
            .map_err(|_| BridgeError::new(Status::Busy, "raster registry is busy"))?
            .remove(handle)?;
        Ok(Status::Ok)
    })
}
pub(crate) fn render(handle: u32, bytes: &[u8]) -> Result<Status, BridgeError> {
    let commands = storm_lua_spec::command_wire::decode(bytes)?;
    // 不正なデータによってフレームが部分的に置き換わることがないよう、クリア前にすべてのテキストを検証します。
    for command in &commands {
        match command {
            storm_lua_spec::draw::DrawCommand::Text(_, bytes)
            | storm_lua_spec::draw::DrawCommand::TextBox(_, bytes) => {
                std::str::from_utf8(bytes).map_err(|_| {
                    BridgeError::new(Status::InvalidArgument, "drawing text is not valid UTF-8")
                })?;
            }
            _ => {}
        }
    }
    with(handle, |session| {
        session.epoch = session
            .epoch
            .checked_add(1)
            .ok_or_else(|| BridgeError::new(Status::Limit, "frame epoch exhausted"))?;
        session.raster.begin_frame();
        session.raster.draw_batch(&commands)?;
        Ok(Status::Ok)
    })
}
