// Classes reused across otherwise-unrelated components — same rule as the original CSS's
// `.toolbar` (wiring toolbar AND trace toolbar) and `.dock-btn` (the gear button AND the two dock
// buttons). Centralizing them here mirrors that original cross-cutting scope instead of forcing
// them to live under one arbitrary owning component.
import { style } from '@vanilla-extract/css';

/** `.toolbar { ... }` */
export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.4rem 0.75rem',
  borderBottom: '1px solid #d0d7de',
  flexShrink: 0,
  fontSize: '0.85rem',
});

/** `.toolbar label { ... }` — not currently matched by any rendered element (the Editor picker
 *  lives in the inspector header — see `docs/inspector-chrome-lives-outside-the-wiped-body.md`). */
export const toolbarLabel = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
});

/** `.toolbar .spacer { flex: 1 }` */
export const spacer = style({
  flex: 1,
});

/** `.dock-btn { ... }` + `:hover` — the gear (view-options) button and the two inspector dock
 *  buttons all share this class. */
export const dockBtn = style({
  display: 'inline-flex',
  flexShrink: 0,
  padding: '0.25rem',
  border: 'none',
  borderRadius: '4px',
  background: 'none',
  color: '#57606a',
  cursor: 'pointer',
  ':hover': {
    background: '#eef1f5',
  },
});

/** `.dock-btn.active { color: #1d4ed8; background: #dbeafe }` */
export const dockBtnActive = style({
  color: '#1d4ed8',
  background: '#dbeafe',
});
