import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import type { BridgeMessage } from './protocol.js';
import { createTracePersistence, DEFAULT_TRACE_CAP } from './tracePersistence.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** The default port — the panel UI hardcodes this too. */
export const DEFAULT_PORT = 7331;
/** The WS endpoint path, distinct from the static-asset root. */
export const WS_PATH = '/ws';

/** Extensions the panel UI actually ships (script/style/data alongside the HTML page + vendored relaph). */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export interface BridgeServerOptions {
  /** Port to bind on localhost. Defaults to {@link DEFAULT_PORT}; pass `0` for an ephemeral port (tests). */
  readonly port?: number;
  /** Directory the panel UI (index.html, panel.js, vendored relaph, sample catalog) is served from. Defaults to the package's own `public/`. */
  readonly publicDir?: string;
  /**
   * Path to the consumer repo's kernel-introspect `index.json`, served at
   * `/introspect/index.json`. The panel joins its runtime catalog's
   * `StageDescriptor.handlerName` against the index's resolved handler sites
   * to color cards by part kind (switch/emitter/mutator/bridge) — a static
   * scanner fact the runtime deliberately does not carry. Read fresh on every
   * request, so re-running the consumer's introspect and reloading the panel
   * picks up the new index without restarting this server. Unset → 404 (the
   * panel then falls back to the bundled `sample-index.json`).
   */
  readonly introspectIndexPath?: string;
  /**
   * Path to the consumer repo's panel config JSON (e.g. `partColors` /
   * `editors` overrides), served at `/panel-config.json`. Unset or unreadable
   * → `{}`, so the panel always gets valid JSON and its built-in defaults
   * apply.
   */
  readonly panelConfigPath?: string;
  /**
   * Absolute path of the consumer repo that the introspect index's
   * repo-relative `"file:line"` pins resolve against. Injected into the
   * `/panel-config.json` response as `repoRoot` — deliberately NOT read from
   * the config file itself: that file is committed to the consumer repo, and
   * a machine-specific absolute path there would break every other checkout.
   * The panel uses it to build `vscode://file/...`-style open-in-editor URLs;
   * unset → the panel shows sites as plain text (links need an absolute path).
   */
  readonly repoRoot?: string;
  /**
   * Path to write the live `trace` stream to, as a rolling `{ entries: TraceEntry[] }` JSON file
   * matching kernelee's own `TraceStateValue` shape exactly — this is what lets the
   * `arch_monitor` MCP tool (which otherwise only reads a `TraceState` dump file) answer questions
   * about the *current* running session, by pointing `KERNEL_INTROSPECT_TRACE_PATH` at it. Written
   * atomically (temp file + `rename`) and throttled — see `tracePersistence.ts`. Unset → no
   * persistence at all: this server-level option stays opt-in (unlike the CLI, which defaults it
   * on — see `cli.ts`), matching `introspectIndexPath`/`panelConfigPath`'s own unset-means-off
   * contract rather than `port`'s always-on-a-value one.
   */
  readonly traceOutPath?: string;
  /**
   * Ring capacity for the file above — oldest entries roll off once exceeded. Ignored when
   * `traceOutPath` is unset. Defaults to {@link DEFAULT_TRACE_CAP} when `traceOutPath` *is* set,
   * same as `port`'s own always-has-a-value default. Also surfaced verbatim (i.e. only when
   * actually set — see {@link servePanelConfig}) into `/panel-config.json` as `traceCap`, so the
   * panel's own retention/display follows this same number instead of carrying a second, unrelated
   * hardcoded cap — see `panel-src/lib/trace.ts`'s `TRACE_CAP`.
   */
  readonly traceCap?: number;
}

export interface BridgeServer {
  /** The actual bound port (resolves `0` to whatever the OS assigned). */
  readonly port: number;
  close(): Promise<void>;
}

function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return type === 'trace' || type === 'catalog';
}

/**
 * Serves any file under `publicDir` (the panel UI's HTML/JS/CSS, the bundled
 * sample catalog, the vendored relaph build) — not just `index.html`, since
 * the panel is more than one file. `/` and `/index.html` both resolve to
 * the page itself. Guards against path traversal by requiring the resolved
 * path stay within `publicDir` (a `join` alone would let `..` escape it).
 */
