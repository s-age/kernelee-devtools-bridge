# Dragged inline sizes yield to mode classes

Context: sidebar collapse, inspector right/bottom dock, and drag-resize interact; dragged sizes
are inline style px values, layout modes are CSS classes.

## What

**A dragged size is an inline `style.width/height` in px; a layout mode is a
class whose stylesheet rule it always beats.** So only the active axis may
carry an inline size:

- A collapsed sidebar carries no inline width — otherwise the dragged width
  overrides `.sidebar.collapsed { width: auto }` and the "collapsed" strip
  stays 300px wide.
- The inspector keeps only the active axis: right-dock carries an inline
  width and no height; bottom-dock carries an inline height and no width
  (which would beat `.content.inspector-bottom .inspector { width: auto }`
  and wedge the panel at partial width).

`useLayoutPrefs` encodes this as *derived* state: the class and the inline
style are recomputed together on every render, so there is no imperative
clear-on-toggle to forget. Sizes persist per axis (`sidebar-width` /
`inspector-width` / `inspector-height` keys), so right⇔bottom round-trips
restore each side's own size. `null` = stylesheet default, and is stored as
`removeItem`, not `"null"`.

## Why

Inline style wins over any class selector regardless of specificity, so
"add a class for the mode" is never enough once drag-resize exists — the
place that decides class and inline state together is the single choke point
where they are reconciled. Centralizing there (rather than clearing at each
call site) is what keeps toggle → drag → toggle → reload sequences
consistent.

## Gotchas

- The drag itself is `setPointerCapture` on a 5px handle — listeners attach
  on pointerdown and detach on pointerup/pointercancel, so a fast pointer
  can't escape the handle mid-drag.
- Canvas re-raster during a live drag is relaph's ResizeObserver's job; the
  panel never calls `resize()`/`fit()` on layout changes. Viewport (pan/zoom)
  is intentionally preserved — Fit is one click away.
- The collapsed sidebar hides its own handle via the sibling selector
  `.sidebar.collapsed + .resizer` — the resizer div must stay the aside's
  immediate next sibling for that to hold.
