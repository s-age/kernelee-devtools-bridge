import type { CSSProperties, RefObject } from 'react';
import type { WiringEndpoint } from '../types.js';
import * as styles from '../styles/Sidebar.css.js';

export interface SidebarProps {
  readonly asideRef: RefObject<HTMLElement | null>;
  readonly collapsed: boolean;
  readonly style: CSSProperties | undefined;
  readonly endpoints: readonly WiringEndpoint[];
  readonly selectedEndpointKey: string | null;
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly onSelectEndpoint: (key: string) => void;
  readonly onToggleCollapsed: () => void;
}

export function Sidebar({
  asideRef,
  collapsed,
  style,
  endpoints,
  selectedEndpointKey,
  searchQuery,
  onSearchChange,
  onSelectEndpoint,
  onToggleCollapsed,
}: SidebarProps) {
  const query = searchQuery.trim().toLowerCase();
  const visible = query
    ? endpoints.filter((e) => e.title.toLowerCase().includes(query) || e.key.toLowerCase().includes(query))
    : endpoints;

  return (
    <aside
      ref={asideRef as RefObject<HTMLElement>}
      className={`${styles.sidebar}${collapsed ? ` ${styles.sidebarCollapsed}` : ''}`}
      style={style}
    >
      <button className={styles.toggleButton} title="Toggle sidebar" onClick={onToggleCollapsed}>
        {collapsed ? '▶' : '◀'}
      </button>
      <input
        type="search"
        className={`${styles.searchInput}${collapsed ? ` ${styles.hiddenWhenCollapsed}` : ''}`}
        placeholder="Search endpoints"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <ul className={`${styles.list}${collapsed ? ` ${styles.hiddenWhenCollapsed}` : ''}`}>
        {visible.map((endpoint) => {
          const kindBadge = endpoint.kind === 'divertTarget' ? ' (divertTarget)' : '';
          return (
            <li
              key={endpoint.key}
              className={`${styles.item}${endpoint.key === selectedEndpointKey ? ` ${styles.itemSelected}` : ''}`}
              onClick={() => onSelectEndpoint(endpoint.key)}
            >
              <span className={styles.itemTitle}>{endpoint.title + kindBadge}</span>
              <span className={styles.itemKey}>{endpoint.key}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