async function serveStatic(publicDir: string, url: string, res: import('node:http').ServerResponse): Promise<void> {
  const pathname = decodeURIComponent(url.split('?')[0] ?? '/');
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolvePath(publicDir, relative);
  if (filePath !== publicDir && !filePath.startsWith(publicDir + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    const contentType = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

/**
 * Serves a consumer-supplied JSON file, read fresh on every request (no
 * caching — the file is regenerated/edited out-of-band). Missing path or an
 * unreadable file → 404.
 */
async function serveConsumerJson(
  path: string | undefined,
  res: import('node:http').ServerResponse,
): Promise<void> {
  if (path !== undefined) {
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(body);
      return;
    } catch {
      // fall through to the 404
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

/**
 * Serves the panel config with the server's runtime facts merged in: the
 * consumer's committed JSON (missing/unreadable/invalid → `{}`, same contract
 * as before) plus `repoRoot` and `traceCap` when configured. The merge happens
 * here rather than in the file because both are facts of the running
 * environment, not of the repo — see {@link BridgeServerOptions.repoRoot} and
 * {@link BridgeServerOptions.traceCap}. `traceCap` is merged in only when the
 * caller actually passed one (an omitted `--trace-cap` must NOT force a value
 * here — the panel falls back to its own built-in default, the same
 * `DEFAULT_TRACE_CAP` the file ring itself defaults to, so the two stay equal
 * whether or not the flag was given). A `repoRoot`/`traceCap` key in the file
 * itself is overwritten for the same reason as `repoRoot` always was.
 */
async function servePanelConfig(
  path: string | undefined,
  repoRoot: string | undefined,
  traceCap: number | undefined,
  res: import('node:http').ServerResponse,
): Promise<void> {
  let config: Record<string, unknown> = {};
  if (path !== undefined) {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        config = parsed as Record<string, unknown>;
      }
    } catch {
      // unreadable or invalid JSON — the `{}` base stands
    }
  }
  let merged: Record<string, unknown> = config;
  if (repoRoot !== undefined) {
    merged = { ...merged, repoRoot };
  }
  if (traceCap !== undefined) {
    merged = { ...merged, traceCap };
  }
  const body = JSON.stringify(merged);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

/**
 * The WS server + static placeholder-page host, combined into one Node
 * process (a browser can't host either half). No connection-role field
 * exists in the protocol: every socket is relayed to identically — the
 * "kernel" connection just happens to be the one sending `catalog`/`trace`
 * messages, and `catalog` is additionally cached so a late-joining socket
 * (a panel, or the placeholder page itself) gets replayed the last one seen.
 */
export async function startBridgeServer(options: BridgeServerOptions = {}): Promise<BridgeServer> {
  const publicDir = resolvePath(options.publicDir ?? join(__dirname, '..', 'public'));

  const http = createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const pathname = (req.url ?? '/').split('?')[0];
    if (pathname === '/introspect/index.json') {
      void serveConsumerJson(options.introspectIndexPath, res);
      return;
    }
    if (pathname === '/panel-config.json') {
      void servePanelConfig(options.panelConfigPath, options.repoRoot, options.traceCap, res);
      return;
    }
    void serveStatic(publicDir, req.url ?? '/', res);
  });

  const wss = new WebSocketServer({ noServer: true });
  // Cached as the raw text it arrived as, not the parsed object — replaying
  // it to late joiners and rebroadcasting it need no re-serialization.
  let cachedCatalogText: string | undefined;
  // Only allocated when a target path is configured — see `BridgeServerOptions.traceOutPath`.
  const tracePersistence = options.traceOutPath === undefined
    ? undefined
    : createTracePersistence({ path: options.traceOutPath, cap: options.traceCap ?? DEFAULT_TRACE_CAP });

  http.on('upgrade', (req, socket, head) => {
    if (req.url !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    if (cachedCatalogText !== undefined) {
      ws.send(cachedCatalogText);
    }
    ws.on('message', (data) => {
      const text = data.toString();
      let message: unknown;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      if (!isBridgeMessage(message)) {
        return;
      }
      if (message.type === 'catalog') {
        cachedCatalogText = text;
      }
      if (message.type === 'trace') {
        // Additive to the relay below, never a replacement for it: persistence failing must not
        // stop other panel clients from seeing the entry live.
        tracePersistence?.record(message.entry);
      }
      // Forward the original text verbatim — no need to re-serialize what
      // was only just parsed to inspect `type`.
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === WsClient.OPEN) {
          client.send(text);
        }
      }
    });
  });

  await new Promise<void>((resolve) => {
    http.listen(options.port ?? DEFAULT_PORT, resolve);
  });

  const address = http.address();
  const port = typeof address === 'object' && address !== null ? address.port : (options.port ?? DEFAULT_PORT);

  return {
    port,
    async close(): Promise<void> {
      // Graceful close, not terminate(): an abrupt termination can surface as
      // a spurious client-side 'error' event on a well-behaved reconnecting
      // client (e.g. a kernel app's connector) even though nothing actually
      // went wrong — just this server shutting down.
      for (const client of wss.clients) {
        client.close();
      }
      wss.close();
      await new Promise<void>((resolve, reject) => {
        http.close((error) => (error ? reject(error) : resolve()));
      });
      // Flush after the sockets are down, not before: a straggling `trace` message processed
      // during shutdown should still make it into the final write.
      await tracePersistence?.close();
    },
  };
}
