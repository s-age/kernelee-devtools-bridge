import type { Buffer, StateKey, TraceSink, WiringGraphDocument } from '@s-age/kernelee';
import type { BridgeMessage } from './protocol.js';

const DEFAULT_URL = 'ws://localhost:7331/ws';
const DEFAULT_RECONNECT_BASE_MS = 250;
const DEFAULT_RECONNECT_CAP_MS = 8000;
/** Mirrors `KernelBuildOptions.traceCap`'s own default (`src/trace.ts`) — same order of magnitude of data. */
const DEFAULT_PENDING_CAP = 300;
/** Mirrors `describeTracePayload`'s own cap (`kernelee`'s `src/trace.ts`) — same rendering convention. */
const BUFFER_VALUE_CAP = 1024;

/** One opt-in "watched" Buffer cell — the explicit-list analogue of Swift's `snapshotStates`. */
export interface WatchedBufferCell {
  /** Display label for the panel's Buffer pane. */
  readonly label: string;
  /**
   * The `StateKey` to read. Typed `StateKey<any>` deliberately: this list is
   * a heterogeneous collection of otherwise-unrelated cells (a `GridState`
   * key alongside a `ScoreState` key, say), and `buffer.getSnapshot(key)`'s
   * result only ever flows into {@link describeCellValue}'s `unknown`
   * parameter — there is no place a narrower type would do any work.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly key: StateKey<any>;
}

/**
 * Mirrors kernelee's `describeTracePayload` convention (`src/trace.ts`) —
 * reimplemented locally rather than imported: this package consumes only
 * `kernelee`'s public `index.ts` exports, and `describeTracePayload` isn't
 * barrel-exported.
 */
function describeCellValue(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > BUFFER_VALUE_CAP ? `${text.slice(0, BUFFER_VALUE_CAP)}…` : text;
}

export interface BridgeConnectorOptions {
  /** WS endpoint to connect to. Defaults to the bridge server's own default port/path. */
  readonly url?: string;
  /** Called on every connect failure/socket error — never swallowed silently. Defaults to `console.error`. */
  readonly onError?: (error: unknown) => void;
  /** Reconnect backoff floor, in ms. Exposed for tests; production callers should leave the default. */
  readonly reconnectBaseMs?: number;
  /** Reconnect backoff ceiling, in ms — retries continue indefinitely at this interval once reached. */
  readonly reconnectCapMs?: number;
  /**
   * Cap on how many not-yet-sent *trace* messages queue up while the socket
   * is closed/reconnecting, before the oldest are dropped. Without this, a
   * long-lived kernel app left running with `tracing: true` against a bridge
   * server that's down/crashed for a long stretch would grow this queue
   * without bound — the same unbounded-growth failure `TraceState`'s own
   * cap×1.25 trim (`src/trace.ts`'s `appendTraceEntry`) already guards
   * against on the buffer side. Defaults to {@link DEFAULT_PENDING_CAP}.
   * Does not apply to `catalog` sends — see {@link SendQueue} usage below:
   * the pending catalog lives in its own single slot, never trimmed, so a
   * long trace backlog can never push out the one message every panel needs
   * to render anything at all.
   */
  readonly pendingCap?: number;
  /**
   * The app's own `Buffer` instance, required only if
   * {@link watchBuffers} is non-empty. Read synchronously (`buffer.getSnapshot`
   * is not a `Promise`) inside the same `onTrace` callback that produces each
   * trace entry, so every entry's `bufferSnapshot` reflects the cell values
   * at exactly the moment that entry was recorded.
   */
  readonly buffer?: Buffer;
  /**
   * Explicit opt-in list of Buffer cells to embed into every outgoing trace
   * entry's `bufferSnapshot` — mirrors Swift's `snapshotStates` (an explicit
   * declared list, not a generic "enumerate every cell" API, which `Buffer`
   * deliberately does not expose). Omit or leave empty for zero added cost:
   * no `bufferSnapshot` field is ever attached to a trace entry when this is
   * empty.
   */
  readonly watchBuffers?: readonly WatchedBufferCell[];
}

export interface BridgeConnector {
  /** Wire this straight into `KernelBuildOptions.onTrace` (with `tracing: true`). */
  readonly onTrace: TraceSink;
  /** Send the static wiring-graph snapshot once, typically right after building the kernel. */
  sendCatalog(doc: WiringGraphDocument): void;
  /** Stop reconnecting and close the current socket, if any. */
  close(): void;
}

/**
 * Serial fire-and-forget send queue — the same pattern as kernelee's own
 * `CommandBus` (`src/command-bus.ts:22-28`), reimplemented here rather than
 * imported: this package only consumes `kernelee`'s public `index.ts`
 * exports, and `CommandBus` isn't one of them. Its job is to keep `onTrace` calls
 * from ever synchronously touching the socket on the kernel's own call
 * stack — queueing returns immediately.
 */
class SendQueue {
  #queue: Promise<void> = Promise.resolve();

