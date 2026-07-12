import * as styles from '../styles/InspectorBody.css.js';

export interface SiteRowProps {
  readonly term: string;
  readonly site: string;
  readonly url: string | null;
  readonly editorLabel: string;
}

/** A dt/dd pair whose dd is an open-in-editor link when a URL can be built (repoRoot arrived),
 *  plain text otherwise. `site` is a repo-relative "file:line" straight from the index. */
export function SiteRow({ term, site, url, editorLabel }: SiteRowProps) {
  return (
    <>
      <dt className={styles.dt}>{term}</dt>
      <dd className={styles.dd}>
        {url ? (
          <a href={url} title={`Open in ${editorLabel}`}>
            {site}
          </a>
        ) : (
          site
        )}
      </dd>
    </>
  );
}
