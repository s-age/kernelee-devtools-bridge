#!/usr/bin/env node
import { resolve as resolvePath } from 'node:path';
import { DEFAULT_PORT, startBridgeServer } from './server.js';
import { DEFAULT_TRACE_CAP } from './tracePersistence.js';

/**
 * Where the live trace ring lands when `--trace-out` isn't given. Defaulted here rather than in
 * `startBridgeServer` itself (contrast `DEFAULT_PORT`, which the server also falls back to): the
 * CLI is the "just works" entry point kernel apps actually run, so *it* is what makes persistence
 * on-by-default, while `BridgeServerOptions.traceOutPath` stays genuinely opt-in for any other
 * embedder of this server (see that field's own doc in `server.ts`).
 */
const DEFAULT_TRACE_OUT_PATH = '/tmp/kernelee-trace.json';

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
const server = await startBridgeServer({
  port: parsePort(argv),
  introspectIndexPath: parsePathFlag(argv, '--index'),
  panelConfigPath: parsePathFlag(argv, '--panel-config'),
  // The CLI is run from the consumer repo (`npm run devtools`), so cwd IS the
  // repo the index's repo-relative "file:line" pins resolve against —
  // `--repo-root` exists for the odd launch that isn't.
  repoRoot: resolvePath(parsePathFlag(argv, '--repo-root') ?? process.cwd()),
  // On by default (see DEFAULT_TRACE_OUT_PATH) — `--trace-out` only overrides where it lands.
  traceOutPath: parsePathFlag(argv, '--trace-out') ?? DEFAULT_TRACE_OUT_PATH,
  traceCap: parseTraceCap(argv),
});
console.log(`kernelee-devtools-bridge listening on http://localhost:${server.port} (ws path: /ws)`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
