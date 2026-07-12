import { style } from '@vanilla-extract/css';

export const viewMenuWrap = style({
  position: 'relative',
});

export const viewMenu = style({
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  zIndex: 10,
  minWidth: '250px',
  padding: '0.35rem',
  background: '#fff',
  border: '1px solid #d0d7de',
  borderRadius: '8px',
  boxShadow: '0 8px 24px rgba(140, 149, 159, 0.25)',
});

export const viewMenuHeading = style({
  marginTop: '0.25rem',
  padding: '0.4rem 0.5rem 0.15rem',
  borderTop: '1px solid #eef1f5',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  color: '#8c959f',
});

export const viewMenuItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  width: '100%',
  padding: '0.35rem 0.5rem',
  border: 'none',
  borderRadius: '6px',
  background: 'none',
  font: 'inherit',
  fontSize: '0.85rem',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  ':hover': {
    background: '#f6f8fa',
  },
});

/** `.view-menu-item .check { ... }` — check/checkVisible are self-contained within the same
 *  ViewMenu component (it owns both the item and its checked state), so the "checked" compound
 *  selector becomes a plain conditional class join instead of a `.checked .check` descendant
 *  rule. */
export const check = style({
  width: '1em',
  flexShrink: 0,
  visibility: 'hidden',
  color: '#1d4ed8',
});

/** `.view-menu-item.checked .check { visibility: visible }` */
export const checkVisible = style({
  visibility: 'visible',
});
