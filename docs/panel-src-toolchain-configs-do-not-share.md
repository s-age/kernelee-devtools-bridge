# panel-src toolchain configs do not share

Context: panel-src/ is bundled by esbuild (scripts/build-panel.mjs) but typechecked by tsc and
edited under VS Code's tsserver — three consumers, three configs, none read the others'.

## What

**panel-src has three independent config consumers; a setting in one is
invisible to the others.** Two real failure modes:

1. **esbuild does not read tsconfig's `jsx`.** `jsx: "react-jsx"` in
   panel-src/tsconfig.json makes *tsc* accept import-less JSX, but esbuild
   defaults to the classic transform and emits `React.createElement` —
   `Uncaught ReferenceError: React is not defined` at runtime, killing the
   whole bundle at module scope (every console error is this one cascade).
   `scripts/build-panel.mjs` must set `jsx: 'automatic'` itself.
2. **VS Code only auto-loads the *nearest* `tsconfig.json`.** A panel config
   living at the repo root (reachable only via `tsc -p`) leaves the editor
   putting panel-src files in an inferred project without
   `relaph-global.d.ts` — phantom "Cannot find name 'RelaphRelationGraph'"
   errors while `npm run typecheck` stays green. The config lives at
   `panel-src/tsconfig.json` (include `**/*`) so editor and CLI share one
   file; typecheck runs `tsc -p panel-src`.

## Why

The server/CLI tree (`src/`, NodeNext, root tsconfig) and the browser panel
tree (`panel-src/`, Bundler resolution, DOM libs, JSX) are deliberately
separate programs. That split is correct — but it means "the compiler
accepts it" proves nothing about the bundle, and "the CLI typecheck is
green" proves nothing about the editor. Verify per consumer.

## Gotchas

- Do NOT "fix" a phantom editor error by adding `declare global` blocks next
  to the usage — it collides with relaph-global.d.ts (`Duplicate identifier
  'Relaph'`) and turns a tooling-resolution problem into a real type error.
- After moving/adding a tsconfig, VS Code needs "TypeScript: Restart TS
  Server" to re-resolve project ownership.
