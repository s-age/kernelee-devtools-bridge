// Builds the panel UI (panel-src/**, TypeScript + React + vanilla-extract) into the two static
// assets the server actually ships: public/panel.js (IIFE bundle, react/react-dom included) and
// public/panel.css (vanilla-extract's build-time-generated stylesheet). A plain esbuild CLI
// invocation can't run the vanilla-extract plugin (CLI has no plugin hook), hence this small JS-API
// script. Both outputs are gitignored generated artifacts, same as public/vendor/relaph.global.js.
import { build } from 'esbuild';
import { vanillaExtractPlugin } from '@vanilla-extract/esbuild-plugin';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

await build({
  entryPoints: [join(rootDir, 'panel-src', 'main.tsx')],
  outfile: join(rootDir, 'public', 'panel.js'),
  bundle: true,
  format: 'iife',
  // tsconfig.panel.json's `jsx: react-jsx` only governs tsc's typecheck; esbuild reads its own
  // option and defaults to the classic transform (`React.createElement`), which throws
  // "React is not defined" at runtime since nothing imports React under the automatic runtime.
  jsx: 'automatic',
  target: 'es2020',
  sourcemap: true,
  logLevel: 'info',
  plugins: [vanillaExtractPlugin()],
});
