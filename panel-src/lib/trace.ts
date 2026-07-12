import type { BridgeTraceEntry } from '../types.js';

/** Cap on client-side retained trace entries — same cap x1.25-trim ring as `connector.ts`'s
 *  `pendingCap`/kernelee's `traceCap`. */
export const TRACE_CAP = 300;

export interface TraceForestNode {
  readonly entry: BridgeTraceEntry;
  readonly children: readonly TraceForestNode[];
}

/** Reconstruct the span forest from currently-retained entries only. An entry whose `parentId`
 *  points outside the retained window (evicted, or a genuine independent root) is treated as its
 *  own root. Roots are newest-flow-first (reversed), mirroring Swift's `TraceState.forest`. */
export function buildForest(entries: readonly BridgeTraceEntry[]): TraceForestNode[] {
  const byId = new Map(entries.map((e) => [e.span.id, e] as const));
  const childrenOf = new Map<string, BridgeTraceEntry[]>();
  for (const e of entries) {
    const pid = e.span.parentId;
    if (pid !== undefined && byId.has(pid)) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid)!.push(e);
    }
  }
  const toNode = (entry: BridgeTraceEntry): TraceForestNode => ({
    entry,
    children: (childrenOf.get(entry.span.id) ?? []).map(toNode),
  });
  const roots = entries.filter((e) => e.span.parentId === undefined || !byId.has(e.span.parentId));
  return roots.slice().reverse().map(toNode);
}

/** Applies the cap*1.25-trim ring: once retained entries exceed the threshold, keeps only the
 *  newest TRACE_CAP. Returns the (possibly unchanged) array. */
export function trimTraceEntries(entries: readonly BridgeTraceEntry[]): readonly BridgeTraceEntry[] {
  if (entries.length > TRACE_CAP * 1.25) {
    return entries.slice(entries.length - TRACE_CAP);
  }
  return entries;
}
