//! コンポジット信号はf32を使用し、Luaの数値境界はf64を使用します。
use std::fmt;

/// 方向ごとの数値およびブール値チャンネル数。
pub const CHANNEL_COUNT: usize = 32;

/// 検証済みの1始まりのチャンネル番号。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Channel(u8);

/// 1..=32の範囲外のチャンネル番号。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InvalidChannel(pub u32);
impl fmt::Display for InvalidChannel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "channel {} is outside 1..=32", self.0)
    }
}
impl std::error::Error for InvalidChannel {}
impl TryFrom<u32> for Channel {
    type Error = InvalidChannel;
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        if (1..=CHANNEL_COUNT as u32).contains(&value) {
            Ok(Self(value as u8))
        } else {
            Err(InvalidChannel(value))
        }
    }
}
impl Channel {
    /// 0始まりの配列インデックス。チャンネルの検証は完了済みです。
    pub const fn index(self) -> usize {
        self.0 as usize - 1
    }
}

/// ネイティブ表現。この型自体はFFIレイアウトではありません。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CompositeSignal {
    /// ワイヤ上のbinary32値（Luaレジスタではありません）。
    pub numbers: [f32; CHANNEL_COUNT],
    /// 論理ブール値。
    pub booleans: [bool; CHANNEL_COUNT],
}
impl Default for CompositeSignal {
    fn default() -> Self {
        Self {
            numbers: [0.0; CHANNEL_COUNT],
            booleans: [false; CHANNEL_COUNT],
        }
    }
}
impl CompositeSignal {
    /// 再度の丸めを行わずに、ワイヤ値をLuaのNumberドメインに読み込みます。
    pub fn read_number(&self, channel: Channel) -> f64 {
        f64::from(self.numbers[channel.index()])
    }
    /// 各Lua算術演算の後ではなく、出力境界で型を縮小（f32へキャスト）します。
    pub fn write_number(&mut self, channel: Channel, value: f64) {
        self.numbers[channel.index()] = value as f32;
    }
}
