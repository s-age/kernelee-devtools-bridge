import { useEffect, useRef, useState } from 'react';
import type { CardSize } from '../types.js';
import * as sharedStyles from '../styles/shared.css.js';
import * as styles from '../styles/Toolbar.css.js';

export interface ToolbarProps {
  readonly backDisabled: boolean;
  readonly onBack: () => void;
  readonly mainLineOnly: boolean;
  readonly onToggleMainLineOnly: () => void;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly cardSize: CardSize;
  readonly onSetCardSize: (size: CardSize) => void;
}

/** Back button + the Chrome-DevTools-style checkmark "view options" gear popover (Main line only
 *  / Collapse / Cards: fit-content|truncate). The menu stays open across toggles (multi-tweak in
 *  one visit) and closes on outside click, Escape, or the gear itself. */
export function Toolbar({
  backDisabled,
  onBack,
  mainLineOnly,
  onToggleMainLineOnly,
  collapsed,
  onToggleCollapsed,
  cardSize,
  onSetCardSize,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const check = (checked: boolean) => (
    <span className={`${styles.check}${checked ? ` ${styles.checkVisible}` : ''}`}>✓</span>
  );

  return (
    <div className={sharedStyles.toolbar}>
      <button disabled={backDisabled} onClick={onBack}>
        ← Back
      </button>
      <span className={sharedStyles.spacer} />
      <div className={styles.viewMenuWrap} ref={wrapRef}>
        <button
          ref={btnRef}
          className={`${sharedStyles.dockBtn}${menuOpen ? ` ${sharedStyles.dockBtnActive}` : ''}`}
          title="View options"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor">
            <circle cx="8" cy="8" r="2" strokeWidth="1.4" />
            <circle cx="8" cy="8" r="4.6" strokeWidth="1.5" />
            <g strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 1.4v2M8 12.6v2M1.4 8h2M12.6 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M12.7 3.3l-1.4 1.4M4.7 11.3l-1.4 1.4" />
            </g>
          </svg>
        </button>
        {menuOpen && (
          <div className={styles.viewMenu}>
            <button className={styles.viewMenuItem} onClick={onToggleMainLineOnly}>
              {check(mainLineOnly)}
              Main line only
            </button>
            <button className={styles.viewMenuItem} onClick={onToggleCollapsed}>
              {check(collapsed)}
              Collapse (anonymous map/effect)
            </button>
            <div className={styles.viewMenuHeading}>Cards</div>
            <button className={styles.viewMenuItem} onClick={() => onSetCardSize('fit-content')}>
              {check(cardSize === 'fit-content')}
              fit-content
            </button>
            <button className={styles.viewMenuItem} onClick={() => onSetCardSize('truncate')}>
              {check(cardSize === 'truncate')}
              truncate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
