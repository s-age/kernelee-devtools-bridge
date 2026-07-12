# Part-kind coloring is an index join

Context: coloring wiring-graph cards by part kind (pipeline/switch/emitter/mutator/bridge)
without adding part vocabulary to kernelee's runtime descriptors.

## What

**Part kind reaches the panel as a JOIN, not as a new runtime field.** The
runtime catalog (`WiringGraphDocument` over WS) carries
`StageDescriptor.handlerName` — the `.name` of the function driving an
anonymous stage — and deliberately no source location. The kernel-introspect
index carries `endpoints[].stages[].handler = {functionName, site}` and
`parts[].{file, kind}`. The panel builds `functionName -> kind` from the
index and resolves each anonymous stage's fill at render time; symbol stages
keep the namespace-hash hue; a join miss falls back to 'pipeline' (the panel
without an index is the pre-color panel, never broken).

The two documents travel their own channels: the catalog comes from the
running app (runtime facts via connector/WS), the index is served by the
bridge server (`--index` -> `/introspect/index.json`, read fresh per request
so re-running the consumer's introspect + reload picks it up). The color
scheme is consumer-owned: `--panel-config` -> `/panel-config.json` ->
`partColors` merged over panel defaults.

## Why

Part kind is a file-suffix fact (`*.switch.ts` etc.) whose birthplace is the
source tree and whose verifier is the scanner — the runtime never holds it,
so putting it in `StageDescriptor` would create a second source of truth
(and need kernelee approval for vocabulary kernelee cannot itself populate).
The join relies on the consumer's named-handler CI floors (every
switch/emitter/mutator handler is a bare named identifier), which is what
makes `handlerName` a reliable key.

## Gotchas

- The `kernelee-devtools-bridge` bin executes `dist/` — rebuild the bridge
  (`npm run build`) or a running instance keeps serving the old panel.
- Default `partColors` were CVD-validated pairwise (worst ΔE 15.5; a teal
  mutator/bridge pairing failed protan at ~3-5 and was replaced with blue +
  a lightness ladder). If a consumer overrides them, that's their check to
  re-run.
