# Environment contract verification — 2026-09-26

This record covers the game/extended environment and minifier correctness changes on the development branch. No tag, registry publication or hosted deployment is implied.

## Corrected behavior

The runtime, editing diagnostics and code generation now share `storm-lua-spec::environment`. Game-mode scripts see `debug.log` but not `print`, `pcall`, `xpcall`, `error` or the other excluded standard globals. Extended helpers are an explicit runtime/compiler selection. Configuring an `onLog` receiver does not change script-visible functions. Host debugging remains independent.

External names without source writes are neither renamed nor inferred to be nil. The former `pcall` → undefined short-name behavior is treated as a compiler/environment defect, not licensed by a warning. Dynamic `_ENV` access, aliasing/rebinding, extended helpers and host overrides use exact-token, line-preserving compaction. This is reported through `conservative-minification` and `search.mode: lexical`, including target-size and serialized candidate paths.

A source with a locally defined same-name function or a nil/type existence probe is not rejected merely because of the spelling. Unknown dynamically selected names are not certified present. Game compatibility and successful SDK execution remain different claims; the scope of game observations is stated in [environments](../specs/environments.md).

## Direct review findings

Reviewing source and output exposed two separate invalid assumptions: renaming a source-unassigned external global, and replacing it with nil solely because no source write was found. Both were corrected. The callback/root inventory also now preserves `async` and externally invoked `httpReply`.

The lexical path originally needed an additional constraint: `pcall` can observe the source line in an error string. The implementation therefore preserves original token line positions, not only token spelling. A test compares errors from the same named chunk and confirms line 5 remains line 5 after compaction.

Host function overrides are installed before source execution and reapplied on reset/reload. An explicit overridden `print` must not be replaced by `enableLogs`; a WASM regression verifies both the call and subsequent reset. Host closure state is still owned by the caller.

## Executed checks

| Check | Result |
| --- | --- |
| Native workspace/all-features | 455 passed, no failed or ignored tests |
| Native environment/reflection/host suite | 10 new actual-runtime tests, included above |
| Downstream full Rust regression | 492 passed; existing 6,890 per-pass cases and all 100 source fixtures retained |
| Independent downstream JS semantic suite | 25 passed, including 640 simulated ticks of the large control program |
| SDK TypeScript/consumer/package unit suite | 27 passed |
| Actual runtime/raster/compiler WASM and Worker endpoint suite | 35 passed; independent Lua backend probe also passed |
| All-target/all-feature Clippy | Passed with warnings denied |
| Isolated installed package | 58 files installed offline; compiler, runtime, raster and consumer examples executed |

Two pre-existing downstream fixtures call `print` or `os.clock`; game compilation now explicitly rejects them. All four whole-program profiles retain these inputs as required error cases: 392 successful builds and eight expected environment rejections. The source fixtures were not removed or edited. Sixty-eight stored expectations changed; before/after hashes and private source details remain with the downstream regression repository.

The larger control output changed from 5,426 to 5,706 charged characters under its existing test settings. This is not advertised as a compression/performance improvement. Correct external binding behavior takes precedence over preserving an invalid shorter output.

## Limits

The result does not prove arbitrary Lua programs or every actual-game version. Extended and reflective sources intentionally receive fewer optimizations. Lexical output can exceed a requested target without falling back to unsafe transforms. The full collected real-world corpus was not readmitted by these tests.

These checks verify the SDK and downstream connection. Playground UI, application persistence and deployment artifacts have their own verification record. Public/internal documentation updates are prepared on local branches; no live site is changed by editing them.
