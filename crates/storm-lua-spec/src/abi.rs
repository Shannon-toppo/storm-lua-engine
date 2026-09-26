//! バージョン管理された固定I/O ABI。ネイティブのドメイン型はこのメモリレイアウトに直接キャストされません。
use crate::io::CHANNEL_COUNT;

/// 初期の未リリースABIリビジョン。
pub const ABI_VERSION: u32 = 1;
/// 単体のラスタライズコマンドが実装されています。
pub const CAP_RASTER: u32 = 1;
/// マネージドLua実行およびマイクロコントローラーのコールバックが実装されています。
pub const CAP_RUNTIME: u32 = 2;
/// オプションのホストデバッガがこのモジュールビルドで利用可能です。
pub const CAP_DEBUG: u32 = 4;
/// 独立したホスト駆動型アドオンプロファイル。
pub const CAP_ADDON: u32 = 8;
/// 同期JSホストコールバックがランタイムアダプタにリンクされています。
pub const CAP_HOST_SERVICES: u32 = 16;
/// ワークスペースによって実装されている機能群。各モジュールのアクティブなサブセットを照会してください。
pub const CAPABILITIES: u32 = CAP_RASTER | CAP_RUNTIME | CAP_DEBUG | CAP_ADDON | CAP_HOST_SERVICES;
/// wasm32向けの固定I/Oレイアウト。Rustのboolの代わりにu8が使用されます。
#[repr(C, align(4))]
#[derive(Debug, Clone, Copy)]
pub struct IoBuffer {
    /// 32個のbinary32入力値。
    pub input_numbers: [f32; CHANNEL_COUNT],
    /// 標準的な0/1バイト列。RustのBooleanを構築する前に検証してください。
    pub input_booleans: [u8; CHANNEL_COUNT],
    /// 32個のbinary32出力値。
    pub output_numbers: [f32; CHANNEL_COUNT],
    /// 標準的な0/1出力バイト列。
    pub output_booleans: [u8; CHANNEL_COUNT],
}
impl Default for IoBuffer {
    fn default() -> Self {
        Self {
            input_numbers: [0.0; CHANNEL_COUNT],
            input_booleans: [0; CHANNEL_COUNT],
            output_numbers: [0.0; CHANNEL_COUNT],
            output_booleans: [0; CHANNEL_COUNT],
        }
    }
}
/// ハンドルやメタデータを除いた固定ペイロード長。
pub const IO_BYTE_LENGTH: usize = std::mem::size_of::<IoBuffer>();
/// 必要なポインタアライメント。
pub const IO_ALIGNMENT: usize = std::mem::align_of::<IoBuffer>();
/// 入力数値チャンネルのオフセット。
pub const INPUT_NUMBERS_OFFSET: usize = std::mem::offset_of!(IoBuffer, input_numbers);
/// 入力ブール値チャンネルのオフセット。
pub const INPUT_BOOLEANS_OFFSET: usize = std::mem::offset_of!(IoBuffer, input_booleans);
/// 出力数値チャンネルのオフセット。
pub const OUTPUT_NUMBERS_OFFSET: usize = std::mem::offset_of!(IoBuffer, output_numbers);
/// 出力ブール値チャンネルのオフセット。
pub const OUTPUT_BOOLEANS_OFFSET: usize = std::mem::offset_of!(IoBuffer, output_booleans);
