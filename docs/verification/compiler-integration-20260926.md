# Compiler SDK integration verification — 2026-09-26

## Scope and status

The integration branch now implements compiler-only syntax, analysis, minification, project building, and WebAssembly access. It also connects an existing native/Node/browser frontend to those shared implementations. This is an implemented and tested development stage, **not a published release or a hosted-site deployment**. The published 0.1.0 runtime contract is not retroactively described as containing these compiler APIs.

New owners: `storm-lua-syntax`, `storm-lua-analysis`, `storm-lua-minify`, `storm-lua-build`, and the adapter `storm-lua-compiler-wasm`. No `stormmin-*` product crate or catch-all replacement core was introduced in this workspace. The [architecture](../design/architecture.md) and [compiler guide](../guide/compiler.md) describe the actual dependency and host boundaries.

## Source and test ownership

The compiler source was transferred without importing a private repository's Git history or copying its external Lua corpus. The public workspace contains self-contained language/unit tests and synthetic runtime integration cases. The additional private regression fixture generator remains with its downstream test harness, not in any compiler product crate.

The pure AST visitor moved from name resolution into syntax. Dependency-graph validation moved from the linker into analysis. These are semantic ownership changes, not wrappers around a second implementation. Analysis/link parity tests live above both owners rather than introducing a dependency cycle. The runtime remains independent from compilation; compiler-only normal dependencies do not include Lua execution.

## Four retired optimizations

The following implementations, registration entries, call sites, and special search branches were removed before transfer:

- `general-expression-factoring`
- `repeated-expression-factoring`
- `scalar-vector-loop-synthesis`
- `redundant-nil-fallback-elimination`

There are 67 registered pass IDs. A retired ID is not a hidden opt-in: explicit true and false both produce `unknown-optimization-pass`. This holds for ordinary compilation, projects (including non-minifying builds), native parallel driving, raw WASM candidate APIs, and target-size early return. Valid numeric-mode exclusions remain separate from these removals.

## Findings from direct inspection

Two issues beyond relocation were corrected rather than hidden behind passing gates.

**Captured initializer lifetime.** Reading the generated code from the native host example revealed that a top-level property snapshot could move into a returned function. A reproducer with `Gain=2`, followed by `set_properties(Gain=9)`, returned 9 after optimization although the source's captured local must remain 2. The old behavior was reproduced in the real runtime before correction. Single-use local sinking now recognizes delayed function bodies, including functions nested in returned tables, and preserves changing-value snapshots. Literal values and proven immutable builtin references retain the existing safe compression. A second case preserves a first-tick input captured by a persistent closure when the next tick's input changes.

**Public result finalization.** A caller could supply malformed original source alongside an otherwise valid candidate and reach an internal `expect`. Finalization now reports `syntax-error` instead of panicking on that public input. Low-level invalid AST construction remains a documented caller invariant, not a successful empty result.

Scope restoration and short-name emission were also simplified without changing their order or spelling. Remaining compiler-internal assertions are localized and document the earlier structural checks they depend on; production lint policy was not globally weakened. Test-only assertion allowances remain confined to test code.

## Executed checks

| Check | Result |
| --- | --- |
| Engine native workspace, all features | **445 passed, 0 failed, 0 ignored** |
| Downstream private regression workspace | **492 passed, 0 failed, 0 ignored**; includes full preserved golden loops |
| Engine and downstream all-target Clippy | Passed with `-D warnings` |
| Engine Rustdoc | Passed with broken intra-doc links treated as errors |
| Engine TypeScript, existing JS and package-contract tests | **27 passed** |
| Compiler-only Node/WASM tests | **7 passed** |
| Downstream Node tests | **25 passed** |
| Engine Python tools | **19 passed** |
| Chromium, Firefox and WebKit module Workers | Build, analysis, minification, retired-ID and Addon rejection passed; each fetched only the compiler WASM |
| Downstream CLI, Node, browser and static web | Passed through the Engine-owned compiler; 67 live pass IDs synchronized |
| Isolated npm install | **52 packaged files**, offline installation with no repository source dependency; runtime, raster and compiler entry points executed |
| Native compiler versus pre-transfer baseline | **685 byte-identical output/size pairs across 131 inputs** |
| Native compiler versus Engine compiler WASM | **685 byte-identical output/size pairs** |

The 131-input comparison includes 100 existing source fixtures, a larger control program, and 30 fixed real-world representatives. Five profiles per input plus 30 tighter per-input targets produce 685 comparisons. All use actual newline accounting. Source/output hashes and full input details are kept with the downstream evidence; no restricted source text is embedded in this public report. These comparisons measure generated-code equality, not a new compilation-speed claim or a full admission run over every collected script.

The Engine counts include seven compiler/runtime boundary tests. One project test compares readable linked and optimized variants for **32 ticks and two differently sized draw callbacks per tick**, checking all 32 number/bool outputs, output retention, draw-call order, commands and RGBA pixels. It asserts that callbacks actually ran. It uses the real Microcontroller and ScreenRaster, not no-op game API mocks.

The installed-package consumer independently minifies Lua, loads the artifact into the runtime WASM, and observes output 8 for input 4. It also confirms the captured-property regression through compiler WASM plus runtime WASM: output remains 2 after the host changes Gain to 9. The native example prints and checks input 3 × Gain 2 = output 6.

## Reproduction entry points

Build artifacts must use the environment's approved Cargo target directory. None of the following commands publishes or deploys:

- `cargo test --workspace --all-features --locked`
- `cargo clippy --workspace --all-targets --all-features --locked -- -D warnings`
- `cargo run -p storm-lua-conformance --example compiler --locked`
- `node tools/build-compiler.mjs`
- `npm --prefix packages/lua-engine test`
- `npm --prefix packages/lua-engine run test:compiler`
- `node tools/test-compiler-browser.mjs`
- `node tools/test-package.mjs` after building the runtime/raster and compiler assets

The package gate now rejects an exported compiler entry with a missing/invalid compiler WASM or loader. Dependency notices were regenerated, and compiler artifacts use the shared build-path normalization/checking tools.

## Limits and next stages

Compilation supports Vehicle only; Addon compilation is rejected, while the existing Addon runtime remains supported. Normal compilation does not execute Lua, but it can consume CPU/memory, so host process/Worker resource policy still applies.

This stage does not relocate the official CLI/Web application into this repository, deploy a page, publish npm/Rust assets, or merge the integration branch. It does not implement full optimized-source debugging or a new runtime-optimal search objective. Shared API-profile metadata reconciliation, public release/version selection, packaging of the eventual official frontend, and broader real-world admission remain explicit later work. No claim of complete correctness for all possible Lua programs or all actual-game states is made from finite tests.

## Subsequent product decision — 2026-09-26

The executed checks and implementation scope above remain the record of the first SDK integration. The later [Playground decision](../adr/0006-playground-coexistence.md) establishes coexistence: Storm Min keeps its CLI/Web, and Storm Lua Engine: Playground is a separate SDK demonstration app under `app/`. The earlier reference to relocating the official frontend is not the current work plan. Addon Lab, not Storm Min, is the application to consolidate into Playground. See the [current design](../design/playground.md); no Playground execution or deployment is claimed by the test results in this report.
