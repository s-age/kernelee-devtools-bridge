import type { Span, TraceVerbKind, WiringGraphDocument } from '@s-age/kernelee';

/**
 * One live `onTrace` callback's arguments, forwarded verbatim over the wire.
 * Deliberately shaped like `kernelee`'s raw `TraceSink` signature (no `id` —
 * that field only exists once an entry lands in `TraceState` via
 * `appendTraceEntry`, which this bridge never calls), not `TraceEntry`.
 */
export interface BridgeTraceEntry {
  readonly symbolId: string;
  readonly verb: TraceVerbKind;
  readonly span: Span;
  readonly payload?: string;
  readonly timestamp: number;
  /**
   * The current value of every opt-in "watched"
   * Buffer cell, read synchronously inside the same `onTrace` callback that
   * produced this entry — so "the state as of this span" needs no separate
   * settle-detection or correlation-by-id (see `connector.ts`'s
   * `watchBuffers`). Absent entirely when no cells are being watched, not
   * just an empty array — zero cost when the feature isn't configured.
   */
  readonly bufferSnapshot?: readonly { readonly label: string; readonly value: string }[];
  /**
   * The resolved verb's own `desc` — mirrors kernelee's `TraceSink`'s sixth argument /
   * `TraceEntry.desc` (`abort(value, desc)` / `fail(error, desc)`), forwarded verbatim by
   * `connector.ts`'s `onTrace`. Additive and optional: absent whenever the resolved verb had no
   * `desc` — never present with an `undefined` value (see `connector.ts`'s conditional spread).
   */
  readonly desc?: string;
}

/**
 * trace = live per-invoke forwarding.
 * catalog = the static wiring-graph snapshot. The connector keeps the latest
 * catalog and re-sends it on every (re)connect; the server replays its cache
 * to late joiners and relays live sends verbatim.
 *
 * BYTE-IDENTITY CONTRACT: an unchanged catalog always arrives as the exact
 * same byte sequence on every path — resend (connector reuses its one
 * stringified text), replay (server caches the raw arrived text), and relay
 * (server forwards the original text without re-serializing). Receivers may
 * therefore dedupe catalogs by plain string equality; re-serializing a
 * catalog anywhere in the chain is a breaking change to this contract.
 */
export type BridgeMessage =
  | { readonly type: 'trace'; readonly entry: BridgeTraceEntry }
  | { readonly type: 'catalog'; readonly doc: WiringGraphDocument };

/**
 * Receive-side view of a catalog doc. Same v6 top-level envelope as `WiringGraphDocument`, but
 * `schemaVersion` deliberately widened to `number`: the consumer contract kernelee declares
 * (`wiring-graph.ts` — "gate on `schemaVersion >= 6`") is that additive bumps (v7, ...) MUST pass
 * through an old bridge. The send side keeps kernelee's literal (`BridgeMessage` above) — the
 * sender declares the exact fact it was built against; the receiver accepts the range it is
 * contracted to. `Omit` derived so every field other than `schemaVersion` auto-follows kernelee's
 * own definition rather than living as a second, driftable copy.
 */
export type WireWiringGraphDocument =
  Omit<WiringGraphDocument, 'schemaVersion'> & { readonly schemaVersion: number };

/**
 * Receive-side envelope `isBridgeMessage` narrows to. `BridgeMessage` is assignable to this (a
 * literal `6` extends `number`), never the reverse — a value accepted here is not automatically a
 * valid `BridgeMessage` under kernelee's stricter, literal-`schemaVersion` type.
 */
export type WireBridgeMessage =
  | { readonly type: 'trace'; readonly entry: BridgeTraceEntry }
  | { readonly type: 'catalog'; readonly doc: WireWiringGraphDocument };

