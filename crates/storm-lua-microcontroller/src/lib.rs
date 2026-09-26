//! CPUラスタライズから独立したマイクロコントローラーLua APIおよびコールバックのライフサイクル。
mod bindings;
#[cfg(feature = "debug")]
mod debugger;
use std::{
    cell::{Ref, RefCell},
    rc::Rc,
};
use storm_lua_spec::{
    draw::{CommandBuffer, DrawCommand, ScreenSink},
    io::CompositeSignal,
    property::PropertyBag,
};
/// VM所有者と共有されるコールバック完了状態。
pub use storm_lua_vm::runner::RunOutcome as CallbackOutcome;
use storm_lua_vm::{
    runner::{ErrorKind, RunOutcome, Vm, VmError},
    ExecutionLimits,
};

/// トップレベルコードが実行される前にプロパティが組み込まれます。
#[derive(Debug, Clone, Default)]
pub struct MicrocontrollerConfig {
    /// 大文字小文字を区別する型付きプロパティ値（UIウィジェットのメタデータは含みません）。
    pub properties: PropertyBag,
    /// Luaの命令数およびヒープメモリの上限。
    pub limits: ExecutionLimits,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Idle,
    Init,
    Tick,
    Draw,
}
struct State {
    input: CompositeSignal,
    output: CompositeSignal,
    properties: PropertyBag,
    phase: Phase,
    size: (u32, u32),
    http: storm_lua_spec::http::HttpQueue,
    commands: CommandBuffer,
}
/// 明示的なtick/draw駆動と再利用可能なコマンドストレージを備えたスレッド拘束型VM。
pub struct Microcontroller {
    vm: Vm,
    state: Rc<RefCell<State>>,
    limits: ExecutionLimits,
    source: Vec<u8>,
    source_name: String,
    dev_logs: bool,
}
impl Microcontroller {
    /// 未開始のコントローラーを作成します。loadを呼び出す前にホストオプションを設定してください。
    pub fn new(config: MicrocontrollerConfig) -> Result<Self, VmError> {
        let mut vm = Vm::new(config.limits)?;
        let state = Rc::new(RefCell::new(State {
            input: CompositeSignal::default(),
            output: CompositeSignal::default(),
            properties: config.properties,
            phase: Phase::Idle,
            size: (0, 0),
            http: storm_lua_spec::http::HttpQueue::new().map_err(http_error)?,
            commands: CommandBuffer::new(65536, 1024 * 1024),
        }));
        vm.configure(|lua, env| bindings::install(lua, env, Rc::clone(&state)))?;
        Ok(Self {
            vm,
            state,
            limits: config.limits,
            source: Vec::new(),
            source_name: String::new(),
            dev_logs: false,
        })
    }
    /// プロパティがトップレベルで利用可能な状態でソースチャンクを実行します。
    pub fn load(&mut self, source: &[u8], name: &str) -> Result<RunOutcome, VmError> {
        self.vm.ensure_idle()?;
        self.state.borrow_mut().phase = Phase::Init;
        let result = self.vm.execute(source, name);
        if result.is_ok() {
            self.source = source.to_vec();
            self.source_name = name.to_owned();
        }
        self.finish(result)
    }
    /// 1 tickを実行します。出力チャンネルは明示的に上書きされるまで値を保持します。
    pub fn tick(&mut self, input: &CompositeSignal) -> Result<RunOutcome, VmError> {
        self.vm.ensure_idle()?;
        {
            let mut state = self.state.borrow_mut();
            state.input = *input;
            state.phase = Phase::Tick;
        }
        let result = self.vm.call("onTick");
        self.finish(result)
    }
    /// 1台のモニターに対してonDrawを実行します。複数回の呼び出しは意図的に同一のLua状態を共有します。
    /// ここではラスタライザを選択しません。呼び出し側がコマンドストリームを消費します。
    pub fn draw(&mut self, width: u32, height: u32) -> Result<RunOutcome, VmError> {
        self.vm.ensure_idle()?;
        if width == 0 || height == 0 || width > 4096 || height > 4096 {
            return Err(VmError::new(
                ErrorKind::InvalidArgument,
                "invalid monitor size",
            ));
        }
        {
            let mut state = self.state.borrow_mut();
            state.phase = Phase::Draw;
            state.size = (width, height);
            state.commands.clear();
        }
        let result = self.vm.call("onDraw");
        self.finish(result)
    }
    fn finish(&mut self, result: Result<RunOutcome, VmError>) -> Result<RunOutcome, VmError> {
        if !matches!(result, Ok(RunOutcome::Suspended)) {
            self.state.borrow_mut().phase = Phase::Idle;
        }
        result
    }
    /// ネイティブ信号の小さなスナップショットをコピーします（JSON変換は不要）。
    pub fn output(&self) -> CompositeSignal {
        self.state.borrow().output
    }
    /// 中断中の一部のプレフィックスを含む、順序付けられた描画コマンドを参照します。
    pub fn commands(&self) -> Ref<'_, [DrawCommand]> {
        Ref::map(self.state.borrow(), |state| state.commands.commands())
    }
    /// ラスタライズ依存を導入することなく、保持されている描画コマンドを再生します。
    pub fn replay(
        &self,
        sink: &mut dyn ScreenSink,
    ) -> Result<(), storm_lua_spec::draw::ScreenError> {
        self.state.borrow().commands.replay(sink)
    }
    /// アイドル境界で実行時プロパティをすべて置換します。既存のLuaローカル変数には影響しません。
    pub fn set_properties(&mut self, properties: PropertyBag) -> Result<(), VmError> {
        self.vm.ensure_idle()?;
        self.state.borrow_mut().properties = properties;
        Ok(())
    }
    /// テキストデコードや数値の型縮小を行わずにホストプロパティデータを検査します。
    pub fn properties(&self) -> Ref<'_, PropertyBag> {
        Ref::map(self.state.borrow(), |state| &state.properties)
    }
    /// デバッガの計測コードとは独立したホスト拡張として print/debug.log を有効化します。
    pub fn enable_dev_logs(&mut self) -> Result<(), VmError> {
        self.vm.ensure_idle()?;
        self.vm.enable_logs()?;
        self.dev_logs = true;
        Ok(())
    }
    /// 上限付きの生ログ行を取り出します。このコールドパスは所有権を転送します。
    pub fn drain_logs(&mut self) -> Vec<Vec<u8>> {
        self.vm
            .drain_log_records()
            .into_iter()
            .map(|record| record.bytes)
            .collect()
    }
    /// print/debug.log の出所を維持しつつ、ホスト配信用の構造化レコードを取り出します。
    pub fn drain_log_records(&mut self) -> Vec<storm_lua_vm::logging::LogRecord> {
        self.vm.drain_log_records()
    }
    /// コールバックの継続が一時停止中（中断中）かどうか。
    pub fn is_suspended(&self) -> bool {
        self.vm.is_suspended()
    }
    /// 実行時エラーの発生後にこのVMをリセットする必要があるかどうか。
    pub fn is_failed(&self) -> bool {
        self.vm.is_failed()
    }
    /// VMを再作成し、現在のプロパティを用いて保存されたソースを再実行します。
    /// 再作成が成功した後にのみこのインスタンスを置換します。デバッガのハンドルは失効します。
    pub fn reset(&mut self) -> Result<(), VmError> {
        let config = MicrocontrollerConfig {
            properties: self.state.borrow().properties.clone(),
            limits: self.limits,
        };
        let mut next = Self::new(config)?;
        if self.dev_logs {
            next.enable_dev_logs()?;
        }
        if !self.source.is_empty() {
            next.load(&self.source, &self.source_name)?;
        }
        *self = next;
        Ok(())
    }
}

