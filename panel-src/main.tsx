// Panel UI entry point — bundled by esbuild (scripts/build-panel.mjs) into public/panel.js as a
// single IIFE (react/react-dom included), served alongside the vendored relaph build.
import { createRoot } from 'react-dom/client';
import { App } from './components/App.js';
import './styles/global.css.js';

const container = document.getElementById('root');
if (!container) {
  throw new Error('kernelee-devtools-bridge: #root not found in index.html');
}
createRoot(container).render(<App />);
