import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TraceStateValue } from '@s-age/kernelee';
import { startBridgeServer, type BridgeServer } from '../src/server.js';
import type { BridgeMessage } from '../src/protocol.js';
import { waitForOpen } from './support.js';

/** Comfortably past `tracePersistence.ts`'s `DEFAULT_FLUSH_DELAY_MS` (200ms) throttle window. */
const PAST_FLUSH_DELAY_MS = 350;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let server: BridgeServer | undefined;
let traceDir: string | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (traceDir) await rm(traceDir, { recursive: true, force: true });
  traceDir = undefined;
});

async function readTraceFile(path: string): Promise<TraceStateValue> {
  return JSON.parse(await readFile(path, 'utf8')) as TraceStateValue;
}

describe('trace persistence', () => {
  it('persists trace entries to traceOutPath, assigning monotonic ids and stripping bufferSnapshot', async () => {
    traceDir = await mkdtemp(join(tmpdir(), 'bridge-trace-'));
    const traceOutPath = join(traceDir, 'trace.json');
    server = await startBridgeServer({ port: 0, traceOutPath, traceCap: 300 });

    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(sender);

    const messages: BridgeMessage[] = [
      {
        type: 'trace',
        entry: { symbolId: 'sym-a', verb: 'next', span: { id: 'span-1' }, timestamp: 1 },
      },
      {
        type: 'trace',
        entry: {
          symbolId: 'sym-b',
          verb: 'fail',
          span: { id: 'span-2' },
          payload: '"ok"',
          timestamp: 2,
          // A watched-Buffer snapshot travels over the wire but is not part of kernelee's
          // `TraceEntry` shape — the persisted file must not carry it through.
          bufferSnapshot: [{ label: 'Score', value: '3' }],
        },
      },
    ];
    for (const message of messages) {
      sender.send(JSON.stringify(message));
    }
    await wait(PAST_FLUSH_DELAY_MS);

    const persisted = await readTraceFile(traceOutPath);
    expect(persisted).toEqual({
      entries: [
        { id: 0, symbolId: 'sym-a', verb: 'next', span: { id: 'span-1' }, timestamp: 1 },
        { id: 1, symbolId: 'sym-b', verb: 'fail', span: { id: 'span-2' }, payload: '"ok"', timestamp: 2 },
      ],
    });

    sender.close();
  });

  it('caps the persisted ring at traceCap, keeping only the newest entries with correct ids', async () => {
    traceDir = await mkdtemp(join(tmpdir(), 'bridge-trace-'));
    const traceOutPath = join(traceDir, 'trace.json');
    const cap = 5;
    server = await startBridgeServer({ port: 0, traceOutPath, traceCap: cap });

    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(sender);

    const total = 12;
    for (let i = 0; i < total; i += 1) {
      const message: BridgeMessage = {
        type: 'trace',
        entry: { symbolId: `sym-${i}`, verb: 'next', span: { id: `span-${i}` }, timestamp: i },
      };
      sender.send(JSON.stringify(message));
    }
    await wait(PAST_FLUSH_DELAY_MS);

    const persisted = await readTraceFile(traceOutPath);
    expect(persisted.entries).toHaveLength(cap);
    // Ids stay monotonic across the whole session (not reset to 0 on trim) — so a consumer's
    // `since` cursor keeps working across the rollover, not just within the retained window.
    expect(persisted.entries.map((e) => e.id)).toEqual([7, 8, 9, 10, 11]);
    expect(persisted.entries.map((e) => e.symbolId)).toEqual(['sym-7', 'sym-8', 'sym-9', 'sym-10', 'sym-11']);

    sender.close();
  });

  it('does not persist a catalog message', async () => {
    traceDir = await mkdtemp(join(tmpdir(), 'bridge-trace-'));
    const traceOutPath = join(traceDir, 'trace.json');
    server = await startBridgeServer({ port: 0, traceOutPath, traceCap: 300 });

    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(sender);

    const catalogMessage: BridgeMessage = {
      type: 'catalog',
      doc: {
        schemaVersion: 6,
        endpoints: [],
        symbols: [],
        guards: [],
        unresolvedDivertTargets: [],
        unlistedBoundSymbols: [],
      },
    };
    sender.send(JSON.stringify(catalogMessage));
    await wait(PAST_FLUSH_DELAY_MS);

    // A catalog message never calls `record()`, so the ring is never marked dirty and no write —
    // not even an empty one — is ever scheduled: the file simply never comes into existence.
    await expect(readTraceFile(traceOutPath)).rejects.toBeDefined();

    sender.close();
  });

  it('flushes a pending burst on close, and leaves the file untouched when traceOutPath is unset', async () => {
    traceDir = await mkdtemp(join(tmpdir(), 'bridge-trace-'));
    const traceOutPath = join(traceDir, 'trace.json');
    server = await startBridgeServer({ port: 0, traceOutPath, traceCap: 300 });

    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(sender);

    const message: BridgeMessage = {
      type: 'trace',
      entry: { symbolId: 'sym-final', verb: 'next', span: { id: 'span-final' }, timestamp: 99 },
    };
    sender.send(JSON.stringify(message));
    // Deliberately close before the throttle window elapses — close() must flush the pending
    // burst itself rather than relying on the trailing timer, which will never fire once cleared.
    await wait(20);
    sender.close();
    await server.close();
    server = undefined;

    const persisted = await readTraceFile(traceOutPath);
    expect(persisted.entries).toHaveLength(1);
    expect(persisted.entries[0]).toEqual({
      id: 0,
      symbolId: 'sym-final',
      verb: 'next',
      span: { id: 'span-final' },
      timestamp: 99,
    });
  });

  it('creates missing parent directories on flush (default path lands under node_modules/.cache, which does not pre-exist)', async () => {
    traceDir = await mkdtemp(join(tmpdir(), 'bridge-trace-'));
    const traceOutPath = join(traceDir, 'nested', 'does', 'not', 'exist', 'trace.json');
    server = await startBridgeServer({ port: 0, traceOutPath, traceCap: 300 });

    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(sender);

    const message: BridgeMessage = {
      type: 'trace',
      entry: { symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: 0 },
    };
    sender.send(JSON.stringify(message));
    await wait(PAST_FLUSH_DELAY_MS);

    const persisted = await readTraceFile(traceOutPath);
    expect(persisted.entries).toHaveLength(1);

    sender.close();
  });

  it('self-repairs after its parent directory is removed mid-session (mkdir runs on every flush, not just once)', async () => {
    traceDir = await mkdtemp(join(tmpdir(), 'bridge-trace-'));
    const parentDir = join(traceDir, 'cache-dir');
    const traceOutPath = join(parentDir, 'trace.json');
    server = await startBridgeServer({ port: 0, traceOutPath, traceCap: 300 });

    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(sender);

    const first: BridgeMessage = {
      type: 'trace',
      entry: { symbolId: 'sym-1', verb: 'next', span: { id: 'span-1' }, timestamp: 0 },
    };
    sender.send(JSON.stringify(first));
    await wait(PAST_FLUSH_DELAY_MS);
    expect((await readTraceFile(traceOutPath)).entries).toHaveLength(1);

    // Simulate `rm -rf node_modules` happening mid-session.
    await rm(parentDir, { recursive: true, force: true });

    const second: BridgeMessage = {
      type: 'trace',
      entry: { symbolId: 'sym-2', verb: 'next', span: { id: 'span-2' }, timestamp: 1 },
    };
    sender.send(JSON.stringify(second));
    await wait(PAST_FLUSH_DELAY_MS);

    const persisted = await readTraceFile(traceOutPath);
    expect(persisted.entries.map((e) => e.symbolId)).toEqual(['sym-1', 'sym-2']);

    sender.close();
  });

  it('never writes a trace file when traceOutPath is unset (persistence stays opt-in at the server level)', async () => {
    traceDir = await mkdtemp(join(tmpdir(), 'bridge-trace-'));
    const traceOutPath = join(traceDir, 'trace.json');
    server = await startBridgeServer({ port: 0 });

    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(sender);
    const message: BridgeMessage = {
      type: 'trace',
      entry: { symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: 0 },
    };
    sender.send(JSON.stringify(message));
    await wait(PAST_FLUSH_DELAY_MS);

    await expect(readTraceFile(traceOutPath)).rejects.toBeDefined();
    sender.close();
  });
});
