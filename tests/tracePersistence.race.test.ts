import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeTraceEntry } from '../src/protocol.js';

/**
 * `vi.mock` is file-scoped (applies to every test in THIS file, hoisted above the imports below),
 * which is exactly why these races live in a dedicated file rather than alongside
 * `tracePersistence.test.ts`: that file exercises persistence through `startBridgeServer` against
 * the REAL filesystem, and mocking `node:fs/promises` here must not leak into it.
 */
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));

// Imported AFTER `vi.mock` so both this module and `tracePersistence.ts` (which imports the same
// specifier) resolve to the mock below.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createTracePersistence } from '../src/tracePersistence.js';

const mockWriteFile = vi.mocked(writeFile);
const mockRename = vi.mocked(rename);

/** A promise plus its resolver/rejecter, pulled out so a test can settle it on its own schedule. */
interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function makeDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface WriteFileCall {
  readonly path: string;
  readonly data: string;
  readonly deferred: Deferred<void>;
}

interface RenameCall {
  readonly from: string;
  readonly to: string;
  readonly deferred: Deferred<void>;
}

let writeFileCalls: WriteFileCall[];
let renameCalls: RenameCall[];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls with real timers (this repo does not use fake timers) until `predicate` is true. */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: timed out');
    }
    await wait(2);
  }
}

function entry(symbolId: string, timestamp: number): BridgeTraceEntry {
  return { symbolId, verb: 'next', span: { id: `span-${symbolId}` }, timestamp };
}

