import { style } from '@vanilla-extract/css';

/** `.sidebar { ... }`. Exported so `Resizer.css.ts` (a sibling component in the DOM, not a
 *  parent/child of Sidebar) can express `.sidebar.collapsed + .resizer` as a `selectors` rule
 *  keyed off this exact class token — an adjacent-sibling relationship that crosses component
 *  boundaries. See `docs/dragged-inline-sizes-yield-to-mode-classes.md`. */
export const sidebar = style({
  width: '260px',
  flexShrink: 0,
  borderRight: '1px solid #d0d7de',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

/** `.sidebar.collapsed { width: auto }` — exported for the same cross-component reason as
 *  `sidebar` above (the resizer needs this exact token for its sibling selector). */
export const sidebarCollapsed = style({
  width: 'auto',
});

export const toggleButton = style({
  alignSelf: 'flex-end',
  margin: '0.5rem 0.5rem 0',
  font: 'inherit',
  fontSize: '0.75rem',
  padding: '0.15rem 0.45rem',
  border: '1px solid #d0d7de',
  borderRadius: '6px',
  background: '#f6f8fa',
  cursor: 'pointer',
});

/** `.sidebar input[type="search"] { ... }` */
export const searchInput = style({
  margin: '0.5rem',
  padding: '0.4rem',
});

/** `.sidebar.collapsed input, .sidebar.collapsed ul { display: none }` — Sidebar owns both the
 *  collapsed state and the input/ul it hides, so this is applied as a plain conditional class
 *  from within the same component rather than a CSS descendant selector. */
export const hiddenWhenCollapsed = style({
  display: 'none',
});

/** `.sidebar ul { ... }` */
export const list = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  overflowY: 'auto',
});

/** `.sidebar li { ... }` + `:hover` */
export const item = style({
  padding: '0.5rem 0.75rem',
  cursor: 'pointer',
  borderBottom: '1px solid #eef1f5',
  display: 'flex',
  flexDirection: 'column',
  ':hover': {
    background: '#f6f8fa',
  },
});

/** `.sidebar li.selected { background: #dbeafe }` */
export const itemSelected = style({
  background: '#dbeafe',
});

/** `.sidebar li .title { font-size: 0.9rem }` */
export const itemTitle = style({
  fontSize: '0.9rem',
});

/** `.sidebar li .key { font-size: 0.75rem; color: #57606a }` */
export const itemKey = style({
  fontSize: '0.75rem',
  color: '#57606a',
});
