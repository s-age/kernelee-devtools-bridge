import type { IndexEndpoint, WiringEndpoint } from '../types.js';
import { SiteRow } from './SiteRow.js';
import * as styles from '../styles/InspectorBody.css.js';

export interface EndpointInspectorProps {
  readonly endpoint: WiringEndpoint;
  readonly indexEndpointByKey: ReadonlyMap<string, IndexEndpoint>;
  readonly editorUrl: (site: string) => string | null;
  readonly editorLabel: string;
}

/** The pipeline's own inspector (root card): runtime facts (title/key/note) plus the index's
 *  `drivenBy` — who dispatches/launches this pipeline, each site an open-in-editor jump. */
export function EndpointInspector({ endpoint, indexEndpointByKey, editorUrl, editorLabel }: EndpointInspectorProps) {
  const drives = indexEndpointByKey.get(endpoint.key)?.drivenBy ?? [];
  return (
    <>
      <dl className={styles.dl}>
        <dt className={styles.dt}>key</dt>
        <dd className={styles.dd}>{endpoint.key}</dd>
        <dt className={styles.dt}>kind</dt>
        <dd className={styles.dd}>{endpoint.kind}</dd>
        {endpoint.note !== undefined && (
          <>
            <dt className={styles.dt}>note</dt>
            <dd className={styles.dd}>{endpoint.note}</dd>
          </>
        )}
      </dl>
      <h3 className={styles.h3}>drivenBy</h3>
      {drives.length === 0 ? (
        <p className={styles.muted}>
          No statically-scanned drive site (introspect index missing, stale, or the pipeline is only reached via divert).
        </p>
      ) : (
        <dl className={styles.dl}>
          {drives.map((drive, i) => (
            <SiteRow
              key={i}
              term={`${drive.mode}${drive.owner ? ` (${drive.owner})` : ''}`}
              site={drive.site}
              url={editorUrl(drive.site)}
              editorLabel={editorLabel}
            />
          ))}
        </dl>
      )}
    </>
  );
}
