//! バイナリ入力はラスタライズ処理から独立してデコードおよび検証されます。
use storm_lua_spec::{command_wire, draw::DrawCommand};

#[test]
fn empty_batch_and_every_truncated_record_are_distinguished() {
    assert!(command_wire::decode(&[]).is_ok());
    let mut bytes = vec![3, 0, 0, 0, 32, 0, 0, 0];
    for n in [0.1_f64, -0.5, 10.0, 20.0] {
        bytes.extend_from_slice(&n.to_le_bytes());
    }
    for cut in 1..bytes.len() {
        assert!(command_wire::decode(&bytes[..cut]).is_err(), "cut {cut}");
    }
    assert_eq!(
        command_wire::decode(&bytes).ok(),
        Some(vec![DrawCommand::Line([[0.1, -0.5], [10.0, 20.0]])])
    );
}
#[test]
fn unknown_opcode_reserved_bits_and_overflow_lengths_reject() {
    for bytes in [
        [255, 255, 0, 0, 0, 0, 0, 0],
        [2, 0, 1, 0, 0, 0, 0, 0],
        [2, 0, 0, 0, 255, 255, 255, 255],
        [1, 0, 0, 0, 0, 0, 0, 0],
    ] {
        assert!(command_wire::decode(&bytes).is_err());
    }
}
#[test]
fn many_empty_commands_have_a_separate_count_limit() {
    let bytes = [2, 0, 0, 0, 0, 0, 0, 0].repeat(65537);
    assert!(command_wire::decode(&bytes).is_err());
}
