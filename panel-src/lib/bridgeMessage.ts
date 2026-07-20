import type { BridgeTraceEntry, WireBridgeMessage, WireWiringGraphDocument } from '../types.js';

/**
 * Parses one raw WS frame into a {@link WireBridgeMessage}, or `null` if it fails to parse as
 * JSON or fails the wire-contract envelope check — mirrors `src/protocol.ts`'s
 * `isBridgeMessage`/`isBridgeTraceEntry` rule-for-rule (deliberately duplicated, not imported:
 * panel-src is an independently bundled client tree, see `types.ts`'s header comment).
 *
 * This is the panel's own validator, not a second check on top of the server's — it exists for
 * non-conforming frames that reach the panel through a path the server's validator doesn't cover
 * (a stray direct WS client, an older/miswired bridge, a hand-crafted frame during development).
 * A value passing this is **wire-safe** for the panel's own top-level reads (`doc.endpoints`,
 * `doc.symbols`, ...) — not a claim that every nested field is fully valid; the panel's
 * `ErrorBoundary` is the last line of defense for a deep per-field malformation that slips past
 * this envelope check. See `docs/bridge-drops-nonconforming-messages.md`.
 */
export function parseBridgeMessage(raw: string): WireBridgeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isWireBridgeMessage(parsed) ? parsed : null;
}

function isWireBridgeMessage(value: unknown): value is WireBridgeMessage {
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

function isBridgeTraceEntry(value: unknown): value is BridgeTraceEntry {
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
