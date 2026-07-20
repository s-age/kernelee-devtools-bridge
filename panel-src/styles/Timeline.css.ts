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

/** Gate verdict reading is binary (see `TimelineTree`'s own doc comment): `next` = allow, ANY
 *  non-next (divert/fail/abort) = veto. `verbGateVeto` deliberately reuses `verbFail`'s red (a veto
 *  IS a stop, regardless of which verb produced it) rather than minting a third color; `verbGateAllow`
 *  gets the gate's own green so an allow still reads as "a gate ran here", not as a plain unstyled
 *  `next`. */
export const verbGateVeto = style({
  background: '#fdecea',
  color: '#b42318',
});

export const verbGateAllow = style({
  background: '#e6f4ea',
  color: '#1a7431',
});

/** `.gate-badge { ... }` — marks a trace row whose `symbolId` is in the gate-id set (App.tsx's
 *  `gateIds`, joined from `doc.guards`), distinct from the verb pill: this says "this ROW is a
 *  gate", the verb pill separately says "and here is how its verdict reads". */
export const gateBadge = style({
  fontSize: '0.65rem',
  fontWeight: 600,
  padding: '0.05rem 0.35rem',
  borderRadius: '999px',
  background: '#bfe6c2',
  color: '#1a7431',
  flexShrink: 0,
});

export const symbolGate = style({
  fontStyle: 'italic',
});

/** `.desc` — a trace row's own `TraceEntry.desc` (`abort(value, desc)` / `fail(error, desc)`),
 *  shown inline next to the verb pill when present. Muted, same register as `.ts` below, since
 *  this is supplementary context, not the row's primary identity. */
export const desc = style({
  color: '#57606a',
  fontSize: '0.75rem',
  fontStyle: 'italic',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const ts = style({
  color: '#8c959f',
  fontSize: '0.75rem',
  marginLeft: 'auto',
});
