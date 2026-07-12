import { style } from '@vanilla-extract/css';
import { contentInspectorBottom } from './App.css.js';
import { sidebarCollapsed } from './Sidebar.css.js';

/** `.resizer { ... }` + `.resizer:hover { background: #93c5fd }` */
const base = style({
  flexShrink: 0,
  width: '5px',
  cursor: 'col-resize',
  background: 'transparent',
  transition: 'background 0.15s',
  zIndex: 5,
  ':hover': {
    background: '#93c5fd',
  },
});

/** `.resizer.dragging { background: #93c5fd }` — joined conditionally by the Resizer component
 *  (it owns its own drag-in-progress boolean), rather than expressed as a compound selector. */
export const dragging = style({
  background: '#93c5fd',
});

/** `.sidebar.collapsed + .resizer { display: none }` — the sidebar resizer variant, keyed off
 *  Sidebar.css.ts's exported `sidebarCollapsed` token so the DOM adjacency (resizer is the
 *  sidebar aside's very next sibling) drives visibility exactly as the original sibling
 *  combinator did. */
export const sidebarResizer = style([
  base,
  {
    selectors: {
      [`${sidebarCollapsed} + &`]: { display: 'none' },
    },
  },
]);

/** `.content.inspector-bottom #inspector-resizer { width: auto; height: 5px; cursor: row-resize }`
 *  — the inspector resizer variant, keyed off App.css.ts's exported `contentInspectorBottom`
 *  token (an ancestor of this element once bottom-docked). */
export const inspectorResizer = style([
  base,
  {
    selectors: {
      [`${contentInspectorBottom} &`]: { width: 'auto', height: '5px', cursor: 'row-resize' },
    },
  },
]);
