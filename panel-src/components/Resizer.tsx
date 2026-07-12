import type { PointerEvent } from 'react';
import * as styles from '../styles/Resizer.css.js';

export interface ResizerProps {
  readonly variant: 'sidebar' | 'inspector';
  readonly dragging: boolean;
  readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
}

/** The 5px drag handle between the sidebar/canvas and the canvas/inspector. Visibility (hidden
 *  when the sidebar is collapsed) and axis (col-resize vs row-resize once bottom-docked) are
 *  driven purely by CSS sibling/ancestor selectors on the sidebar's/content's own mode class —
 *  see Resizer.css.ts. */
export function Resizer({ variant, dragging, onPointerDown }: ResizerProps) {
  const base = variant === 'sidebar' ? styles.sidebarResizer : styles.inspectorResizer;
  return <div className={`${base}${dragging ? ` ${styles.dragging}` : ''}`} onPointerDown={onPointerDown} />;
}
