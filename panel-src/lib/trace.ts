import type { BridgeTraceEntry } from '../types.js';

/**
 * Offline/standalone fallback cap on client-side retained trace entries (mirrors the bridge's own
 * `DEFAULT_TRACE_CAP`) — used only when the panel is served without a bridge behind it (e.g. the
 * bundled sample) or before `/panel-config.json` has resolved. Once a bridge is present, the live
 * value arrives via that config's `traceCap` (see `PanelConfig.traceCap` in `../types.js`) and
 * flows into {@link trimTraceEntries} through `useTracePipeline`'s `cap` argument instead. Not the
 * same knob as `connector.ts`'s `pendingCap` (send-side offline backlog) or kernelee's own
 * in-process `traceCap` — those remain deliberately independent concerns.
 */
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
 *  newest `cap` entries. Returns the (possibly unchanged) array. `cap` defaults to the offline
 *  fallback {@link TRACE_CAP}; live callers pass the bridge-supplied runtime value instead (see
 *  `useTracePipeline`). */
export function trimTraceEntries(
  entries: readonly BridgeTraceEntry[],
  cap: number = TRACE_CAP,
): readonly BridgeTraceEntry[] {
  if (entries.length > cap * 1.25) {
    return entries.slice(entries.length - cap);
  }
  return entries;
}
