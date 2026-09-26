//! 順序付けられた画面コマンドおよび差し替え可能な描画ターゲット。
use crate::screen::Rgba8;
use std::fmt;

/// 解決済みの画面APIコマンド。座標はbinary64（f64）精度を維持します。
#[derive(Debug, Clone, PartialEq)]
pub enum DrawCommand {
    /// コマンド順序を維持しつつ、ワールドX/Zとズーム値でホストの地形データを要求します。
    Map([f64; 3]),
    /// 現在のフレームについてマップパレットの1スロットを上書きします。
    MapColor(crate::map::MapColorKind, Rgba8),
    /// 現在の描画色を変更します。
    SetColor(Rgba8),
    /// アルファブレンドを行わず、全ピクセルを現在のRGBA値で置換します。
    Clear,
    /// ダイアモンドエグジット則に基づく直線の端点。
    Line([[f64; 2]; 2]),
    /// 左上座標、幅、高さ。true の場合は塗りつぶしプリミティブを選択します。
    Rect([f64; 4], bool),
    /// 中心座標と半径。true の場合は塗りつぶしプリミティブを選択します。
    Circle([f64; 3], bool),
    /// 頂点座標。true の場合は塗りつぶしプリミティブを選択します。
    Triangle([[f64; 2]; 3], bool),
    /// 指定位置のUTF-8テキスト。生のバイト列は描画境界まで保持されます。
    Text([f64; 2], Vec<u8>),
    /// x, y, 幅, 高さ, 水平揃え, 垂直揃え、およびテキスト。
    TextBox([f64; 6], Vec<u8>),
}
impl DrawCommand {
    /// ホストバッファの上限を強制するための、保持されているテキストペイロードサイズ。
    pub fn text_bytes(&self) -> usize {
        match self {
            Self::Text(_, text) | Self::TextBox(_, text) => text.len(),
            _ => 0,
        }
    }
}

/// 明示的な描画／ホストバッファエラー（空の成功フレームへ沈黙変換しません）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScreenError {
    /// 明示的なプロバイダがない状態で地形要求が再生されました。
    MissingMapProvider,
    /// ホスト提供のレンダラーが失敗しました。
    Host(String),
    /// 不正なバイナリ描画レコードまたは未サポートのオペコード。
    InvalidCommand,
    /// 解像度が設定されたラスタライズ契約を超過しています。
    InvalidSize,
    /// メモリ確保または保持コマンド数の上限を超過しました。
    LimitExceeded,
    /// このラスタライズテキストパスは有効なUTF-8を必要とします（不正バイトは暗黙置換されません）。
    InvalidText,
}
impl fmt::Display for ScreenError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::MissingMapProvider => "drawMap requires an explicit host map provider",
            Self::Host(message) => message,
            Self::InvalidSize => "invalid raster size",
            Self::InvalidCommand => "invalid drawing command",
            Self::LimitExceeded => "screen resource limit exceeded",
            Self::InvalidText => "screen text is not valid UTF-8",
        })
    }
}
impl std::error::Error for ScreenError {}

/// 利用側はレンダラーへの依存を持たずにコマンドの記録、ラスタライズ、またはルーティングを行えます。
pub trait ScreenSink {
    /// 順序と重複ピクセルのカバレッジを維持しながら、正確に1つのコマンドを処理します。
    fn submit(&mut self, command: &DrawCommand) -> Result<(), ScreenError>;
}

/// 上限付きで再利用可能な順序付きコマンドバッファ。
#[derive(Debug)]
pub struct CommandBuffer {
    commands: Vec<DrawCommand>,
    text_bytes: usize,
    max_commands: usize,
    max_text_bytes: usize,
}
impl CommandBuffer {
    /// 上限値は明示的であり、単一のコールバックに適用されます。
    pub fn new(max_commands: usize, max_text_bytes: usize) -> Self {
        Self {
            commands: Vec::new(),
            text_bytes: 0,
            max_commands,
            max_text_bytes,
        }
    }
    /// 所有権を持つコマンドを記録します。バッファ変更前に境界チェックが行われます。
    pub fn push(&mut self, command: DrawCommand) -> Result<(), ScreenError> {
        let size = self
            .text_bytes
            .checked_add(command.text_bytes())
            .ok_or(ScreenError::LimitExceeded)?;
        if self.commands.len() >= self.max_commands || size > self.max_text_bytes {
            return Err(ScreenError::LimitExceeded);
        }
        self.commands
            .try_reserve(1)
            .map_err(|_| ScreenError::LimitExceeded)?;
        self.commands.push(command);
        self.text_bytes = size;
        Ok(())
    }
    /// 保持されているコマンドシーケンスを参照します。
    pub fn commands(&self) -> &[DrawCommand] {
        &self.commands
    }
    /// ベクタの容量を維持したまま、論理的な内容をクリアします。
    pub fn clear(&mut self) {
        self.commands.clear();
        self.text_bytes = 0;
    }
    /// 順序通りに再生します。エラーが発生した場合、ターゲットに部分的なフレームが残る可能性があります。
    pub fn replay(&self, sink: &mut dyn ScreenSink) -> Result<(), ScreenError> {
        for command in &self.commands {
            sink.submit(command)?;
        }
        Ok(())
    }
}
