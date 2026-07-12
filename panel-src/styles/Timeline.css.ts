import { style } from '@vanilla-extract/css';

export const wrap = style({
  flex: 1,
  overflowY: 'auto',
  padding: '0.5rem 0.75rem',
});

const treeBase = style({
  listStyle: 'none',
  margin: 0,
  paddingLeft: '1.1rem',
});

/** `ul.timeline-tree { padding-left: 0 }` overriding the shared `ul.timeline-tree, ul.timeline-tree
 *  ul` rule above — the root list only; nested `<ul>`s (rendered recursively, one per node with
 *  children) keep the 1.1rem indent from `treeBase` alone. */
export const tree = style([treeBase, { paddingLeft: 0 }]);
export const nestedTree = treeBase;

export const row = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.4rem',
  padding: '0.15rem 0.3rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.85rem',
  whiteSpace: 'nowrap',
  ':hover': {
    background: '#f6f8fa',
  },
});

export const rowSelected = style({
  background: '#dbeafe',
});

export const toggle = style({
  width: '1rem',
  flexShrink: 0,
  color: '#57606a',
  userSelect: 'none',
});

export const symbol = style({
  fontWeight: 600,
});

export const verb = style({
  fontSize: '0.7rem',
  padding: '0.05rem 0.4rem',
  borderRadius: '999px',
  background: '#eef1f5',
  color: '#57606a',
});

export const verbFail = style({
  background: '#fdecea',
  color: '#b42318',
});

export const verbDivert = style({
  background: '#fff4e5',
  color: '#b45309',
});

export const ts = style({
  color: '#8c959f',
  fontSize: '0.75rem',
  marginLeft: 'auto',
});