beforeEach(() => {
  writeFileCalls = [];
  renameCalls = [];
  mockWriteFile.mockImplementation(((path: string, data: string) => {
    const deferred = makeDeferred<void>();
    writeFileCalls.push({ path, data, deferred });
    return deferred.promise;
  }) as typeof writeFile);
  mockRename.mockImplementation(((from: string, to: string) => {
    const deferred = makeDeferred<void>();
    renameCalls.push({ from, to, deferred });
    return deferred.promise;
  }) as typeof rename);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tracePersistence flush serialization', () => {
  it('never starts a second writeFile before the prior flush finished its rename', async () => {
    const persistence = createTracePersistence({ path: '/fake/trace.json', flushDelayMs: 5 });

    persistence.record(entry('a', 1));
    await waitFor(() => writeFileCalls.length === 1);

    // A second coalesce window elapses while the first flush's writeFile is still unresolved —
    // under the old `scheduleFlush`, this is exactly the shape that raced a second `flush()` call
    // in. Under `drain()`, it must only ever set `pending`, never start a second `writeFile`.
    persistence.record(entry('b', 2));
    await wait(30);
    expect(writeFileCalls).toHaveLength(1);
    expect(renameCalls).toHaveLength(0);

    // Let the first flush's writeFile settle — its rename is now in flight, still no second write.
    writeFileCalls[0]?.deferred.resolve();
    await waitFor(() => renameCalls.length === 1);
    expect(writeFileCalls).toHaveLength(1);

    // Only once the first flush's rename resolves (the write→rename→resolve chain of flush #1 is
    // fully done) may the queued follow-up start its own writeFile.
    renameCalls[0]?.deferred.resolve();
    await waitFor(() => writeFileCalls.length === 2);
    expect(renameCalls).toHaveLength(1);

    writeFileCalls[1]?.deferred.resolve();
    await waitFor(() => renameCalls.length === 2);
    renameCalls[1]?.deferred.resolve();
    await persistence.close();
  });

  it('coalesces every record that arrives during an in-flight flush into exactly one follow-up flush', async () => {
    const persistence = createTracePersistence({ path: '/fake/trace.json', flushDelayMs: 5 });

    persistence.record(entry('a', 1));
    await waitFor(() => writeFileCalls.length === 1);

    // Multiple records land across several coalesce windows while flush #1 is still in flight.
    // Each window's timer fires `drain()`, which — since a flush is already running — only ever
    // sets `pending = true`; it must not fan out into one follow-up flush per window.
    persistence.record(entry('b', 2));
    await wait(15);
    persistence.record(entry('c', 3));
    await wait(15);
    persistence.record(entry('d', 4));
    await wait(15);

    // Still exactly one flush in flight: the coalescing windows above did not spawn extra writes.
    expect(writeFileCalls).toHaveLength(1);

    // Resolve flush #1 fully; the queued follow-up (pending === true) should now run — exactly once.
    writeFileCalls[0]?.deferred.resolve();
    await waitFor(() => renameCalls.length === 1);
    renameCalls[0]?.deferred.resolve();

    await waitFor(() => writeFileCalls.length === 2);
    // Give any (incorrect) extra follow-up a chance to appear before asserting there isn't one.
    await wait(30);
    expect(writeFileCalls).toHaveLength(2);

    const secondWrite = writeFileCalls[1];
    expect(secondWrite).toBeDefined();
    const persisted = JSON.parse(secondWrite?.data ?? '{}') as { entries: { symbolId: string }[] };
    // The single follow-up flush must carry the LATEST ring — every record that arrived while
    // flush #1 was in flight, not just the first or last of them.
    expect(persisted.entries.map((e) => e.symbolId)).toEqual(['a', 'b', 'c', 'd']);

    // Let flush #2 finish its own write→rename chain so `close()` below has nothing left to await.
    writeFileCalls[1]?.deferred.resolve();
    await waitFor(() => renameCalls.length === 2);
    renameCalls[1]?.deferred.resolve();
    await persistence.close();
  });

  it('close() picks up a follow-up flush queued while a flush was in flight, and waits for it', async () => {
    const persistence = createTracePersistence({ path: '/fake/trace.json', flushDelayMs: 5 });

    persistence.record(entry('a', 1));
    await waitFor(() => writeFileCalls.length === 1);

    // Queue a follow-up (`pending = true`) while flush #1 is in flight, same as the previous test.
    persistence.record(entry('b', 2));
    await wait(15);

    let closeResolved = false;
    const closePromise = persistence.close().then(() => {
      closeResolved = true;
    });

    // close() must not resolve while flush #1 (and the follow-up it owes) are still outstanding.
    await wait(20);
    expect(closeResolved).toBe(false);

    // Settle flush #1 — this triggers the follow-up flush #2 (record 'b' is still owed).
    writeFileCalls[0]?.deferred.resolve();
    await waitFor(() => renameCalls.length === 1);
    renameCalls[0]?.deferred.resolve();

    // close() must still be waiting: it set `pending = false` before awaiting, so flush #1's
    // `finally` spawned no follow-up — flush #2 now in flight is close()'s OWN final `flush()`,
    // taken over because the ring was still dirty (record 'b') when flush #1 settled.
    await waitFor(() => writeFileCalls.length === 2);
    expect(closeResolved).toBe(false);

    const secondWrite = writeFileCalls[1];
    const persisted = JSON.parse(secondWrite?.data ?? '{}') as { entries: { symbolId: string }[] };
    expect(persisted.entries.map((e) => e.symbolId)).toEqual(['a', 'b']);

    writeFileCalls[1]?.deferred.resolve();
    await waitFor(() => renameCalls.length === 2);
    renameCalls[1]?.deferred.resolve();

    await closePromise;
    expect(closeResolved).toBe(true);
    // close() resolved without needing a third flush: nothing was recorded after flush #2 started.
    expect(writeFileCalls).toHaveLength(2);
  });

  it('never lets a rename race the pid-fixed tmp path, even under a record burst (the old ENOENT condition)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Auto-settle every write/rename after a short simulated-I/O delay, but track how many are
    // simultaneously outstanding. Under the old `scheduleFlush`, a burst like the one below could
    // get two `flush()` calls racing the SAME `${path}.tmp-${pid}` tmp path — the second
    // `writeFile` clobbering the first's tmp file before the first's `rename` had moved it away,
    // then the first's `rename` succeeding and the second's `rename` finding nothing left to move
    // (`ENOENT`). If `drain()` truly serializes, that overlap can't happen at all.
    let outstandingWrites = 0;
    let maxConcurrentWrites = 0;
    let outstandingRenames = 0;
    let maxConcurrentRenames = 0;
    mockWriteFile.mockImplementation((async (_path: string, _data: string) => {
      outstandingWrites += 1;
      maxConcurrentWrites = Math.max(maxConcurrentWrites, outstandingWrites);
      await wait(3);
      outstandingWrites -= 1;
    }) as typeof writeFile);
    mockRename.mockImplementation((async (_from: string, _to: string) => {
      outstandingRenames += 1;
      maxConcurrentRenames = Math.max(maxConcurrentRenames, outstandingRenames);
      await wait(3);
      outstandingRenames -= 1;
    }) as typeof rename);

    const persistence = createTracePersistence({ path: '/fake/trace.json', flushDelayMs: 3 });

    // A tight burst of records — the same shape (many `record()` calls in a short span, with
    // coalesce windows elapsing mid-burst) that used to pile up multiple timers/flushes racing
    // the same pid-fixed tmp path.
    for (let i = 0; i < 20; i += 1) {
      persistence.record(entry(`burst-${i}`, i));
      if (i % 4 === 0) await wait(4);
    }

    await persistence.close();

    expect(errorSpy).not.toHaveBeenCalled();
    // The structural guarantee `drain()` provides: at most one write/rename is ever outstanding
    // at a time, so two flushes can never race the same pid-fixed tmp path.
    expect(maxConcurrentWrites).toBeLessThanOrEqual(1);
    expect(maxConcurrentRenames).toBeLessThanOrEqual(1);
  });
});
