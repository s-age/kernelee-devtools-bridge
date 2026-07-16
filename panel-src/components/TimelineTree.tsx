import type { MouseEvent } from 'react';
import type { BridgeTraceEntry } from '../types.js';
import type { TraceForestNode } from '../lib/trace.js';
import * as styles from '../styles/Timeline.css.js';

export interface TimelineTreeProps {
  readonly forest: readonly TraceForestNode[];
  readonly collapsedSpanIds: ReadonlySet<string>;
  readonly selectedTraceEntry: BridgeTraceEntry | null;
  /** `WiringGraphDocument.guards[].gateIds`, flattened into one id set (App.tsx) — an id JOIN, never
   *  a `guard:` prefix regex (the prefix is convention only, not structural — see kernelee's
   *  `declareGate` doc comment). A trace entry whose `symbolId` is in this set ran as a gate, not the
   *  guarded target itself (gates run through the ordinary `invoke` chokepoint, so they trace exactly
   *  like any other symbol — see kernel.ts's `gatedHandler`). */
  readonly gateIds: ReadonlySet<string>;
  readonly onSelectEntry: (entry: BridgeTraceEntry) => void;
  readonly onToggleCollapse: (spanId: string) => void;
}

/** The span-forest timeline. Only rendered while the trace
 *  tab is visible (see App.tsx) — this is the expensive part `useTracePipeline`'s hidden-tab
 *  gating exists to skip. */
export function TimelineTree({ forest, collapsedSpanIds, selectedTraceEntry, gateIds, onSelectEntry, onToggleCollapse }: TimelineTreeProps) {
  return (
    <ul className={styles.tree}>
      {forest.map((node) => (
        <TimelineNode
          key={node.entry.span.id}
          node={node}
          collapsedSpanIds={collapsedSpanIds}
          selectedTraceEntry={selectedTraceEntry}
          gateIds={gateIds}
          onSelectEntry={onSelectEntry}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </ul>
  );
}

function TimelineNode({
  node,
  collapsedSpanIds,
  selectedTraceEntry,
  gateIds,
  onSelectEntry,
  onToggleCollapse,
}: {
  node: TraceForestNode;
  collapsedSpanIds: ReadonlySet<string>;
  selectedTraceEntry: BridgeTraceEntry | null;
  gateIds: ReadonlySet<string>;
  onSelectEntry: (entry: BridgeTraceEntry) => void;
  onToggleCollapse: (spanId: string) => void;
}) {
  const spanId = node.entry.span.id;
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedSpanIds.has(spanId);
  const isGate = gateIds.has(node.entry.symbolId);
  // Gate verdict reading is BINARY, unlike an ordinary symbol's verb coloring below: `next` = allow,
  // ANY non-next (divert/fail/abort) = veto — kernel.ts's `gatedHandler` honors exactly this split
  // (`if (v.kind !== 'next') return v`), so `abort` must read as a veto here too, not fall through
  // unstyled the way it does for a non-gate entry (see `verbModifier`'s own else-branch below). An
  // allow that happened is still gate-flavored, not just "unstyled next" — a gate ran and let it
  // through, which is information, not silence.
  const verbModifier = isGate
    ? node.entry.verb === 'next'
      ? ` ${styles.verbGateAllow}`
      : ` ${styles.verbGateVeto}`
    : node.entry.verb === 'fail'
      ? ` ${styles.verbFail}`
      : node.entry.verb === 'divert'
        ? ` ${styles.verbDivert}`
        : '';

  const onToggleClick = (event: MouseEvent) => {
    event.stopPropagation();
    onToggleCollapse(spanId);
  };

  return (
    <li>
      <div
        className={`${styles.row}${selectedTraceEntry === node.entry ? ` ${styles.rowSelected}` : ''}`}
        onClick={() => onSelectEntry(node.entry)}
      >
        <span className={styles.toggle} onClick={hasChildren ? onToggleClick : undefined}>
          {hasChildren ? (isCollapsed ? '▶' : '▼') : ''}
        </span>
        {isGate && (
          <span className={styles.gateBadge} title="pre-handler gate — verdict: next → allow / non-next (divert · fail · abort) → veto">
            gate
          </span>
        )}
        <span className={`${styles.symbol}${isGate ? ` ${styles.symbolGate}` : ''}`}>{node.entry.symbolId}</span>
        <span className={`${styles.verb}${verbModifier}`}>{node.entry.verb}</span>
        <span className={styles.ts}>{new Date(node.entry.timestamp).toLocaleTimeString()}</span>
      </div>
      {hasChildren && !isCollapsed && (
        <ul className={styles.nestedTree}>
          {node.children.map((child) => (
            <TimelineNode
              key={child.entry.span.id}
              node={child}
              collapsedSpanIds={collapsedSpanIds}
              selectedTraceEntry={selectedTraceEntry}
              gateIds={gateIds}
              onSelectEntry={onSelectEntry}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
