import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  padding: '0.5rem 1rem',
  borderBottom: '1px solid #d0d7de',
  flexShrink: 0,
});

export const title = style({
  fontSize: '1rem',
  margin: 0,
});

export const status = style({
  fontWeight: 'bold',
});

export const statusConnected = style({
  color: '#1a7f37',
});

export const statusDisconnected = style({
  color: '#b42318',
});

export const source = style({
  color: '#57606a',
  fontSize: '0.85rem',
});

export const tabs = style({
  display: 'flex',
  gap: '0.25rem',
  marginLeft: '1rem',
});

export const tabBtn = style({
  font: 'inherit',
  fontSize: '0.85rem',
  padding: '0.3rem 0.75rem',
  border: '1px solid #d0d7de',
  borderRadius: '6px',
  background: '#f6f8fa',
  cursor: 'pointer',
});

export const tabBtnActive = style({
  background: '#1d4ed8',
  color: '#fff',
  borderColor: '#1d4ed8',
});
