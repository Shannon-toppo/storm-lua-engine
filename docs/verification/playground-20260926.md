# Playground implementation verification — 2026-09-26

## Completed scope

`app/` now contains the **Storm Lua Engine: Playground** CLI, Web UI, shared explicit SDK command runner, and static Cloudflare Worker configuration. Storm Min retains its existing CLI/Web. The SDK does not depend on the app, and no compiler, raster formula, game world or physics implementation was copied into the frontend.

The former `examples/addon-lab` application, Three.js/CodeMirror dependencies, world/physics implementation and its current CI entry were removed. Addon lifecycle, host callbacks, event delivery, logging, savedata and invalid-input handling are covered by actual SDK recipes and tests in the new app. Historical release assets and their verification records are not rewritten.

## Functional coverage

Twelve editable recipes exercise Vehicle I/O and property/reset behavior; multi-module/ambient compilation and maps; reflective `_ENV` compaction; game/extended environments; custom host bindings; Addon lifecycle and persistence; debugger stepping and state inspection; Lua-free rasterization; explicit map/HTTP hosts; lossless values and matrix support; intentional errors/limits; and API catalogs.

The recipe runner uses public SDK entry points. Intermediate results can be passed to later operations, so compilation and execution remain separate explicit actions. The CLI supports recipes, exported projects, JSONL session commands and simple file minify/run operations. A real subprocess test checks exit codes, JSON output and input 6 → output 12.

The Web starts no Lua on load/edit/reload. Runtime and compiler have separate host-owned Workers. The compiler uses the SDK's reusable client/server adapter. Cancelling during initialization releases pending promises; an obsolete run cannot overwrite a newly selected or started run. Cancelling a CPU-bound Lua operation terminates its Worker and allows a fresh run.

## Executed verification

| Check | Result |
| --- | --- |
| TypeScript strict check and Vite production build | Passed |
| App Node tests | **14 passed**, including all 12 real-SDK recipes, project roundtrip/error checks, and CLI subprocess checks |
| Chromium, Firefox, WebKit | **12 recipes per browser**, 36 successful recipe runs; SDK results checked in the shared tests |
| Desktop and mobile layout | 1440×1100 and 390×844; no horizontal viewport overflow |
| Persistence | Source, selected recipe, operation JSON and recorded results survive reload; no VM is implicitly resumed |
| Import/export | Valid roundtrip succeeds; invalid input preserves current source; unsupported version/old Addon Lab kind is rejected |
| Cancellation | Both initialization-time cancellation and CPU-bound runtime cancellation recover to a new successful session |
| Independent initialization | Compiler-only and raster-only runs fetch only their respective WASM payloads; initial UI fetches no WASM |
| Deployment packaging | Dedicated route assets built and `wrangler deploy --dry-run` passed; no deployment performed |

The actual-game validity of every API, complete semantics of arbitrary Lua and a full real-world corpus readmission are not proven by these app checks. Expected error recipes explicitly mark the error being exercised rather than treating arbitrary failures as successful execution.

## Personal review and browser evidence

The desktop/mobile screenshots were inspected directly. The source editor, grouped operation navigation, environment selection, actual pixel monitor and result details were checked for readability and clipping. This review led to grouping repeated navigation sections, keeping the latest result header visible, and showing valid UTF-8 log text alongside its original bytes. Binary text remains visibly binary; no replacement characters are silently substituted as the canonical value.

The environment does not provide the browser plugin, so the maintained Playwright runner executes against the built site under its actual subpath and strict CSP. Chromium screenshots provide visual evidence. WebKit's Playwright screenshot preparation injects inline `body{}` CSS, which the strict CSP correctly rejects; screenshots are therefore captured with Chromium, while **all three browsers still execute the functional suite with the same strict CSP**. No product CSP relaxation or ignored application console errors was used.

Browser servers, contexts and workers are closed by the test runner. Screenshots and local evidence are not packaged into the SDK or public site.

## Hosting and publication boundary

`app/wrangler.jsonc` owns Worker `storm-lua-engine-playground` and route `www.makkii.jp/tools/stormworks/storm-lua-engine/*`. The Worker serves assets only. The app has no server-side Lua compile/execute endpoint, arbitrary HTTP proxy, cloud account or game simulation. The existing Storm Min route is not changed.

The source and locally built site are ready for review. **No push, merge, tag, npm publish or production deployment was performed.** A new SDK version and an explicit release/deployment decision are required before the changed environment contract is publicly distributed.