fn http_error(error: storm_lua_spec::http::HttpError) -> VmError {
    VmError::new(
        if error == storm_lua_spec::http::HttpError::Limit {
            ErrorKind::Limit
        } else {
            ErrorKind::InvalidArgument
        },
        error.to_string(),
    )
}
impl Microcontroller {
    /// ホスト管理トランスポート向けに新規リクエストを取り出します（ネットワーク通信は送信しません）。
    pub fn drain_http_requests(&mut self) -> Vec<storm_lua_spec::http::HttpRequest> {
        self.state.borrow_mut().http.drain()
    }
    /// アイドル境界で1件のレスポンスを配信します。ビジー状態による拒否時にはトークンを消費しません。
    pub fn http_reply(
        &mut self,
        token: storm_lua_spec::http::HttpToken,
        reply: &[u8],
    ) -> Result<RunOutcome, VmError> {
        self.vm.ensure_idle()?;
        let request = self
            .state
            .borrow_mut()
            .http
            .reply(token, reply)
            .map_err(http_error)?;
        use storm_lua_vm::value::LuaValue;
        let result = self.vm.call_with(
            "httpReply",
            &[
                LuaValue::Integer(i64::from(request.port)),
                LuaValue::Bytes(request.request),
                LuaValue::Bytes(reply.to_vec()),
            ],
        );
        self.finish(result)
    }
    /// 送信済みリクエストをキャンセルします。ホストは実際のトランスポート失敗を別途報告します。
    pub fn cancel_http(&mut self, token: storm_lua_spec::http::HttpToken) -> Result<(), VmError> {
        self.state
            .borrow_mut()
            .http
            .cancel(token)
            .map_err(http_error)
    }
}
