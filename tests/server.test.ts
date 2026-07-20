import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TraceStateValue, WiringGraphDocument } from '@s-age/kernelee';
import { startBridgeServer, type BridgeServer } from '../src/server.js';
import type { BridgeMessage } from '../src/protocol.js';
import { waitForMessage, waitForOpen } from './support.js';

/** Sends a raw HTTP GET, bypassing `fetch`'s own client-side URL normalization (which would
 *  collapse `..` segments before the request ever reaches the server) — needed to actually
 *  exercise the path-traversal guard rather than a request that never contained `..` on the wire. */
function rawGet(port: number, rawPath: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: 'localhost', port, path: rawPath, method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on('error', reject);
    req.end();
  });
}

const CATALOG: WiringGraphDocument = {
  schemaVersion: 6,
  endpoints: [
    { key: 'root', title: 'root pipe', kind: 'endpoint', divertedFrom: [], stages: [] },
  ],
  symbols: [],
  guards: [],
  unresolvedDivertTargets: [],
  unlistedBoundSymbols: [],
};

let server: BridgeServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('startBridgeServer', () => {
  it('serves the placeholder page over HTTP', async () => {
    server = await startBridgeServer({ port: 0 });
    const res = await fetch(`http://localhost:${server.port}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('kernelee-devtools-bridge');
  });

  it('broadcasts a trace message to other connected sockets but not back to the sender', async () => {
    server = await startBridgeServer({ port: 0 });
    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    const receiver = new WebSocket(`ws://localhost:${server.port}/ws`);
    await Promise.all([waitForOpen(sender), waitForOpen(receiver)]);

    const received = waitForMessage(receiver);
    let echoedBack = false;
    sender.addEventListener('message', () => {
      echoedBack = true;
    });

    const message: BridgeMessage = {
      type: 'trace',
      entry: { symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: 0 },
    };
    sender.send(JSON.stringify(message));

    await expect(received).resolves.toEqual(message);
    expect(echoedBack).toBe(false);

    sender.close();
    receiver.close();
  });

  it('replays the last-seen catalog to a socket that connects after it was sent', async () => {
    server = await startBridgeServer({ port: 0 });
    const publisher = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(publisher);

    const catalogMessage: BridgeMessage = { type: 'catalog', doc: CATALOG };
    // No one else is connected yet — publish, then a late joiner should still see it.
    const firstObserver = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(firstObserver);
    const firstReceipt = waitForMessage(firstObserver);
    publisher.send(JSON.stringify(catalogMessage));
    await expect(firstReceipt).resolves.toEqual(catalogMessage);

    const lateJoiner = new WebSocket(`ws://localhost:${server.port}/ws`);
    const replay = waitForMessage(lateJoiner);
    await expect(replay).resolves.toEqual(catalogMessage);

    publisher.close();
    firstObserver.close();
    lateJoiner.close();
  });

  it('rejects upgrade requests on a path other than /ws', async () => {
    server = await startBridgeServer({ port: 0 });
    const bad = new WebSocket(`ws://localhost:${server.port}/not-ws`);
    await expect(waitForOpen(bad)).rejects.toBeDefined();
  });
});

describe('static file serving', () => {
  let publicDir: string | undefined;

  afterEach(async () => {
    if (publicDir) await rm(publicDir, { recursive: true, force: true });
    publicDir = undefined;
  });

  it('serves any file under publicDir (not just index.html) with the right content-type', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    await writeFile(join(publicDir, 'panel.js'), 'console.log(1);');
    await writeFile(join(publicDir, 'data.json'), '{"a":1}');
    server = await startBridgeServer({ port: 0, publicDir });

    const js = await fetch(`http://localhost:${server.port}/panel.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await js.text()).toBe('console.log(1);');

    const json = await fetch(`http://localhost:${server.port}/data.json`);
    expect(json.status).toBe(200);
    expect(json.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('returns 404 for a file that does not exist under publicDir', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    server = await startBridgeServer({ port: 0, publicDir });

    const res = await fetch(`http://localhost:${server.port}/nope.txt`);
    expect(res.status).toBe(404);
  });

  it('serves the consumer introspect index at /introspect/index.json, read fresh per request', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    const indexPath = join(publicDir, 'the-index.json');
    await writeFile(indexPath, '{"parts":[]}');
    server = await startBridgeServer({ port: 0, publicDir, introspectIndexPath: indexPath });

    const first = await fetch(`http://localhost:${server.port}/introspect/index.json`);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('application/json; charset=utf-8');
    await expect(first.json()).resolves.toEqual({ parts: [] });

    // Regenerating the file out-of-band (npm run introspect) must show on the next request
    // without a server restart.
    await writeFile(indexPath, '{"parts":[{"kind":"switch"}]}');
    const second = await fetch(`http://localhost:${server.port}/introspect/index.json`);
    await expect(second.json()).resolves.toEqual({ parts: [{ kind: 'switch' }] });
  });

  it('returns 404 from /introspect/index.json when no index path is configured', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    server = await startBridgeServer({ port: 0, publicDir });

    const res = await fetch(`http://localhost:${server.port}/introspect/index.json`);
    expect(res.status).toBe(404);
  });

  it('serves the consumer panel config at /panel-config.json, with {} when unconfigured or unreadable', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    const configPath = join(publicDir, 'panel.config.json');
    await writeFile(configPath, '{"partColors":{"switch":"#ff0000"}}');
    server = await startBridgeServer({ port: 0, publicDir, panelConfigPath: configPath });

    const configured = await fetch(`http://localhost:${server.port}/panel-config.json`);
    expect(configured.status).toBe(200);
    await expect(configured.json()).resolves.toEqual({ partColors: { switch: '#ff0000' } });

    await server.close();
    server = await startBridgeServer({ port: 0, publicDir, panelConfigPath: join(publicDir, 'missing.json') });
    const unreadable = await fetch(`http://localhost:${server.port}/panel-config.json`);
    expect(unreadable.status).toBe(200);
    await expect(unreadable.json()).resolves.toEqual({});
  });

  it('merges repoRoot into /panel-config.json — a runtime fact the committed config must not carry', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    const configPath = join(publicDir, 'panel.config.json');
    // A repoRoot key in the file itself is overwritten: it would be another checkout's path.
    await writeFile(configPath, '{"partColors":{"switch":"#ff0000"},"repoRoot":"/someone/elses/checkout"}');
    server = await startBridgeServer({ port: 0, publicDir, panelConfigPath: configPath, repoRoot: '/repo/root' });

    const merged = await fetch(`http://localhost:${server.port}/panel-config.json`);
    expect(merged.status).toBe(200);
    await expect(merged.json()).resolves.toEqual({
      partColors: { switch: '#ff0000' },
      repoRoot: '/repo/root',
    });

    // No consumer config at all still yields the runtime fact.
    await server.close();
    server = await startBridgeServer({ port: 0, publicDir, repoRoot: '/repo/root' });
    const bare = await fetch(`http://localhost:${server.port}/panel-config.json`);
    await expect(bare.json()).resolves.toEqual({ repoRoot: '/repo/root' });
  });

  it('merges traceCap into /panel-config.json — the panel follows the bridge\'s --trace-cap', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    const configPath = join(publicDir, 'panel.config.json');
    // A traceCap key in the file itself is overwritten: it is a runtime fact, not a repo one.
    await writeFile(configPath, '{"partColors":{"switch":"#ff0000"},"traceCap":50}');
    server = await startBridgeServer({ port: 0, publicDir, panelConfigPath: configPath, traceCap: 1000 });

    const merged = await fetch(`http://localhost:${server.port}/panel-config.json`);
    expect(merged.status).toBe(200);
    await expect(merged.json()).resolves.toEqual({
      partColors: { switch: '#ff0000' },
      traceCap: 1000,
    });

    // traceCap not passed at all, and the committed file itself carries no traceCap — the key
    // must be absent (not defaulted), so the panel falls back to its own built-in default (which
    // matches the bridge's own unset-default).
    await server.close();
    const noCapConfigPath = join(publicDir, 'panel.no-cap.config.json');
    await writeFile(noCapConfigPath, '{"partColors":{"switch":"#ff0000"}}');
    server = await startBridgeServer({ port: 0, publicDir, panelConfigPath: noCapConfigPath });
    const withoutCap = await fetch(`http://localhost:${server.port}/panel-config.json`);
    const body = (await withoutCap.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('traceCap');
  });

  it('rejects a path-traversal attempt with 403 instead of serving a file outside publicDir', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    server = await startBridgeServer({ port: 0, publicDir });

    const res = await rawGet(server.port, '/../../../../etc/passwd');
    expect(res.status).toBe(403);
  });

  it('answers malformed percent-encoding with 400 instead of crashing the process, and keeps serving after', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    server = await startBridgeServer({ port: 0, publicDir });

    const bad = await rawGet(server.port, '/%zz');
    expect(bad.status).toBe(400);

    // Value here isn't "the process is still alive" (vitest always is) — it's that the
    // malformed request didn't leave the server or connection state broken for what follows.
    const ok = await fetch(`http://localhost:${server.port}/index.html`);
    expect(ok.status).toBe(200);
  });

  it('still decodes legitimate percent-encoded filenames after the malformed-encoding guard', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    await writeFile(join(publicDir, 'a b.json'), '{"a":1}');
    server = await startBridgeServer({ port: 0, publicDir });

    const res = await rawGet(server.port, '/a%20b.json');
    expect(res.status).toBe(200);
  });

  it('rejects an encoded path-traversal attempt with 403 (decode runs before the traversal guard)', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    server = await startBridgeServer({ port: 0, publicDir });

    const res = await rawGet(server.port, '/%2e%2e/%2e%2e/etc/passwd');
    expect(res.status).toBe(403);
  });
});

