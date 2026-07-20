# Server validates the wire contract

Context: `isBridgeMessage`/`isBridgeTraceEntry` (protocol.ts) run at the WS receive boundary in
`server.ts`, before a message is cached, persisted, or relayed.

## What

**The server is a validator of the wire contract, not a rescuer of malformed
values further downstream.** A message that doesn't structurally match
`BridgeMessage` — most notably `{"type":"trace"}` with no `entry` at all, a
13-byte message any stray localhost WS client can send — is dropped with a
`console.warn` right after `JSON.parse`. Dropped means all three: never
cached (a malformed `catalog` never overwrites `cachedCatalogText`), never
persisted (`tracePersistence.record()` is never called with it), and never
relayed to other connected sockets. Before this validator existed, a
malformed `trace` message reached `tracePersistence.record()`, whose
destructuring of `entry` assumed the field was actually present — a
synchronous `TypeError` inside a `ws` `'message'` listener, which Node
surfaces as an uncaught exception that kills the whole process. Because the
CLI (`cli.ts`) defaults `traceOutPath` on, this was a default-configuration
crash, not an edge case.

The panel now validates independently too: `panel-src/lib/bridgeMessage.ts`'s `parseBridgeMessage`
runs the same envelope check as `isBridgeMessage` above (deliberately duplicated, not imported —
panel-src is a separately bundled client tree) before `App.tsx`'s WS `message` listener touches the
result. This is not redundant with the server's check — it covers frames that reach the panel
through a path the server's validator doesn't sit in front of (an older/miswired bridge, a stray
direct WS client). See `docs/bridge-drops-nonconforming-messages.md`.

## Why

The owner's principle is "facts are declared where they're born" applied to
receivers: the wire contract (`BridgeMessage`/`BridgeTraceEntry`) is declared
in `protocol.ts`, so its validator lives there too, and the party that reads
untrusted bytes off the wire (`server.ts`) is the one that enforces it — not
a null-guard buried inside `tracePersistence.record()`. A null-guard there
would have kept the process alive but let malformed messages keep being
cached and relayed; validating at the boundary stops them before any of
that happens.

## Gotchas

- **The validators are deliberately broader than the types they guard.**
  `isBridgeTraceEntry` accepts any `string` for `verb`, not just kernelee's
  `TraceVerbKind` literals — checking against that literal set would couple
  this bridge to kernelee's verb vocabulary and silently drop legitimate
  trace entries the moment kernelee adds a new verb kind. `isBridgeMessage`'s
  `catalog` branch checks only the v6 top-level envelope — `schemaVersion` an
  integer `>= 6` plus the 5 required array fields (`endpoints`, `symbols`,
  `guards`, `unresolvedDivertTargets`, `unlistedBoundSymbols`) — not a deep
  structural match against every nested entry in `WiringGraphDocument`. A
  value passing either guard is **wire-safe** (won't crash the process or
  poison the catalog cache) — not a proof that the value is fully valid
  under kernelee's own rules. TypeScript's type predicates assert the
  narrower declared types
  regardless, so this gap is invisible to the compiler; the doc comments on
  both functions plus a fixation test in `tests/protocol.test.ts` (an
  unrecognized `verb` string must still be *accepted*) are the only guardrails.
  A passing `verb` is persisted verbatim into the `traceOutPath` file
  (`TraceStateValue`, read by the `arch_monitor` MCP tool).
- **Deepening `catalog` validation has one entry point.** A future change
  that wants to structurally validate `doc` against `WiringGraphDocument`
  belongs inside `isBridgeMessage`'s existing `catalog` branch in
  `protocol.ts`, not as a second, separate check bolted onto `server.ts` —
  otherwise the wire-contract validation layer becomes two places that can
  drift apart.
- **`isBridgeMessage`/`isBridgeTraceEntry` are intentionally not re-exported
  from `index.ts`'s barrel.** No consumer outside this package validates a
  `BridgeMessage` today; widening the public API surface for a validator
  nobody outside `server.ts` calls would be speculative. If a connector or
  third-party client later wants to validate before sending, that's an
  independent proposal, not something this change should bundle in.
