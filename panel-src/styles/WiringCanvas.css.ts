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
