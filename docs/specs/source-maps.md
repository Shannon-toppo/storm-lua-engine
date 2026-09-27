# Non-minified source maps

## v0.2.0 boundary

`build(project, { minify: false })` returns a `code`/`map` pair. The map is Source Map v3 JSON with embedded `sourcesContent`. It describes the non-minified linked artifact only. `minify: true` and standalone `minify` do not return a post-optimization map. Optimized-source provenance is a separate v0.2.5/v0.3.0 task, not a v0.2.0 release gate.

The map is optional only because failed builds have no artifact and optimized builds have no supported mapping. Hosts must check the build result before using either field. Compilation does not create a VM or execute the source.

## Origin and location model

The linker owns `LinkedRange` entries for verbatim source slices. Mapping never invents a source location for generated `do/end`, return normalization, hoisted variables or injected namespace declarations. A generated-only line is encoded with an explicit unmapped segment so a greatest-lower-bound lookup cannot inherit the preceding origin.

A generated line containing original text can have an origin even when a generated prefix shares that line. The unit is a line, not a token or a column. If multiple source statements/expansion boundaries share a line, the retained line origin is best effort; this is not a column-accurate map. The tests cover ordinary LF and CRLF text and original Unicode comments/strings.

`lib.util` maps to `lib/util.lua`. Injected ambient member text uses the same conversion, such as `sim.value` to `sim/value.lua`. Embedded source content remains the exact input text, including its line endings. `names` is empty; local-variable names and expression provenance are not encoded.

The serialized map uses zero-based line/column coordinates. Common JS source-map consumers expose one-based lines and zero-based columns; the SDK runtime's breakpoint and stack lines are one-based. Consumers must respect the decoder's indexing convention rather than incrementing coordinates blindly. Column is zero in this map version.

## Host connection

Keep the exact map with the exact generated code loaded under a host-chosen chunk name, for example `@mapped-program.lua`. The generated chunk name is not a source filename from the map. The map does not carry the runtime handle or automatically install breakpoints.

To bind an original breakpoint, enumerate exact entries matching the original source path and line. Use the corresponding generated lines with the loaded chunk name. A missing exact entry remains unmapped; do not silently select a nearby original line. A mapped blank/comment-only line is not proof that Lua can stop there: executable-line binding remains a separate host/debugger concern.

To display a stopped frame, verify its chunk identity, then map its generated line with column zero. An unmapped generated frame stays generated; do not report it as a previous source line. Runtime error text can be mapped only when its generated source and line are recognized. Preserve unrecognized errors instead of fabricating an origin.

The same mapping is valid after reinitializing the same code. Editing the generated code, changing its bundle or minifying it invalidates that pairing. Imported maps are not authorization to read files; embedded `sourcesContent` supplies the source view. Hosts should not automatically fetch arbitrary paths listed in a map.

## Diagnostics versus debugging

`analyze` diagnoses original modules directly and already returns their module/range. It does not require a linked-output map. Build-time diagnostics produced after linking use the linker's original ranges; an unknown generated location is not assigned a guessed file. Any pre-build source transformation performed by a host has its own position mapping, which the host must compose or preserve separately.

This mapping does not reconstruct optimized-away variables or the original evaluation order. No promise of original-variable or reverse-execution debugging is made.

## Executable evidence

- `examples/consumer/source-map.mjs`: independently installed SDK and a normal trace-mapping consumer; game build, source-qualified breakpoints, caller location, step, reset, runtime error and omitted optimized map.
- `conformance/tests/source_maps.rs`: equivalent actual-Lua Native execution.
- `packages/lua-engine/tests/wasm/source-map.test.mjs`: real WASM, generated-only gaps, EOF bounds, returned functions, CRLF/Unicode, ambient origins and original lint ranges.
- `crates/storm-lua-build/src/source_map.rs`: mapper unit tests, including independent source-length bounds rather than only comparing the mapper to its own range table.

The trace-mapping package is a development/example-consumer dependency, not a runtime dependency of the SDK. The user-facing integration guide is maintained in docs.makkii.jp, not duplicated here.
