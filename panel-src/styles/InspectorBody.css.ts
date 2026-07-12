// `.inspector dl/dt/dd/h3/.muted` + `.divert-links`/`.divert-chip` — the key/value + divertsTo
// markup shared by the wiring inspector's EndpointInspector/StageInspector AND the trace
// inspector. The original scoped these under a `.inspector` ancestor; here they are applied
// directly wherever this markup renders (always inside one inspector or the other), which is
// visually identical since nothing else on the page uses `dl`/`dt`/`dd`/`h3`.
import { style } from '@vanilla-extract/css';

export const dl = style({
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '0.25rem 0.75rem',
  margin: 0,
});

export const dt = style({
  fontWeight: 'bold',
  color: '#57606a',
});

export const dd = style({
  margin: 0,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
});

export const h3 = style({
  fontSize: '0.85rem',
  margin: '1rem 0 0.5rem',
});

export const muted = style({
  color: '#57606a',
});

export const divertLinks = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
});

const divertChipBase = style({
  font: 'inherit',
  fontSize: '0.8rem',
  padding: '0.25rem 0.5rem',
  borderRadius: '999px',
  border: '1px solid #d0d7de',
});

export const divertChipResolved = style([
  divertChipBase,
  {
    background: '#eef4ff',
    color: '#1d4ed8',
    cursor: 'pointer',
    ':hover': {
      background: '#dbeafe',
    },
  },
]);

export const divertChipUnresolved = style([
  divertChipBase,
  {
    background: '#f6f8fa',
    color: '#8c959f',
  },
]);