/**
 * Runtime guard for {@link BridgeTraceEntry}, checked by `server.ts` at the WS receive boundary
 * before the entry ever reaches `tracePersistence.record()` — the owner's contract-declared-at-
 * birth principle: the wire contract's home (`protocol.ts`) also holds its validator, and the
 * receiver is a validator of that contract, not a rescuer of malformed values further downstream.
 *
 * Deliberately **broader** than the declared type: `verb` is accepted as any `string`, not checked
 * against kernelee's `TraceVerbKind` literal set — doing so would couple this bridge to kernelee's
 * verb vocabulary and silently drop legitimate entries the moment kernelee adds a new verb kind.
 * `payload` and `bufferSnapshot` are both optional fields, and neither is inspected when present —
 * checking them would only narrow the accept set without closing any crash path this guard exists
 * to close (the crash reproducer this validator was built for is a missing/malformed required
 * field, not a malformed optional one). `span.parentId` is likewise not checked for the same
 * reason. `timestamp` is checked with `typeof value === 'number'` only — `Number.isFinite` is not
 * applied, because the value being validated is always the output of a preceding `JSON.parse`, and
 * JSON's grammar has no `NaN`/`Infinity` literal, so that stricter check would be dead code on this
 * path.
 *
 * A value passing this guard is **wire-safe** (it will not crash the process or poison the catalog
 * cache) — it is not a claim that the value is a fully valid `BridgeTraceEntry` under kernelee's own
 * rules. A passing `verb` is persisted verbatim into the `traceOutPath` file (`TraceStateValue`,
 * read by the `arch_monitor` MCP tool) as-is. See `docs/server-validates-the-wire-contract.md`.
 */
export function isBridgeTraceEntry(value: unknown): value is BridgeTraceEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.symbolId !== 'string' || typeof entry.verb !== 'string') {
    return false;
  }
  if (typeof entry.span !== 'object' || entry.span === null) {
    return false;
  }
  const span = entry.span as Record<string, unknown>;
  if (typeof span.id !== 'string') {
    return false;
  }
  if (typeof entry.timestamp !== 'number') {
    return false;
  }
  if (entry.desc !== undefined && typeof entry.desc !== 'string') {
    return false;
  }
  return true;
}

/**
 * Runtime guard for {@link WireBridgeMessage}, the receive-boundary check `server.ts` runs on
 * every parsed WS message before it is cached, persisted, or relayed. Internal-use only — not
 * re-exported from `index.ts`'s barrel, since no external consumer of this package exists yet; a
 * future need to validate outgoing messages before send is a separate proposal, not a reason to
 * widen the public API surface today.
 *
 * Checks the **envelope only** — the v6 top-level shape (`schemaVersion` an integer `>= 6`, plus
 * the 5 required array fields), not a deep structural match against every nested `endpoints[]` /
 * `symbols[]` / `guards[]` entry. A value passing this guard is **wire-safe** (it will not poison
 * `cachedCatalogText` with a doc a panel's top-level `currentDoc.endpoints.find` throws on) — it is
 * not a claim that the value is fully valid under kernelee's own rules; a deep per-field
 * malformation still reaches the panel, which is why the panel has its own `ErrorBoundary` as the
 * last line of defense, not a reason to duplicate kernelee's schema here. See
 * {@link isBridgeTraceEntry} for the same broadness on the `trace` side and the shared
 * "wire-safe, not fully valid" caveat, and `docs/bridge-drops-nonconforming-messages.md` for why
 * `>= 6` rather than `=== 6`.
 */
export function isBridgeMessage(value: unknown): value is WireBridgeMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (message.type === 'trace') {
    return isBridgeTraceEntry(message.entry);
  }
  if (message.type === 'catalog') {
    return isWireWiringGraphDocument(message.doc);
  }
  return false;
}

function isWireWiringGraphDocument(value: unknown): value is WireWiringGraphDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const doc = value as Record<string, unknown>;
  if (!Number.isInteger(doc.schemaVersion) || (doc.schemaVersion as number) < 6) {
    return false;
  }
  return (
    Array.isArray(doc.endpoints) &&
    Array.isArray(doc.symbols) &&
    Array.isArray(doc.guards) &&
    Array.isArray(doc.unresolvedDivertTargets) &&
    Array.isArray(doc.unlistedBoundSymbols)
  );
}
