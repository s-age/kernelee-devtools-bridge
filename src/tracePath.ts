import { resolve } from 'node:path';

/**
 * Shared derivation rule letting the writer (the CLI's default `--trace-out`) and the reader
 * (kernelee-lifegame's `arch_monitor` launcher) independently arrive at the same path without any
 * communication between them. Deliberately dependency-zero (`node:path` only) — the reader can
 * `import` this from the `"./trace-path"` subpath without ever loading `ws` or the server.
 *
 * Why not `/tmp`: a single fixed shared path meant two bridge CLIs (the common case for anyone
 * with two kernelee-based repos open at once) clobbered each other's entire trace ring on every
 * flush, sticky-bit `/tmp` turned cross-user `rename` into a silently-swallowed EPERM, and a
 * predictable shared tmp name was a symlink-follow hazard (CWE-377/379).
 *
 * Why `node_modules/.cache`: it's the established JS-ecosystem convention (vite/babel/eslint) for
 * per-project scratch data — gitignored everywhere, excluded from file watchers (so this file's
 * throttled writes never trigger a dev-server reload), and its lifecycle matches the data's own
 * (born with a checkout, dies with `rm -rf node_modules`).
 */
export const DEFAULT_TRACE_OUT_RELATIVE = 'node_modules/.cache/kernelee-devtools-bridge/trace.json';

/** Resolve the default trace-out path for a given repo root. */
export function defaultTraceOutPath(repoRoot: string): string {
  return resolve(repoRoot, DEFAULT_TRACE_OUT_RELATIVE);
}
