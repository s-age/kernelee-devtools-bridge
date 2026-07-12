# Sample fixture pair can silently unjoin

Context: the bundled demo is a PAIR — sample-catalog.json (runtime shape) and sample-index.json
(introspect shape) — joined at view time by handlerName.

## What

**A view-time join between two demo fixtures can be dead without anything
looking broken.** The panel colors stages by joining the catalog's
`stage.handlerName` against the index's `handler.functionName -> part kind`
map. If the catalog half's stages are built from inline arrows (`fn.name`
empty → no `handlerName`), the join misses on every stage and the demo
silently falls back to the all-'pipeline' wash — a designed-degradation
state, which is exactly why nobody notices.

The generator's stage handlers are therefore hoisted named functions
(`outOfStockSwitch`/`joinNotifyResults`/`recordSmsSent`) whose names match
the index's entries, so the bundled demo exercises the join the same way
a real catalog does.

## Why

Graceful degradation cuts both ways: the same fallback that keeps a real
panel working with a stale index also hides a fixture that was NEVER capable
of joining. A demo of a join needs both halves generated to agree — and
ideally a data-side check ("at least one stage in the sample catalog carries
a handlerName present in the sample index") rather than eyeballs.

## Gotchas

- The catalog half is generated from real kernelee pipes
  (generate-sample-catalog.mjs), so handler names come from `fn.name` — an
  inline arrow contributes nothing. If a future edit inlines those functions
  again, the join dies again, silently, with all tests green.
- sample-index.json is hand-maintained (no generator); if handler names
  change in the generator, the index half must be edited to match.