describe('wire-contract validation at the receive boundary', () => {
  let traceDir: string | undefined;

  afterEach(async () => {
    if (traceDir) await rm(traceDir, { recursive: true, force: true });
    traceDir = undefined;
  });

  it('survives a malformed trace message ({"type":"trace"} with no entry) instead of crashing, and keeps persisting the valid trace sent right after', async () => {
    traceDir = await mkdtemp(join(tmpdir(), 'bridge-trace-'));
    const traceOutPath = join(traceDir, 'trace.json');
    server = await startBridgeServer({ port: 0, traceOutPath, traceCap: 300 });

    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    const receiver = new WebSocket(`ws://localhost:${server.port}/ws`);
    await Promise.all([waitForOpen(sender), waitForOpen(receiver)]);

    const relayed = waitForMessage(receiver);
    // This 13-byte message alone used to synchronously crash the 'message' listener — see
    // tracePersistence.ts's `record()` destructuring an `entry` that was actually `undefined`.
    sender.send(JSON.stringify({ type: 'trace' }));

    const validMessage: BridgeMessage = {
      type: 'trace',
      entry: { symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: 1 },
    };
    sender.send(JSON.stringify(validMessage));

    // The valid message arriving at all on a separate socket is the proof the server stayed up
    // through the malformed one instead of taking the process down.
    await expect(relayed).resolves.toEqual(validMessage);

    sender.close();
    receiver.close();
    await server.close();
    server = undefined;

    const persisted = JSON.parse(await readFile(traceOutPath, 'utf8')) as TraceStateValue;
    expect(persisted.entries).toHaveLength(1);
    expect(persisted.entries[0]).toEqual({ id: 0, symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: 1 });
  });

  it('does not relay a malformed trace message — a peer sees the valid trace sent right after arrive first, not the malformed one', async () => {
    server = await startBridgeServer({ port: 0 });
    const sender = new WebSocket(`ws://localhost:${server.port}/ws`);
    const receiver = new WebSocket(`ws://localhost:${server.port}/ws`);
    await Promise.all([waitForOpen(sender), waitForOpen(receiver)]);

    const firstReceived = waitForMessage(receiver);
    sender.send(JSON.stringify({ type: 'trace' })); // entry missing — malformed
    const validMessage: BridgeMessage = {
      type: 'trace',
      entry: { symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: 0 },
    };
    sender.send(JSON.stringify(validMessage));

    // Per-connection message ordering plus the synchronous 'message' handler mean that if the
    // malformed message above had been relayed, it would have arrived at `receiver` before
    // `validMessage` — so `validMessage` arriving first is decisive proof the malformed one was
    // dropped, rather than a "nothing arrived within N ms" assertion (which would be flaky).
    await expect(firstReceived).resolves.toEqual(validMessage);

    sender.close();
    receiver.close();
  });

  it('does not cache a malformed catalog message ({"type":"catalog"} with no doc) — a late joiner sees only the valid catalog sent afterward, not a replay of the malformed one', async () => {
    server = await startBridgeServer({ port: 0 });
    const publisher = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(publisher);

    publisher.send(JSON.stringify({ type: 'catalog' })); // doc missing — malformed, must not be cached

    const lateJoiner = new WebSocket(`ws://localhost:${server.port}/ws`);
    const firstReceived = waitForMessage(lateJoiner);

    const catalogMessage: BridgeMessage = { type: 'catalog', doc: CATALOG };
    publisher.send(JSON.stringify(catalogMessage));

    // If the malformed catalog above had been cached, it would have been replayed to `lateJoiner`
    // on connect, before `catalogMessage` was even sent — so `catalogMessage` being the first (and
    // only) message received is decisive proof the malformed one was never cached.
    await expect(firstReceived).resolves.toEqual(catalogMessage);

    publisher.close();
    lateJoiner.close();
  });

  it('caches and replays a legitimate catalog normally even right after a poisoning attempt — the attempt leaves no lingering effect', async () => {
    server = await startBridgeServer({ port: 0 });
    const publisher = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(publisher);

    publisher.send(JSON.stringify({ type: 'catalog' })); // doc missing — malformed
    const catalogMessage: BridgeMessage = { type: 'catalog', doc: CATALOG };
    publisher.send(JSON.stringify(catalogMessage));

    // Give the server a beat to process both sends before a joiner connects — this test is about
    // replay-on-connect (the `cachedCatalogText` path), not send/receive ordering.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const lateJoiner = new WebSocket(`ws://localhost:${server.port}/ws`);
    const replayed = waitForMessage(lateJoiner);
    await expect(replayed).resolves.toEqual(catalogMessage);

    publisher.close();
    lateJoiner.close();
  });

  it('does not cache a catalog whose schemaVersion is below 6 (pre-guards kernelee) — a late joiner sees only the valid catalog sent afterward', async () => {
    server = await startBridgeServer({ port: 0 });
    const publisher = new WebSocket(`ws://localhost:${server.port}/ws`);
    await waitForOpen(publisher);

    const staleCatalog = { type: 'catalog', doc: { ...CATALOG, schemaVersion: 5 } };
    publisher.send(JSON.stringify(staleCatalog));

    const lateJoiner = new WebSocket(`ws://localhost:${server.port}/ws`);
    const firstReceived = waitForMessage(lateJoiner);

    const catalogMessage: BridgeMessage = { type: 'catalog', doc: CATALOG };
    publisher.send(JSON.stringify(catalogMessage));

    await expect(firstReceived).resolves.toEqual(catalogMessage);

    publisher.close();
    lateJoiner.close();
  });
});
