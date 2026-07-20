#!/usr/bin/env node
import { resolve as resolvePath } from 'node:path';
import { DEFAULT_PORT, startBridgeServer } from './server.js';
import { DEFAULT_TRACE_CAP } from './tracePersistence.js';
import { defaultTraceOutPath } from './tracePath.js';

/**
 * Whether the live trace ring is persisted by default when `--trace-out` isn't given is a
 * decision made HERE, not in `startBridgeServer` (contrast `DEFAULT_PORT`, which the server also
 * falls back to): the CLI is the "just works" entry point kernel apps actually run, so *it* is
 * what makes persistence on-by-default, while `BridgeServerOptions.traceOutPath` stays genuinely
 * opt-in for any other embedder of this server (see that field's own doc in `server.ts`).
 *
 * WHERE it lands is a separate question, answered by the shared derivation rule in `tracePath.ts`:
 * `defaultTraceOutPath(repoRoot)`. That module is intentionally its own file (not folded in here
 * or into `tracePersistence.ts`) so `arch_monitor`'s reader-side launcher (kernelee-lifegame's
 * `scripts/introspect-mcp-server.mjs`) can `import` the SAME rule from the dependency-zero
 * `"./trace-path"` subpath and land on the identical path without either side hardcoding a string
 * the other has to keep in sync by hand.
 */

function parsePort(argv: readonly string[]): number {
  const flagIndex = argv.indexOf('--port');
  if (flagIndex === -1) {
    return DEFAULT_PORT;
  }
  const raw = argv[flagIndex + 1];
  const port = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port must be an integer in [0, 65535], got: ${raw}`);
  }
  return port;
}

/** Optional `--flag <path>` argument; the path is resolved by the server against cwd. */
function parsePathFlag(argv: readonly string[], flag: string): string | undefined {
  const flagIndex = argv.indexOf(flag);
  if (flagIndex === -1) {
    return undefined;
  }
  const raw = argv[flagIndex + 1];
  if (raw === undefined || raw.startsWith('--')) {
    throw new Error(`${flag} requires a path argument`);
  }
  return raw;
}

/** `--trace-cap <n>` — positive-integer ring size for the persisted trace file. */
function parseTraceCap(argv: readonly string[]): number {
  const flagIndex = argv.indexOf('--trace-cap');
  if (flagIndex === -1) {
    return DEFAULT_TRACE_CAP;
  }
  const raw = argv[flagIndex + 1];
  const cap = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(cap) || cap <= 0) {
    throw new Error(`--trace-cap must be a positive integer, got: ${raw}`);
  }
  return cap;
}

const argv = process.argv.slice(2);
// The CLI is run from the consumer repo (`npm run devtools`), so cwd IS the repo the index's
// repo-relative "file:line" pins resolve against — `--repo-root` exists for the odd launch that
// isn't. Hoisted (rather than inlined below) because it also seeds the default trace-out path:
// moving `--repo-root` moves the trace along with it, which is semantically right (a trace is a
// fact about *that project's* session).
const repoRoot = resolvePath(parsePathFlag(argv, '--repo-root') ?? process.cwd());
const server = await startBridgeServer({
  port: parsePort(argv),
  introspectIndexPath: parsePathFlag(argv, '--index'),
  panelConfigPath: parsePathFlag(argv, '--panel-config'),
  repoRoot,
  // On by default (see the doc comment above) — `--trace-out` only overrides where it lands.
  traceOutPath: parsePathFlag(argv, '--trace-out') ?? defaultTraceOutPath(repoRoot),
  traceCap: parseTraceCap(argv),
});
console.log(`kernelee-devtools-bridge listening on http://localhost:${server.port} (ws path: /ws)`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
