# Compiler integration (development branch)

This compiler is implemented on the integration branch and is **not part of the published 0.1.0 release**. Build the matching checkout before using these entry points. The runtime's existing Vehicle and Addon APIs remain separate.

## Choose the operation

| Operation | Input | Result | Does not do |
| --- | --- | --- | --- |
| `analyze` | Logical project and diagnostic options | Structured diagnostics | Minify, execute Lua, or read files |
| `build` | Logical project and build options | One Lua source artifact; optional source map and minification statistics | Create a VM or schedule callbacks |
| `minify` | One Lua source and optimization options | Optimized source and diagnostics | Execute the input or initialize the runtime |
| `scanProperties` | One source | Statically named property reads | Read a host property store |
| `passIds` | None | All registered optimizer IDs | Include retired IDs |
| `passMetadata` | None | Display-name mappings for passes that emit named reports | Promise one display record per registered pass |

A project contains `entry`, a map of logical module names to source strings, and optional ambient definitions. The host owns file paths, project persistence, and the mapping from paths to module names. A single-source caller does not need to create a project.

The compiler currently supports **Vehicle only**. `target: "vehicle"` is accepted; `target: "addon"` is rejected, including analysis and non-minifying project builds. Addon runtime support does not imply Addon compiler support. Addon optimization remains planned.

## Rust

Use `storm-lua-analysis` for diagnostics, `storm-lua-build` for the coarse project/single-source API, and `storm-lua-minify` when an embedding needs explicit candidate orchestration. `storm-lua-syntax` owns the shared syntax representation. The low-level syntax and implementation modules are not required by ordinary hosts.

`storm_lua_analysis::analyze(&project, &AnalyzeOptions::default())` returns diagnostics. `storm_lua_build::build(&project, &options)` links and optionally minifies. `storm_lua_build::minify(source, &options)` handles a single source. All are synchronous and filesystem-independent.

The [native compiler example](../../conformance/examples/compiler.rs) constructs a two-module program, compiles it, explicitly loads the generated Lua into `Microcontroller`, sets input, and observes output. Run it with `cargo run -p storm-lua-conformance --example compiler --locked`.

A runtime-only host need not depend on any compiler crate. A compiler-only host does not link the Lua VM. The conformance package combines them only through test/example dependencies.

## TypeScript and WebAssembly

Import `loadCompiler` from `@stormcat-works/storm-lua-engine/compiler`. Importing this subpath does not initialize WASM. `await loadCompiler()` loads the compiler module explicitly; it does not fetch the runtime or raster WASM.

Once loaded, `compiler.minify(source, { target: "vehicle", numericMode: "exact", zeroCostNewlines: false })` is synchronous. For multiple modules, use `compiler.build(project, { minify: false })` for readable linked source or `compiler.build(project, { minify: true, targetSize: 8192 })` for optimization. `compiler.analyze(project)` is separate from both.

Node hosts can pass `wasmBinary: new Uint8Array(await readFile(assetUrl))` to `loadCompiler`. Browser hosts can use the default adjacent asset, an explicit `wasmUrl`, or bytes. `moduleUrl` selects the trusted generated JavaScript adapter. Do not specify both `wasmUrl` and `wasmBinary`.

One module URL identifies one wasm-bindgen instance. Use a host-owned module Worker for an independent memory lifecycle and to keep compilation off the UI or simulation thread. Initialization does not create a Worker or an implicit Worker pool. The [browser compiler check](../../tools/test-compiler-browser.mjs) demonstrates worker-owned initialization and verifies that only the compiler WASM is requested.

## Build assets

Run `node tools/build-compiler.mjs` and `npm --prefix packages/lua-engine run build`. The compiler asset is built independently with wasm-pack for `wasm32-unknown-unknown`; Emscripten and the runtime build are not prerequisites. Cargo output placement follows the environment's build-cache policy. The build tool applies the same path-normalization helper as other distribution builds and checks the generated artifacts.

The existing runtime/raster builder remains `tools/build-wasm.mjs`. Do not link their memories or pass pointers between separate WASM modules. The compiler emits Lua source, which the host passes to the runtime using the normal load API.

Before creating a complete npm package, build all requested assets and update the dependency notices. Compiler-only consumers can use the compiler subpath; the npm tarball can still contain other SDK assets even when those assets are not fetched or initialized.

## Results and semantic contract

Compilation success and meeting `targetSize` are distinct. Inspect diagnostics, generated `code`, reported `size`, and `search.targetMet` rather than treating a size miss as a parser failure. The host decides whether to export, warn, or reject an oversized artifact. Compilation itself never runs user Lua.

`numericMode: "exact"` and `numericMode: "tolerant"` are different transformation contracts. `mode: "safe"` is not a synonym for exact numeric behavior. Generated artifacts report assumptions and selected options. The initial integration retains the existing deterministic size/target search; it does not claim a newly implemented runtime-optimal objective.

A non-minifying project build returns the current line-oriented source map, including source contents. Minifying builds do not claim full original-variable or original-step debugging. The host owns debugger UI and loading/reloading the chosen artifact.

The runtime may update properties at idle boundaries. A source-level local that captured a property at load time must continue to hold that snapshot; optimization must not resample it on later callbacks. The integration includes a regression covering this distinction.

Unregistered and retired pass IDs are configuration errors, whether explicitly enabled or disabled. Four retired speculative optimizations cannot be re-enabled as hidden options. Valid numeric-mode exclusions and per-pass bug workarounds are separate from those removals.

## Validation and current limits

See the [integration verification record](../verification/compiler-integration-20260926.md) for executed tests. Source compilation can consume CPU and memory even though it does not execute Lua; hosts own process/Worker lifetime and resource policy. Low-level callers that construct ASTs must preserve valid node IDs and expression/statement shapes. Invalid compiler-internal IR is not silently converted into empty successful output.

The official CLI/Web relocation, a hosted website, a complete build-of-all-assets release command, and public release/version changes are separate follow-up work. No deployment or publication is implied by this development-branch API.
