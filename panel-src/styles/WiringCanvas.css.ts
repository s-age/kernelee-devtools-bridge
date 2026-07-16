import { style } from '@vanilla-extract/css';

export const canvasWrap = style({
  flex: 1,
  position: 'relative',
  minHeight: 0,
});

export const canvas = style({
  width: '100%',
  height: '100%',
  display: 'block',
});

/** `.canvas-overlay { ... }` */
export const canvasOverlay = style({
  position: 'absolute',
  right: '0.75rem',
  padding: '0.35rem 0.5rem',
  background: 'rgba(255, 255, 255, 0.9)',
  border: '1px solid #d0d7de',
  borderRadius: '6px',
});

/** `.legend-overlay { top: 0.75rem }` + `.legend-overlay:empty { display: none }` */
export const legendOverlay = style({
  top: '0.75rem',
  selectors: {
    '&:empty': { display: 'none' },
  },
});

/** `.zoom-overlay { bottom: 0.75rem; display: flex; gap: 0.25rem }` */
export const zoomOverlay = style({
  bottom: '0.75rem',
  display: 'flex',
  gap: '0.25rem',
});

/** `.legend { ... }` */
export const legend = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.8rem',
  color: '#57606a',
});

/** `.legend-chip { ... }` */
export const legendChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
});

/** `.legend-swatch { ... }` — background color is set inline per-swatch at render time
 *  (panel-config's `partColors` are a runtime value, out of vanilla-extract's scope). */
export const legendSwatch = style({
  width: '0.7rem',
  height: '0.7rem',
  borderRadius: '3px',
  border: '1px solid rgba(0, 0, 0, 0.15)',
  display: 'inline-block',
});

/** `.unanchored-overlay { left: 0.75rem; top: 0.75rem; max-width: 40%; ... }` — the "never dropped"
 *  home for `guards[].targetId` entries that match no catalogued endpoint (see `lib/graph.ts`'s
 *  `unanchoredGuards`): pinned top-left (the legend/zoom overlays already own top-right/bottom-right)
 *  so it stays visible regardless of which endpoint is selected, rather than living inside a
 *  per-endpoint tree that would never render it. Hidden entirely (`:empty`) when there are none —
 *  same degrade-to-nothing rule `legendOverlay` uses. */
export const unanchoredOverlay = style({
  left: '0.75rem',
  top: '0.75rem',
  maxWidth: '40%',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  fontSize: '0.8rem',
  color: '#57606a',
  selectors: {
    '&:empty': { display: 'none' },
  },
});

export const unanchoredTitle = style({
  fontWeight: 600,
  color: '#b45309',
});

/** `.unanchored-chip { ... }` — a small gate-flavored card standing in for an actual graph node:
 *  the target has no catalogued endpoint to anchor a real tree node to, so its gate chain is
 *  rendered as a flat, clearly-labeled group instead of being silently dropped. */
export const unanchoredChip = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  padding: '0.3rem 0.5rem',
  borderRadius: '6px',
  border: '1px solid #d0d7de',
});

export const unanchoredChipTarget = style({
  fontWeight: 600,
  wordBreak: 'break-word',
});

export const unanchoredChipGates = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.25rem',
});

/** One gate id badge inside an unanchored chip — background set inline per-badge (the gate part
 *  color, same as a real gate node's fill; see `unanchoredChip`'s own doc comment). */
export const unanchoredGateBadge = style({
  padding: '0.05rem 0.4rem',
  borderRadius: '999px',
  fontSize: '0.75rem',
  border: '1px solid rgba(0, 0, 0, 0.12)',
});
