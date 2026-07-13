import type { IndexSymbol, StageDescriptor } from '../types.js';
import { SiteRow } from './SiteRow.js';
import * as styles from '../styles/InspectorBody.css.js';

export interface StageInspectorProps {
  readonly stage: StageDescriptor;
  readonly selectedStagePath: string | null;
  readonly indexSymbolById: ReadonlyMap<string, IndexSymbol>;
  readonly handlerSiteByName: ReadonlyMap<string, string>;
  readonly wireSiteByPath: ReadonlyMap<string, string>;
  readonly editorUrl: (site: string) => string | null;
  readonly editorLabel: string;
  readonly endpointKeys: ReadonlySet<string>;
  readonly onJumpToEndpoint: (key: string) => void;
}

/** The selected stage's inspector. Source-link row precedence:
 *  declaration/implementation (symbols[] join) -> handler (handlerName join) -> wire (positional
 *  join on the node path) — each degrades away independently on a join miss. See
 *  `docs/wire-links-positional-join-on-node-id-grammar.md`. */
export function StageInspector({
  stage,
  selectedStagePath,
  indexSymbolById,
  handlerSiteByName,
  wireSiteByPath,
  editorUrl,
  editorLabel,
  endpointKeys,
  onJumpToEndpoint,
}: StageInspectorProps) {
  const symbolEntry = stage.symbolId ? indexSymbolById.get(stage.symbolId) : undefined;
  const handlerSite = stage.handlerName ? handlerSiteByName.get(stage.handlerName) : undefined;
  const wireSite = selectedStagePath ? wireSiteByPath.get(selectedStagePath) : undefined;

  return (
    <>
      <dl className={styles.dl}>
        <dt className={styles.dt}>kind</dt>
        <dd className={styles.dd}>{stage.kind}</dd>
        {stage.symbolId !== undefined && (
          <>
            <dt className={styles.dt}>symbolId</dt>
            <dd className={styles.dd}>{stage.symbolId}</dd>
          </>
        )}
        {stage.note !== undefined && (
          <>
            <dt className={styles.dt}>note</dt>
            <dd className={styles.dd}>{stage.note}</dd>
          </>
        )}
        {stage.branchArity !== undefined && (
          <>
            <dt className={styles.dt}>branchArity</dt>
            <dd className={styles.dd}>
              {stage.branchArity.kind}
              {'count' in stage.branchArity ? ` (${stage.branchArity.count})` : ''}
            </dd>
          </>
        )}
        {stage.untrackedBranches !== undefined && stage.untrackedBranches.length > 0 && (
          <>
            <dt className={styles.dt}>untracked</dt>
            <dd className={styles.dd}>
              {stage.untrackedBranches.length} detached branch{stage.untrackedBranches.length === 1 ? '' : 'es'} (fire-and-forget)
            </dd>
          </>
        )}
        {symbolEntry?.declaration?.site !== undefined && (
          <SiteRow term="declaration" site={symbolEntry.declaration.site} url={editorUrl(symbolEntry.declaration.site)} editorLabel={editorLabel} />
        )}
        {symbolEntry?.implementation?.site !== undefined && (
          <SiteRow
            term="implementation"
            site={symbolEntry.implementation.site}
            url={editorUrl(symbolEntry.implementation.site)}
            editorLabel={editorLabel}
          />
        )}
        {handlerSite !== undefined && <SiteRow term="handler" site={handlerSite} url={editorUrl(handlerSite)} editorLabel={editorLabel} />}
        {wireSite !== undefined && <SiteRow term="wire" site={wireSite} url={editorUrl(wireSite)} editorLabel={editorLabel} />}
      </dl>
      {stage.divertsTo && stage.divertsTo.length > 0 && (
        <>
          <h3 className={styles.h3}>divertsTo</h3>
          <div className={styles.divertLinks}>
            {stage.divertsTo.map((target) =>
              endpointKeys.has(target) ? (
                <button key={target} className={styles.divertChipResolved} onClick={() => onJumpToEndpoint(target)}>
                  {target}
                </button>
              ) : (
                <span key={target} className={styles.divertChipUnresolved} title="No matching endpoint in this document">
                  {target}
                </span>
              ),
            )}
          </div>
        </>
      )}
    </>
  );
}
