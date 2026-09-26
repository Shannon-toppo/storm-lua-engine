//! デバッガの転送処理。継続の再開（resume）をまたいでマイクロコントローラーのコールバックフェーズを維持します。
use super::Microcontroller;
use storm_lua_vm::{
    debug::{DebugHandle, DebugValue, StackFrame, TableEntry, Variable},
    runner::{RunOutcome, StepMode, VmError},
};
impl Microcontroller {
    /// loadの呼び出し前または再開の合間に、ソース修飾付きの行ブレークポイントを設定します。
    pub fn set_breakpoints(&mut self, points: Vec<(String, i32)>) -> Result<(), VmError> {
        self.vm.set_breakpoints(points)
    }
    /// 初期のコードや描画プレフィックスを再実行することなく、同一のコールバックを継続実行します。
    pub fn resume(&mut self, mode: StepMode) -> Result<RunOutcome, VmError> {
        let result = self.vm.resume(mode);
        self.finish(result)
    }
    /// 中断中のコールバックのソーススタックフレームを検査します。
    pub fn stack(&self) -> Result<Vec<StackFrame>, VmError> {
        self.vm.stack()
    }
    /// 内部VM名を含む生のローカル変数を検査します。
    pub fn locals(&mut self, level: u32) -> Result<Vec<Variable>, VmError> {
        self.vm.locals(level)
    }
    /// 生のupvalueを検査します。
    pub fn upvalues(&mut self, level: u32) -> Result<Vec<Variable>, VmError> {
        self.vm.upvalues(level)
    }
    /// 現在の停止ハンドルを用いて、テーブルの1ページ分（上限付き）を列挙します。
    pub fn expand_table(
        &mut self,
        handle: DebugHandle,
        start: usize,
        limit: usize,
    ) -> Result<Vec<TableEntry>, VmError> {
        self.vm.expand_table(handle, start, limit)
    }
    /// 独自の実行バジェットを用いて、副作用を伴うウォッチ式を明示的に評価します。
    pub fn evaluate_watch(&mut self, level: u32, expression: &str) -> Result<DebugValue, VmError> {
        self.vm.evaluate_watch(level, expression)
    }
}