  enqueue(work: () => void): void {
    this.#queue = this.#queue.then(work).catch(() => {});
  }
}

/**
 * Connects a kernel app (Node or browser — both have a stable global
 * `WebSocket` client, so this needs no `ws` dependency) to a
 * `kernelee-devtools-bridge` server. Never listens for inbound messages: a
 * "kernel" and a "panel" connection are indistinguishable to the server, and
 * this connector only ever sends.
 */
export function connectDevtoolsBridge(options: BridgeConnectorOptions = {}): BridgeConnector {
  const url = options.url ?? DEFAULT_URL;
  const reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
  const reconnectCapMs = options.reconnectCapMs ?? DEFAULT_RECONNECT_CAP_MS;
  const pendingCap = options.pendingCap ?? DEFAULT_PENDING_CAP;
  const onError = options.onError ?? ((error: unknown) => console.error('[kernelee-devtools-bridge]', error));
  const watchBuffers = options.watchBuffers ?? [];
  const buffer = options.buffer;
  if (watchBuffers.length > 0 && buffer === undefined) {
    throw new Error('connectDevtoolsBridge: watchBuffers was given but buffer was not — both or neither.');
  }

  const queue = new SendQueue();
  // Two separate queues, not one: `catalog` is latest-wins static data (like
  // the server's own single-slot cache), so it gets its own O(1) slot that
  // trimming never touches. `trace` is a genuine stream, so it's the only
  // one subject to `pendingCap`.
  let pendingCatalog: string | undefined;
  const pendingTrace: string[] = [];
  let socket: WebSocket | undefined;
  let backoffMs = reconnectBaseMs;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (pendingCatalog !== undefined) {
      socket.send(pendingCatalog);
      pendingCatalog = undefined;
    }
    while (pendingTrace.length > 0) {
      socket.send(pendingTrace.shift() as string);
    }
  }

  function scheduleReconnect(): void {
    if (closed) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, reconnectCapMs);
      connect();
    }, backoffMs);
  }

  function connect(): void {
    if (closed) {
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (error) {
      onError(error);
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.addEventListener('open', () => {
      backoffMs = reconnectBaseMs;
      flush();
    });
    ws.addEventListener('close', () => {
      socket = undefined;
      scheduleReconnect();
    });
    ws.addEventListener('error', (event) => {
      onError(event);
    });
  }

  connect();

  function send(message: BridgeMessage): void {
    queue.enqueue(() => {
      if (message.type === 'catalog') {
        // Overwrite, don't queue: only the newest catalog is ever
        // meaningful, mirroring the bridge server's own "cache just the
        // last one seen" replay semantics.
        pendingCatalog = JSON.stringify(message);
      } else {
        pendingTrace.push(JSON.stringify(message));
        // Same batch-trim policy as `appendTraceEntry` (`src/trace.ts`): pay
        // an O(n) drop once per 1.25×cap overshoot rather than a smaller
        // cost on every single push.
        if (pendingTrace.length > pendingCap * 1.25) {
          pendingTrace.splice(0, pendingTrace.length - pendingCap);
        }
      }
      flush();
    });
  }

  const onTrace: TraceSink = (symbolId, verb, span, payload, timestamp) => {
    const bufferSnapshot =
      watchBuffers.length > 0 && buffer !== undefined
        ? watchBuffers.map(({ label, key }) => ({ label, value: describeCellValue(buffer.getSnapshot(key)) }))
        : undefined;
    send({ type: 'trace', entry: { symbolId, verb, span, payload, timestamp, bufferSnapshot } });
  };

  return {
    onTrace,
    sendCatalog(doc: WiringGraphDocument): void {
      send({ type: 'catalog', doc });
    },
    close(): void {
      closed = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    },
  };
}
