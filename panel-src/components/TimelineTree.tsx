import type { MouseEvent } from 'react';
import type { BridgeTraceEntry } from '../types.js';
import type { TraceForestNode } from '../lib/trace.js';
import * as styles from '../styles/Timeline.css.js';

export interface TimelineTreeProps {
  readonly forest: readonly TraceForestNode[];
  readonly collapsedSpanIds: ReadonlySet<string>;
  readonly selectedTraceEntry: BridgeTraceEntry | null;
  readonly onSelectEntry: (entry: BridgeTraceEntry) => void;
  readonly onToggleCollapse: (spanId: string) => void;
}

/** The span-forest timeline. Only rendered while the trace
 *  tab is visible (see App.tsx) — this is the expensive part `useTracePipeline`'s hidden-tab
 *  gating exists to skip. */
export function TimelineTree({ forest, collapsedSpanIds, selectedTraceEntry, onSelectEntry, onToggleCollapse }: TimelineTreeProps) {
  return (
    <ul className={styles.tree}>
      {forest.map((node) => (
        <TimelineNode
          key={node.entry.span.id}
          node={node}
          collapsedSpanIds={collapsedSpanIds}
          selectedTraceEntry={selectedTraceEntry}
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
  onSelectEntry,
  onToggleCollapse,
}: {
  node: TraceForestNode;
  collapsedSpanIds: ReadonlySet<string>;
  selectedTraceEntry: BridgeTraceEntry | null;
  onSelectEntry: (entry: BridgeTraceEntry) => void;
  onToggleCollapse: (spanId: string) => void;
}) {
  const spanId = node.entry.span.id;
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedSpanIds.has(spanId);
  const verbModifier = node.entry.verb === 'fail' ? ` ${styles.verbFail}` : node.entry.verb === 'divert' ? ` ${styles.verbDivert}` : '';

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
        <span className={styles.symbol}>{node.entry.symbolId}</span>
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
              onSelectEntry={onSelectEntry}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
