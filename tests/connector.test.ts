import { afterEach, describe, expect, it } from 'vitest';
import type { Span, WiringGraphDocument } from '@s-age/kernelee';
import { BufferBuilder, defineState } from '@s-age/kernelee';
import { connectDevtoolsBridge, type BridgeConnector } from '../src/connector.js';
import { startBridgeServer, type BridgeServer } from '../src/server.js';
import { collectMessages, waitForMessage, waitForOpen } from './support.js';

const CATALOG: WiringGraphDocument = {
  schemaVersion: 5,
  endpoints: [],
  symbols: [],
  unresolvedDivertTargets: [],
  unlistedBoundSymbols: [],
};

let server: BridgeServer | undefined;
let connector: BridgeConnector | undefined;

afterEach(async () => {
  connector?.close();
  connector = undefined;
  await server?.close();
  server = undefined;
});

describe('connectDevtoolsBridge', () => {
  it('forwards onTrace calls as trace messages shaped like the raw TraceSink args (no id)', async () => {
    server = await startBridgeServer({ port: 0 });
    const observer = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(observer);

    connector = connectDevtoolsBridge({ url: `ws://localhost:${server.port}/ws` });
    const received = waitForMessage(observer);
    const span: Span = { id: 'span-1' };
    connector.onTrace('sym-1', 'next', span, '"payload"', 12345);

    await expect(received).resolves.toEqual({
      type: 'trace',
      entry: { symbolId: 'sym-1', verb: 'next', span, payload: '"payload"', timestamp: 12345 },
    });
  });

  it('sends the wiring-graph catalog on demand', async () => {
    server = await startBridgeServer({ port: 0 });
    const observer = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(observer);

    connector = connectDevtoolsBridge({ url: `ws://localhost:${server.port}/ws` });
    const received = waitForMessage(observer);
    connector.sendCatalog(CATALOG);

    await expect(received).resolves.toEqual({ type: 'catalog', doc: CATALOG });
  });

  it('queues sends made before the socket is open and flushes them once connected', async () => {
    server = await startBridgeServer({ port: 0 });
    connector = connectDevtoolsBridge({ url: `ws://localhost:${server.port}/ws` });
    // Fire immediately — the connector's own socket can't possibly be OPEN yet.
    connector.sendCatalog(CATALOG);

    const observer = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(observer);
    const received = waitForMessage(observer);
    await expect(received).resolves.toEqual({ type: 'catalog', doc: CATALOG });
  });

  it('reconnects with backoff after the server drops, surfaces the failure via onError, and can send again once back up', async () => {
    server = await startBridgeServer({ port: 0 });
    const port = server.port;
    const errors: unknown[] = [];

    connector = connectDevtoolsBridge({
      url: `ws://localhost:${port}/ws`,
      reconnectBaseMs: 20,
      reconnectCapMs: 60,
      onError: (error) => errors.push(error),
    });

    const firstObserver = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(firstObserver);
    const firstReceipt = waitForMessage(firstObserver);
    connector.sendCatalog(CATALOG);
    await expect(firstReceipt).resolves.toEqual({ type: 'catalog', doc: CATALOG });
    firstObserver.close();

    await server.close();
    server = undefined;

    // With nothing listening on `port` yet, the connector's retries genuinely
    // fail (ECONNREFUSED) — this is what must surface via onError, as opposed
    // to the clean server-initiated close that preceded it.
    await expect
      .poll(() => errors.length > 0, { timeout: 2000, interval: 20 })
      .toBe(true);

    server = await startBridgeServer({ port });

    // Sent before the connector has necessarily finished reconnecting — it queues
    // internally and flushes once the backoff-driven retry reopens the socket.
    const secondObserver = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(secondObserver);
    const secondReceipt = waitForMessage(secondObserver);
    connector.sendCatalog(CATALOG);
    await expect(secondReceipt).resolves.toEqual({ type: 'catalog', doc: CATALOG });
  }, 10000);

  it('drops the oldest queued sends instead of growing pending without bound while disconnected', async () => {
    // Claim a port, then free it immediately — the connector below points at
    // it while nothing is listening, so every send stays queued.
    const probe = await startBridgeServer({ port: 0 });
    const port = probe.port;
    await probe.close();

    connector = connectDevtoolsBridge({
      url: `ws://localhost:${port}/ws`,
      reconnectBaseMs: 20,
      reconnectCapMs: 40,
      pendingCap: 5,
      onError: () => {},
    });

    for (let i = 0; i < 20; i++) {
      connector.onTrace(`sym-${i}`, 'next', { id: `span-${i}` }, undefined, i);
    }
    // Let the send queue's microtasks actually run before anything can connect.
    await new Promise((r) => setTimeout(r, 10));

    server = await startBridgeServer({ port });
    const observer = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(observer);
    const messages = await collectMessages(observer, 500);

    const symbolIds = messages
      .filter((m): m is { type: 'trace'; entry: { symbolId: string } } => (m as { type?: unknown }).type === 'trace')
      .map((m) => m.entry.symbolId);

    expect(symbolIds.length).toBeGreaterThan(0);
    expect(symbolIds.length).toBeLessThan(20);
    expect(symbolIds).not.toContain('sym-0');
    expect(symbolIds).toContain('sym-19');
  }, 10000);

  it('never trims an early catalog send even when a trace backlog blows past pendingCap before reconnecting', async () => {
    const probe = await startBridgeServer({ port: 0 });
    const port = probe.port;
    await probe.close();

    connector = connectDevtoolsBridge({
      url: `ws://localhost:${port}/ws`,
      reconnectBaseMs: 20,
      reconnectCapMs: 40,
      pendingCap: 5,
      onError: () => {},
    });

    // Catalog sent first, as a real caller would right after build() — then
    // a trace backlog many times past pendingCap piles up before the socket
    // ever connects.
    connector.sendCatalog(CATALOG);
    for (let i = 0; i < 20; i++) {
      connector.onTrace(`sym-${i}`, 'next', { id: `span-${i}` }, undefined, i);
    }
    await new Promise((r) => setTimeout(r, 10));

    server = await startBridgeServer({ port });
    const observer = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(observer);
    const messages = await collectMessages(observer, 500);

    const catalogMessages = messages.filter((m) => (m as { type?: unknown }).type === 'catalog');
    expect(catalogMessages).toEqual([{ type: 'catalog', doc: CATALOG }]);
  }, 10000);

  it('embeds the current value of every watched cell into the same trace entry, read at the moment onTrace fires', async () => {
    const CounterState = defineState<number>('connector-test/CounterState', 0);
    const builder = new BufferBuilder();
    builder.allocate(CounterState);
    const buffer = builder.build();

    server = await startBridgeServer({ port: 0 });
    const observer = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(observer);

    connector = connectDevtoolsBridge({
      url: `ws://localhost:${server.port}/ws`,
      buffer,
      watchBuffers: [{ label: 'counter', key: CounterState }],
    });

    buffer.mutate(CounterState, () => 42);
    const received = waitForMessage(observer);
    connector.onTrace('sym-1', 'next', { id: 'span-1' }, undefined, 12345);

    await expect(received).resolves.toEqual({
      type: 'trace',
      entry: {
        symbolId: 'sym-1',
        verb: 'next',
        span: { id: 'span-1' },
        timestamp: 12345,
        bufferSnapshot: [{ label: 'counter', value: '42' }],
      },
    });
  });

  it('reflects a later mutation in the next trace entry (per-entry, not a one-time capture)', async () => {
    const CounterState = defineState<number>('connector-test/CounterState-2', 0);
    const builder = new BufferBuilder();
    builder.allocate(CounterState);
    const buffer = builder.build();

    server = await startBridgeServer({ port: 0 });
    const observer = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(observer);

    connector = connectDevtoolsBridge({
      url: `ws://localhost:${server.port}/ws`,
      buffer,
      watchBuffers: [{ label: 'counter', key: CounterState }],
    });

    const firstReceived = waitForMessage(observer);
    connector.onTrace('sym-1', 'next', { id: 'span-1' }, undefined, 1);
    await expect(firstReceived).resolves.toMatchObject({
      entry: { bufferSnapshot: [{ label: 'counter', value: '0' }] },
    });

    buffer.mutate(CounterState, (n) => n + 1);
    const secondReceived = waitForMessage(observer);
    connector.onTrace('sym-2', 'next', { id: 'span-2', parentId: 'span-1' }, undefined, 2);
    await expect(secondReceived).resolves.toMatchObject({
      entry: { bufferSnapshot: [{ label: 'counter', value: '1' }] },
    });
  });

  it('omits bufferSnapshot entirely when watchBuffers is not configured (zero cost when unused)', async () => {
    server = await startBridgeServer({ port: 0 });
    const observer = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(observer);

    connector = connectDevtoolsBridge({ url: `ws://localhost:${server.port}/ws` });
    const received = waitForMessage(observer);
    connector.onTrace('sym-1', 'next', { id: 'span-1' }, undefined, 12345);

    const message = (await received) as { entry: Record<string, unknown> };
    expect('bufferSnapshot' in message.entry).toBe(false);
  });

  it('throws synchronously when watchBuffers is given without a buffer', () => {
    const SomeState = defineState<number>('connector-test/SomeState', 0);
    expect(() =>
      connectDevtoolsBridge({ watchBuffers: [{ label: 'x', key: SomeState }] }),
    ).toThrow(/watchBuffers.*buffer/);
  });

  it('caps a watched value at 1024 characters, same convention as describeTracePayload', async () => {
    const LongState = defineState<string>('connector-test/LongState', '');
    const builder = new BufferBuilder();
    builder.allocate(LongState);
    const buffer = builder.build();
    buffer.mutate(LongState, () => 'x'.repeat(2000));

    server = await startBridgeServer({ port: 0 });
    const observer = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(observer);

    connector = connectDevtoolsBridge({
      url: `ws://localhost:${server.port}/ws`,
      buffer,
      watchBuffers: [{ label: 'long', key: LongState }],
    });

    const received = waitForMessage(observer);
    connector.onTrace('sym-1', 'next', { id: 'span-1' }, undefined, 1);
    const message = (await received) as { entry: { bufferSnapshot: { label: string; value: string }[] } };
    const value = message.entry.bufferSnapshot[0]?.value ?? '';
    // JSON.stringify wraps the string in quotes, so the cap applies to the quoted text, then the ellipsis is appended.
    expect(value.length).toBe(1025);
    expect(value.endsWith('…')).toBe(true);
  });
});
