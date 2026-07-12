import type { TabId } from '../types.js';
import * as styles from '../styles/Header.css.js';

/** WS lifecycle as shown in the header: 'idle' is the initial state ("disconnected", no
 *  "(reconnecting)" suffix — connect() hasn't even run its first attempt yet),
 *  'connected'/'reconnecting' are the `open`/`close` listener outcomes. */
export type WsStatus = 'idle' | 'connected' | 'reconnecting';

export interface HeaderProps {
  readonly activeTab: TabId;
  readonly onSelectTab: (tab: TabId) => void;
  readonly wsStatus: WsStatus;
  readonly sourceText: string;
}

export function Header({ activeTab, onSelectTab, wsStatus, sourceText }: HeaderProps) {
  const connected = wsStatus === 'connected';
  const statusText = connected ? 'connected' : wsStatus === 'reconnecting' ? 'disconnected (reconnecting)' : 'disconnected';
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>kernelee-devtools-bridge</h1>
      <nav className={styles.tabs}>
        <button
          className={`${styles.tabBtn}${activeTab === 'wiring' ? ` ${styles.tabBtnActive}` : ''}`}
          onClick={() => onSelectTab('wiring')}
        >
          Wiring
        </button>
        <button
          className={`${styles.tabBtn}${activeTab === 'trace' ? ` ${styles.tabBtnActive}` : ''}`}
          onClick={() => onSelectTab('trace')}
        >
          Trace
        </button>
      </nav>
      <span className={`${styles.status} ${connected ? styles.statusConnected : styles.statusDisconnected}`}>{statusText}</span>
      <span className={styles.source}>{sourceText}</span>
    </header>
  );
}
