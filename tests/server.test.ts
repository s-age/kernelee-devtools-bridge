import { request as httpRequest } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WiringGraphDocument } from '@s-age/kernelee';
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
  schemaVersion: 4,
  endpoints: [
    { key: 'root', title: 'root pipe', kind: 'endpoint', divertedFrom: [], stages: [] },
  ],
  symbols: [],
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

  it('rejects a path-traversal attempt with 403 instead of serving a file outside publicDir', async () => {
    publicDir = await mkdtemp(join(tmpdir(), 'bridge-public-'));
    await writeFile(join(publicDir, 'index.html'), '<h1>ok</h1>');
    server = await startBridgeServer({ port: 0, publicDir });

    const res = await rawGet(server.port, '/../../../../etc/passwd');
    expect(res.status).toBe(403);
  });
});
