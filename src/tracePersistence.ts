import { rename, writeFile } from 'node:fs/promises';
import type { TraceEntry, TraceStateValue } from '@s-age/kernelee';
import type { BridgeTraceEntry } from './protocol.js';

/**
 * Ring size default — the SAME concept as the panel's own display/retention cap
 * (`panel-src/lib/trace.ts`'s `TRACE_CAP`): this file-ring cap is surfaced to the panel via
 * `/panel-config.json`'s `traceCap` (see `servePanelConfig` in `server.ts`), so the two stay
 * unified rather than independently hardcoded. Not imported from there directly: `panel-src` is a
 * separate browser-side program bundled independently (see `scripts/build-panel.mjs`), not a
 * module this server-side code can reach across — hence the value travels as a runtime fact over
 * the wire instead of a shared import. `connector.ts`'s `pendingCap` (send-side offline backlog)
 * and kernelee's own in-process `traceCap` are DELIBERATELY INDEPENDENT knobs — different
 * processes/concerns this cap does not unify.
 *
 * Per-entry footprint invariant: raising this cap is O(cap) linear memory only, with the hot
 * trace path unchanged. Each persisted entry is already bounded before it ever reaches the wire —
 * kernelee renders payloads to a `PAYLOAD_CAP=1024` string and summarizes binary/buffer views up
 * front — so a larger `--trace-cap` costs only ~cap × ~1KB of retained memory (linear in `cap`)
 * and adds ZERO per-invoke tracing CPU: that payload summarization is O(1) work done once per
 * entry, independent of how large `cap` is.
 */
export const DEFAULT_TRACE_CAP = 300;

/**
 * How long a burst of `record()` calls is coalesced before the ring is actually written to disk.
 * `arch_monitor` reads this file on demand, not on a tick of its own, so the file only needs to be
 * "recently true" rather than millisecond-fresh — paying one disk write per burst instead of one
 * per trace entry is the entire point of this sink existing as a separate module from the relay.
 */
const DEFAULT_FLUSH_DELAY_MS = 200;

export interface TracePersistenceOptions {
  /** Absolute path of the JSON file `arch_monitor` will be pointed at via `KERNEL_INTROSPECT_TRACE_PATH`. */
  readonly path: string;
  /** Ring capacity — oldest entries are dropped once exceeded. Defaults to {@link DEFAULT_TRACE_CAP}. */
  readonly cap?: number;
  /** Override for tests; production callers should leave the default. */
  readonly flushDelayMs?: number;
}

export interface TracePersistence {
  /**
   * Accept one live trace entry: strips `bufferSnapshot` (not part of kernelee's `TraceEntry`
   * shape — see `protocol.ts`'s `BridgeTraceEntry` doc), assigns the next monotonic `id`, pushes
   * it onto the ring, trims to `cap`, and schedules a throttled write. Never throws — a rejected
   * write is logged and swallowed inside the scheduled flush, not surfaced here.
   */
  record(entry: BridgeTraceEntry): void;
  /**
   * Cancel any pending throttle timer and write the ring's current state out immediately —
   * called once, on server shutdown, so the last burst before a close isn't lost to the trailing
   * timer never getting to fire.
   */
  close(): Promise<void>;
}

/**
 * A small stateful sink turning the live `trace` message stream into the rolling JSON file
 * `arch_monitor` reads. Reimplements kernelee's ring/id policy (`appendTraceEntry` in its
 * `src/trace.ts`) rather than importing it: that function isn't part of kernelee's public
 * `index.ts` barrel (same reasoning `connector.ts`'s `describeCellValue` gives for reimplementing
 * `describeTracePayload` locally) — only the *shape* it produces (`TraceEntry`/`TraceStateValue`)
 * is a public contract this module has to match exactly.
 *
 * Unlike kernelee's own trim (batch-drop at 1.25×`cap`, amortizing the shift cost), this ring
 * trims to exactly `cap` on every accepted entry: `record()` calls here arrive already throttled
 * to at most one disk write per {@link DEFAULT_FLUSH_DELAY_MS}, so there is no hot per-invoke path
 * to amortize against — simplicity wins over an optimization with nothing left to pay for.
 */
export function createTracePersistence(options: TracePersistenceOptions): TracePersistence {
  const { path } = options;
  const cap = options.cap ?? DEFAULT_TRACE_CAP;
  const flushDelayMs = options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS;

  let entries: TraceEntry[] = [];
  let nextId = 0;
  let timer: NodeJS.Timeout | undefined;
  // True whenever the in-memory ring has changed since the last successful (or attempted) write —
  // lets `close()` skip a redundant final flush when the trailing timer already caught up.
  let dirty = false;

  /**
   * Write the ring to a sibling temp file, then `rename` it onto `path` — `rename` on the same
   * filesystem is atomic, so `arch_monitor` reading concurrently either sees the old complete file
   * or the new complete one, never a half-written one. Failures (missing directory, permissions, a
   * full disk) are logged and swallowed: this is a dev tool, and a broken trace file must never
   * take the relay — the thing every other panel client depends on — down with it.
   */
  async function flush(): Promise<void> {
    dirty = false;
    const value: TraceStateValue = { entries };
    const tmpPath = `${path}.tmp-${process.pid}`;
    try {
      await writeFile(tmpPath, JSON.stringify(value), 'utf8');
      await rename(tmpPath, path);
    } catch (error) {
      console.error('[kernelee-devtools-bridge] failed to persist trace file:', error);
    }
  }

  function scheduleFlush(): void {
    if (timer !== undefined) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, flushDelayMs);
    // Don't hold the process open just for this timer — a bridge sitting idle between trace
    // bursts should never be the reason `close()`'s own http/wss teardown looks like it hung.
    timer.unref();
  }

  return {
    record(entry: BridgeTraceEntry): void {
      const { bufferSnapshot: _bufferSnapshot, ...rest } = entry;
      entries.push({ ...rest, id: nextId });
      nextId += 1;
      if (entries.length > cap) {
        entries = entries.slice(entries.length - cap);
      }
      dirty = true;
      scheduleFlush();
    },
    async close(): Promise<void> {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (dirty) {
        await flush();
      }
    },
  };
}
