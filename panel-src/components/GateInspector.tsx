import type { IndexGate } from '../types.js';
import type { SelectedGate } from '../lib/graph.js';
import { SiteRow } from './SiteRow.js';
import * as styles from '../styles/InspectorBody.css.js';

export interface GateInspectorProps {
  readonly gate: SelectedGate;
  /** The gate's own position in `guards[].gateIds`' fold order (0-based) plus how many gates guard
   *  this same target — lets the inspector say "1 of 2" rather than just the bare id, since fold
   *  order is a real behavioral contract (a later gate never runs once an earlier one vetoes). */
  readonly index: number;
  readonly total: number;
  /** The kernel-introspect index's `gates[]` entry for this gateId (`IndexJoin.gates`), or
   *  `undefined` on a join miss (index missing, stale, or pre-v11) — source-link rows degrade away
   *  silently, exactly like `StageInspector`'s handler/wire rows. The runtime wiring document
   *  carries only `{targetId, gateIds}` by design (TS captures no source locations at runtime —
   *  see kernelee's `StageDescriptor` "no wireSite" note); file:line facts are the static index's
   *  job, joined here by gateId. */
  readonly indexGate: IndexGate | undefined;
  readonly editorUrl: (site: string) => string | null;
  readonly editorLabel: string;
}

/** The selected gate node's inspector — a pre-handler veto, not a stage and not an endpoint, so it
 *  gets its own detail body rather than reusing `StageInspector`/`EndpointInspector`. The two facts
 *  here are the ones the design calls out explicitly: how a verdict reads, and why re-entry produces
 *  no trace entry (kernel.ts's `gatedHandler` re-entrancy seal — see kernelee core's own doc comment
 *  on `Kernel.isGuarding`/`withGuarding`). Source-link row precedence mirrors `StageInspector`:
 *  declared (the `declareGate(...)` call site) -> handler (the named gate function's body). */
export function GateInspector({ gate, index, total, indexGate, editorUrl, editorLabel }: GateInspectorProps) {
  return (
    <>
      <dl className={styles.dl}>
        <dt className={styles.dt}>gateId</dt>
        <dd className={styles.dd}>{gate.gateId}</dd>
        <dt className={styles.dt}>guards</dt>
        <dd className={styles.dd}>{gate.targetId}</dd>
        <dt className={styles.dt}>fold order</dt>
        <dd className={styles.dd}>
          {index + 1} of {total}
          {total > 1 ? ' — an earlier gate\'s non-next verdict skips this one entirely' : ''}
        </dd>
        {indexGate?.handler?.functionName !== undefined && (
          <>
            <dt className={styles.dt}>handler</dt>
            <dd className={styles.dd}>{indexGate.handler.functionName}</dd>
          </>
        )}
        {indexGate?.declarationSite !== undefined && (
          <SiteRow term="declared" site={indexGate.declarationSite} url={editorUrl(indexGate.declarationSite)} editorLabel={editorLabel} />
        )}
        {indexGate?.handler?.site !== undefined && (
          <SiteRow term="handler body" site={indexGate.handler.site} url={editorUrl(indexGate.handler.site)} editorLabel={editorLabel} />
        )}
      </dl>
      <h3 className={styles.h3}>Verdict reading</h3>
      <p className={styles.dd}>pre-handler gate — verdict: next → allow / non-next (divert · fail · abort) → veto.</p>
      <h3 className={styles.h3}>Re-entrancy</h3>
      <p className={styles.dd}>re-entry within one causal flow skips the gate (no trace entry).</p>
      {indexGate?.verbEmissions && indexGate.verbEmissions.length > 0 && (
        <>
          <h3 className={styles.h3}>verb emissions</h3>
          {indexGate.verbEmissions.map((emission, i) => (
            <dl className={styles.dl} key={i}>
              <dt className={styles.dt}>verb</dt>
              <dd className={styles.dd}>{emission.verb}</dd>
              <dt className={styles.dt}>desc</dt>
              <dd className={emission.desc === null ? styles.descTodo : styles.dd}>{emission.desc ?? 'TODO'}</dd>
              <SiteRow term="site" site={emission.site} url={editorUrl(emission.site)} editorLabel={editorLabel} />
            </dl>
          ))}
        </>
      )}
    </>
  );
}
