# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.5.0] - 2026-07-20

### Added
- Activity-diagram mapping: switch/gate diamonds, divert reference nodes, declarative tails.
- Render `fork(symbol)` dynamic fan-out as a schematic ×N branch node + join edge.
- abort/fail pill-chip terminals with desc edge labels (kernel-introspect v14 verbEmissions), threaded through connector/protocol/panel timeline.

### Fixed
- Crash-hardened message handling (malformed percent-encoding, malformed trace/catalog envelopes).
- `watchBuffers` validated at construction time instead of failing at runtime.
- Reconnect now re-sends the last catalog.
- Trace persistence flushes serialized to a single-consumer drain.

### Changed
- Default trace persistence path moves to a project-scoped cache dir.
- `@s-age/kernelee` pinned to `^0.5.0`, `relaph` to `^0.4.0` (registry, no longer file:-linked).

### Removed
- Dead `branchArity` display (kernelee retired `BranchArity`, schema v13).
