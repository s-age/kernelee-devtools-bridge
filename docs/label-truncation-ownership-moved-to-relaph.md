# Label truncation ownership moved to relaph

Context: wiring-graph panel cards show long stage labels; relaph 0.2 provides 'fit-content'
sizing + `labelOverflow: 'truncate'`, so the panel does no string-domain cutting of its own.

## What

**Label sizing/truncation is owned by relaph (pixel domain), not the panel
(string domain).** The panel always passes full label strings and picks
per-node `width: 'fit-content'` (box grows to the measured label) or a fixed
width with `labelOverflow: 'truncate'` (relaph binary-searches the longest
`…`-terminated prefix that fits). The toolbar `Cards:` select switches modes;
`labelOverflow: 'truncate'` is set unconditionally because fit-content boxes
always fit their label, so it simply never fires in that mode.

## Why

A char-count cut is wrong in both directions at once: 26 CJK glyphs overflow
a 220px box while 26 latin glyphs waste half of it. Only the renderer knows
the effective font, so only it can decide pixel-accurately. It also keeps the
"one short line" constraint out of every relaph consumer.

## Gotchas

- `public/vendor/relaph.global.js` is **gitignored** — after checkout or a
  relaph rebuild, run `npm run vendor` (copies from `node_modules/relaph`).
- `relaph` is pinned as `file:../relaph` while 0.2.0 is unpublished; switch
  back to `^0.2.0` after publish. The vendored build, not node_modules, is
  what the served panel actually executes.
