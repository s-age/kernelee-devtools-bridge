# Wire links: positional join on the node-id grammar

Context: the kernel-introspect index carries `StageEntry.wireSite` (and
`symbols[].declaration/implementation`); the panel must attach them to runtime-catalog stages
that have NO handlerName to join on (inline closures, symbol stages).

## What

**The wire-link join is positional, and its key IS the canvas node id.**
`buildIndexJoin` walks the index's `endpoints[].stages` minting the exact id
grammar `buildChain` mints for relaph nodes (`key::i`, fork branches
`::bK::j`), so a clicked node's `node.id` looks up `wireSiteByPath` with no
translation layer. `selectedStagePath` is stored at click time alongside
`selectedStage` and cleared everywhere `selectedStage` is.

Row precedence in the stage inspector: `declaration`/`implementation`
(symbols[] join, symbol stages) → `handler` (handlerName join, named
anonymous stages) → `wire` (positional, every stage once the consumer's
scanner fills wireSite). Each row degrades away independently on a join miss.

## Why

- Inline closures and symbol stages carry no `handlerName`, so the name join
  can't address them — but both documents describe the SAME catalog, so
  position is identity. Reusing the node-id grammar makes the correlation
  correct by construction instead of maintained in parallel.
- A stale index (shapes drifted since last introspect run) makes a path miss,
  which silently drops that row — the same "degrade, never break" contract
  the part-kind coloring join already established. No error state to design.
- Per-row degradation means a consumer on an older scanner (no wireSite, or
  no symbol sites) just sees fewer rows, not a broken inspector.
