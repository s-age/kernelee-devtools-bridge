// Page-level reset + <body> layout — ported 1:1 from index.html's original <style> block. These
// are `globalStyle()` (not `style()`) because they target the actual static <body>/<html> tags,
// which stay outside React's tree (React only owns #root's subtree) — see index.html.
import { globalStyle } from '@vanilla-extract/css';

globalStyle(':root', {
  colorScheme: 'light',
});

globalStyle('*', {
  boxSizing: 'border-box',
});

globalStyle('html, body', {
  height: '100%',
  margin: 0,
});

globalStyle('body', {
  fontFamily: 'system-ui, sans-serif',
  color: '#1b1f23',
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
});

// The original page put <header> and the .layout divs directly inside the flex-column <body>;
// React mounts them one level deeper, inside #root. Without this, #root is a plain block box:
// `.layout { flex: 1; min-height: 0 }` goes inert, the canvas's `height: 100%` resolves against
// an indefinite chain, and relaph's ResizeObserver (which writes dpr-scaled bitmap sizes back to
// the <canvas> attributes) feeds an unbounded vertical growth loop that pushes the inspector and
// zoom overlay off-screen. #root must forward the body's flex context to its children.
globalStyle('#root', {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
});
