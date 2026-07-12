# \#root must forward the body flex context

Context: React mounts the header/.layout inside `<div id="root">`, one level below `<body>`'s
flex context; without styling on #root, the inspector and zoom overlay vanish off-screen and
drag-resize appears dead.

## What

**`#root` must forward the body's flex context, or the canvas grows without
bound.** The page relies on `body { display: flex; flex-direction: column;
height: 100vh }` with `.layout { flex: 1; min-height: 0 }`. React mounts
everything one level deeper, inside `#root` — by default an unstyled block
box — which would make `.layout`'s `flex: 1` inert and dissolve every height
constraint below it. Hence one global rule:

```ts
globalStyle('#root', { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 });
```

## Why

The failure is not "slightly wrong layout" but exponential: with no definite
ancestor height, the canvas's `height: 100%` resolves to `auto` = its
intrinsic bitmap size. relaph's ResizeObserver writes bitmap attributes as
layout-size × devicePixelRatio, and those attributes ARE the intrinsic size —
so on a retina display each pass doubles the element (layout 150 → bitmap
300 → layout 300 → bitmap 600 → …). Symptoms look unrelated to the cause:
the inspector "disappears" (pushed below the fold / off-layout), the zoom
overlay (bottom-anchored) is gone, and drag-resize "does nothing" because
every frame's runaway relayout swamps it.

## Gotchas

- When a panel "disappears", check whether the *constraint chain* above it
  survived any DOM re-parenting before debugging components — the component
  logic may be entirely innocent.
- Any extra wrapper between `body` and `.layout` (portals aside) needs the
  same treatment: `flex: 1` + `min-height: 0` all the way down, or the
  `height: 100%` chain snaps again.
