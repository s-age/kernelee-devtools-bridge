# Bridge drops non-conforming catalog/trace messages

Context: the server-side (`src/server.ts`) and panel-side (`panel-src/lib/bridgeMessage.ts`) wire
validators, both built on `isBridgeMessage`'s envelope rule in `src/protocol.ts`.

## What

A `catalog` message whose `doc` doesn't structurally match the v6 top-level envelope — most
notably `{"type":"catalog"}` with no `doc` at all — used to be cached verbatim into
`cachedCatalogText` and replayed to every later-connecting socket. The panel then crashed applying
it (`applyCatalog(undefined)` → a render-time throw with no `ErrorBoundary` to catch it →
unmounted tree → blank page) for every panel that opened until the next legitimate catalog arrived
or the bridge process restarted. The server now validates the envelope at the WS receive boundary
and drops (never caches, persists, or relays) anything that fails it, warning via `console.warn`.
The panel independently validates the same envelope (`parseBridgeMessage`) for frames that reach it
through a path the server's check doesn't cover (an older/miswired bridge, a stray direct WS
client), and a new top-level `ErrorBoundary` (`panel-src/main.tsx`) catches whatever a deep,
per-field malformation still slips past both envelope checks — a crash now shows an error card
instead of a blank page.

## Why `schemaVersion >= 6`, not `=== 6`

The full validation rule (which fields, which type each must be) is declared as the single source
of truth in `protocol.ts`'s doc comments on `WireWiringGraphDocument` / `isBridgeMessage` — this
file is a pointer to that source and a record of the accident the `>= 6` choice avoids, not a
second copy of the rule.

kernelee's own `WiringGraphDocument.schemaVersion` is the literal `6`, and its doc comment declares
the consumer contract: additive bumps (v7, ...) are meant to gate on `schemaVersion >= 6`, not on
exact equality — a v7 catalog is still readable by v6-aware code. If this bridge's receive-side
check required `schemaVersion === 6` instead, the day kernelee ships schemaVersion 7 this bridge
would start dropping *every legitimate catalog* from an updated kernel app as if it were malformed
— the same "session-scoped blank panel" failure this change exists to fix, just triggered by a
correct upgrade instead of a malformed message. `WireWiringGraphDocument` (`protocol.ts`) widens
`schemaVersion` to `number` specifically so the receive-side check can express "at least 6" without
lying to the type system about what a passing value actually is.
