import { style } from '@vanilla-extract/css';

/** `.hidden { display: none !important }` — tab switching (view-wiring / view-trace) and,
 *  historically, the gear popover. `!important` is preserved: the original relied on it to beat
 *  same-specificity siblings regardless of source order. */
export const hidden = style({
  display: 'none !important',
});

/** `.layout { flex: 1; display: flex; min-height: 0 }` — the top-level row each tab's view is. */
export const layout = style({
  flex: 1,
  display: 'flex',
  minHeight: 0,
});

/** `.content { flex: 1; display: flex; min-width: 0; min-height: 0 }` — wiring view's
 *  main+resizer+inspector row. */
export const content = style({
  flex: 1,
  display: 'flex',
  minWidth: 0,
  minHeight: 0,
});

/** `.content.inspector-bottom { flex-direction: column }` — exported so sibling/descendant
 *  components (the inspector resizer, the inspector aside itself) can reference this exact class
 *  token in their own `selectors` maps, the same cross-component relationship the original CSS
 *  expressed via `.content.inspector-bottom ...` combinators. */
export const contentInspectorBottom = style({
  flexDirection: 'column',
});

/** `.main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0 }` */
export const main = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
});
