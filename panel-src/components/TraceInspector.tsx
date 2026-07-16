import { Fragment } from 'react';
import type { BridgeTraceEntry } from '../types.js';
import * as inspectorStyles from '../styles/InspectorPanel.css.js';
import * as styles from '../styles/InspectorBody.css.js';

export interface TraceInspectorProps {
  readonly entry: BridgeTraceEntry | null;
  /** Whether `entry.symbolId` is in the panel's gate-id set (App.tsx's `gateIds`, joined from
   *  `doc.guards`) — adds the same verdict-reading note the wiring tab's gate node gives, since a
   *  gate's non-next verdict (including `abort`) reads as a veto here too, not a plain verb. */
  readonly isGate: boolean;
}

/** The selected trace entry's inspector. Uses the same base `.inspector` chrome as the
 *  wiring inspector's aside, but plain — no header, no dock toggle (it never bottom-docks). */
export function TraceInspector({ entry, isGate }: TraceInspectorProps) {
  return (
    <aside className={inspectorStyles.inspectorBase}>
      {!entry ? (
        <p className={styles.muted}>Click a trace entry to see its details and the Buffer state at that moment.</p>
      ) : (
        <>
          {isGate && (
            <p className={styles.muted}>
              This entry is a gate — verdict: next → allow / non-next (divert · fail · abort) → veto. Re-entry within one
              causal flow skips the gate (no trace entry).
            </p>
          )}
          <dl className={styles.dl}>
            <dt className={styles.dt}>symbolId</dt>
            <dd className={styles.dd}>{entry.symbolId}</dd>
            <dt className={styles.dt}>verb</dt>
            <dd className={styles.dd}>{entry.verb}</dd>
            <dt className={styles.dt}>span</dt>
            <dd className={styles.dd}>{entry.span.id}</dd>
            {entry.span.parentId !== undefined && (
              <>
                <dt className={styles.dt}>parent</dt>
                <dd className={styles.dd}>{entry.span.parentId}</dd>
              </>
            )}
            <dt className={styles.dt}>timestamp</dt>
            <dd className={styles.dd}>{new Date(entry.timestamp).toLocaleString()}</dd>
            {entry.payload !== undefined && (
              <>
                <dt className={styles.dt}>payload</dt>
                <dd className={styles.dd}>{entry.payload}</dd>
              </>
            )}
          </dl>
          <h3 className={styles.h3}>Buffer state at this span (read-only, no time-travel)</h3>
          {!entry.bufferSnapshot || entry.bufferSnapshot.length === 0 ? (
            <p className={styles.muted}>No watched Buffer cells configured for this connector.</p>
          ) : (
            <dl className={styles.dl}>
              {entry.bufferSnapshot.map((cell, i) => (
                <Fragment key={i}>
                  <dt className={styles.dt}>{cell.label}</dt>
                  <dd className={styles.dd}>{cell.value}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </>
      )}
    </aside>
  );
}
