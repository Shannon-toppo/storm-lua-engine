//! 上限付きのHTTPリクエスト／レスポンス管理。ネットワーククライアント、URLリゾルバ、スケジューラは含みません。
use std::{
    collections::{BTreeMap, VecDeque},
    fmt,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);
/// 不透明なレスポンス識別子。リセット後や異なるVMからのトークンは一致しません。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HttpToken {
    /// 一意のキュー世代。JS側ではbigintまたはタグ付き10進数文字列として受け渡されます。
    pub generation: u64,
    /// この世代内で単調増加するリクエストID。
    pub id: u32,
}
/// ホストトランスポートに渡されるリクエスト所有データ。エンジン自体はリクエストを送信しません。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpRequest {
    /// レスポンス／キャンセル用トークン。
    pub token: HttpToken,
    /// 明示的なlocalhostサービスポート。ホストの許可リストの対象となります。
    pub port: u16,
    /// origin-form のパス／クエリバイト列。CR、LF、NULは禁止されています。
    pub request: Vec<u8>,
}
/// 不正なホストトランスポート操作。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpError {
    /// ポート番号、ターゲット、またはレスポンス長が不正です。
    Invalid,
    /// 未処理リクエスト数または識別子の上限を使い果たしました。
    Limit,
    /// 失効したトークン、別VMのトークン、重複トークン、または未送信のトークンです。
    Unknown,
}
impl fmt::Display for HttpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Invalid => "invalid HTTP target, port or reply size",
            Self::Limit => "HTTP request budget exhausted",
            Self::Unknown => "stale, foreign, duplicate or undelivered HTTP token",
        })
    }
}
impl std::error::Error for HttpError {}
/// レスポンス待ちの取得済みリクエストを含め、最大128件の未処理リクエストを追跡します。
pub struct HttpQueue {
    generation: u64,
    next: u32,
    pending: BTreeMap<u32, (HttpRequest, bool)>,
    outbox: VecDeque<u32>,
}
impl HttpQueue {
    /// 独立した世代を作成します。再作成すると以前のすべてのトークンが無効化されます。
    pub fn new() -> Result<Self, HttpError> {
        let generation = NEXT_GENERATION
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_add(1))
            .map_err(|_| HttpError::Limit)?;
        Ok(Self {
            generation,
            next: 1,
            pending: BTreeMap::new(),
            outbox: VecDeque::new(),
        })
    }
    /// origin-form ターゲットをキューに追加します。ネットワークポリシーはホスト側の責務です。
    pub fn request(&mut self, port: i64, request: &[u8]) -> Result<(), HttpError> {
        let port = u16::try_from(port).map_err(|_| HttpError::Invalid)?;
        if port == 0
            || request.is_empty()
            || request.len() > 4096
            || request[0] != b'/'
            || request.starts_with(b"//")
            || request
                .iter()
                .any(|b| *b == 0 || *b == b'\r' || *b == b'\n')
        {
            return Err(HttpError::Invalid);
        }
        if self.pending.len() >= 128 {
            return Err(HttpError::Limit);
        }
        let id = self.next;
        self.next = self.next.checked_add(1).ok_or(HttpError::Limit)?;
        let request = HttpRequest {
            token: HttpToken {
                generation: self.generation,
                id,
            },
            port,
            request: request.to_vec(),
        };
        self.pending.insert(id, (request, false));
        self.outbox.push_back(id);
        Ok(())
    }
    /// 新規にキューイングされたリクエストのコピーを1度だけ取り出し、レスポンス管理情報を保持します。
    pub fn drain(&mut self) -> Vec<HttpRequest> {
        let mut requests = Vec::new();
        for id in self.outbox.drain(..) {
            if let Some((request, sent)) = self.pending.get_mut(&id) {
                *sent = true;
                requests.push(request.clone());
            }
        }
        requests
    }
    /// レスポンスのサイズ境界とIDが検証された後にのみ、送信済みリクエストを消費します。
    pub fn reply(&mut self, token: HttpToken, bytes: &[u8]) -> Result<HttpRequest, HttpError> {
        if bytes.len() > 1024 * 1024 {
            return Err(HttpError::Invalid);
        }
        if token.generation != self.generation {
            return Err(HttpError::Unknown);
        }
        let (request, dispatched) = self.pending.get(&token.id).ok_or(HttpError::Unknown)?;
        if !dispatched {
            return Err(HttpError::Unknown);
        }
        // コールバックのパスとレスポンスは、所有値の合計バイト予算を共有します。
        if request.request.len() + bytes.len() > 1024 * 1024 {
            return Err(HttpError::Invalid);
        }
        self.consume(token)
    }
    /// トランスポート失敗後に送信済みリクエストを明示的にキャンセルします（偽のLuaレスポンスは生成しません）。
    pub fn cancel(&mut self, token: HttpToken) -> Result<(), HttpError> {
        self.consume(token).map(|_| ())
    }
    fn consume(&mut self, token: HttpToken) -> Result<HttpRequest, HttpError> {
        if token.generation != self.generation
            || !self.pending.get(&token.id).is_some_and(|(_, sent)| *sent)
        {
            return Err(HttpError::Unknown);
        }
        self.pending
            .remove(&token.id)
            .map(|(request, _)| request)
            .ok_or(HttpError::Unknown)
    }
}
