//! 共有アダプタのライフタイムおよび不正ハンドルに関するテスト。
use storm_lua_bridge::{allocate, error_status, free, value, with_upload, Registry, Status};

#[test]
fn handles_change_when_slots_are_reused_and_retired_handles_reject(
) -> Result<(), Box<dyn std::error::Error>> {
    let mut registry = Registry::default();
    let old = registry.insert(7)?;
    assert_eq!(*registry.get_mut(old)?, 7);
    registry.remove(old)?;
    let next = registry.insert(9)?;
    assert_ne!(next, old);
    assert!(registry.get_mut(old).is_err());
    assert!(registry.remove(0).is_err());
    assert!(registry.remove(old).is_err());
    assert_eq!(*registry.get_mut(next)?, 9);
    Ok(())
}
#[test]
fn upload_ownership_rejects_foreign_addresses_and_lengths() {
    let ptr = allocate(32);
    assert_ne!(ptr, 0);
    assert!(with_upload(ptr, 32, |b| Ok(b.len())).is_ok());
    assert!(with_upload(ptr, 33, |b| Ok(b.len())).is_err());
    assert!(with_upload(ptr + 1, 1, |b| Ok(b.len())).is_err());
    assert_eq!(free(ptr), Status::Ok as i32);
    assert!(with_upload(ptr, 1, |b| Ok(b.len())).is_err());
    assert_eq!(free(ptr), Status::InvalidHandle as i32);
}
#[test]
fn zero_value_can_be_success_and_must_use_separate_diagnostics() {
    assert_eq!(value(|| Ok(0)), 0);
    assert_eq!(error_status(), Status::Ok as i32);
    assert_eq!(allocate(0), 0);
    assert_eq!(error_status(), Status::InvalidArgument as i32);
}
