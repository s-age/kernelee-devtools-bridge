# Inspector chrome lives outside the wiped body

Context: the wiring inspector has a persistent header (Editor select + dock-side SVG buttons),
while the rest of its content is replaced wholesale on every selection change.

## What

**The inspector's persistent chrome (header) lives OUTSIDE the element whose
content is replaced on every stage/entry selection** — anything stateful
placed inside the selection-dependent part would die on the next click. The
structure is therefore:

```
<aside class="inspector with-header">                        ← stable chrome
  <div class="inspector-header">…Editor select, dock buttons…</div>
  <div class="inspector-body">…selection-dependent content…</div>  ← replaced freely
</aside>
```

The `.with-header` modifier moves padding/scroll from the aside to
`.inspector-body`. The trace tab's inspector has no header and no
modifier — it keeps the plain `.inspector` styling.

## Why

The alternative (re-attach the header alongside each selection render, or
have every render site target a child node) either couples every render site
to the header's existence or rebuilds live `<select>`/button state (open
dropdown, focus) on every click. Splitting "stable chrome" from "replaced
body" at the DOM level makes the contract structural instead of behavioral.

## Gotchas

- CSS helpers are scoped tighter than they look: `.spacer { flex: 1 }` was
  actually `.toolbar .spacer`, so it silently did nothing inside
  `.inspector-header` (icons hugged the label until the Editor `<label>`
  itself got `flex: 1`). Check the selector, not just the class name.
