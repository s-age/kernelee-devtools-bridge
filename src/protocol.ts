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
}

/** trace = live per-invoke forwarding; catalog = the static wiring-graph snapshot, sent once and replayed to late joiners. */
export type BridgeMessage =
  | { readonly type: 'trace'; readonly entry: BridgeTraceEntry }
  | { readonly type: 'catalog'; readonly doc: WiringGraphDocument };
