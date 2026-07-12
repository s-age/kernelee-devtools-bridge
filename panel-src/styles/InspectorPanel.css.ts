import { style } from '@vanilla-extract/css';
import { contentInspectorBottom } from './App.css.js';

/** `.inspector { ... }` — the base aside chrome, shared by the wiring inspector (`with-header`
 *  variant, below) and the trace inspector (plain, no header, no dock override — it never
 *  docks bottom). */
export const inspectorBase = style({
  width: '340px',
  flexShrink: 0,
  borderLeft: '1px solid #d0d7de',
  padding: '0.75rem',
  overflowY: 'auto',
});

/** `.inspector.with-header { ... }` + `.content.inspector-bottom .inspector { ... }` — the
 *  wiring inspector aside: chromeless padding/overflow (the header/body split owns those now),
 *  and the dock-bottom size/border override keyed off App.css.ts's `contentInspectorBottom`
 *  ancestor token (this aside is that div's descendant once bottom-docked). */
export const withHeader = style({
  padding: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  selectors: {
    [`${contentInspectorBottom} &`]: {
      width: 'auto',
      height: '260px',
      borderLeft: 'none',
      borderTop: '1px solid #d0d7de',
    },
  },
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.4rem 0.75rem',
  borderBottom: '1px solid #d0d7de',
  flexShrink: 0,
  fontSize: '0.85rem',
});

/** `.inspector-header label { flex: 1; display: flex; align-items: center; gap: 0.25rem;
 *  min-width: 0 }` — see `docs/inspector-chrome-lives-outside-the-wiped-body.md`'s gotcha: this is
 *  what actually pushes the dock buttons to the header's trailing edge (a bare `.spacer` rule
 *  scoped to `.toolbar` silently did not apply here). */
export const headerLabel = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  minWidth: 0,
});

export const body = style({
  flex: 1,
  padding: '0.75rem',
  overflowY: 'auto',
});
