import { useCallback, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import type { InspectorPosition } from '../types.js';
import {
  INSPECTOR_HEIGHT_STORAGE_KEY,
  INSPECTOR_POSITION_STORAGE_KEY,
  INSPECTOR_WIDTH_STORAGE_KEY,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSize,
  readStorageItem,
  readStoredInt,
  saveLayoutPref,
  writeStorageItem,
} from '../lib/storage.js';

/**
 * Sidebar collapse/width + inspector dock/width/height, drag-resized via pointer capture. See
 * `docs/dragged-inline-sizes-yield-to-mode-classes.md`: a dragged size is an inline style px value, a
 * layout mode is a class; `sidebarStyle`/`inspectorStyle` below encode "only the active axis gets
 * an inline size" as *derived* state (no imperative clear-on-toggle needed — the class + inline
 * style are simply recomputed together every render).
 */
export function useLayoutPrefs(
  sidebarElRef: RefObject<HTMLElement | null>,
  inspectorElRef: RefObject<HTMLElement | null>,
) {
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => readStorageItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1');
  const [inspectorPosition, setInspectorPositionState] = useState<InspectorPosition>(
    () => (readStorageItem(INSPECTOR_POSITION_STORAGE_KEY) === 'bottom' ? 'bottom' : 'right'),
  );
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(() => readStoredInt(SIDEBAR_WIDTH_STORAGE_KEY));
  const [inspectorWidth, setInspectorWidth] = useState<number | null>(() => readStoredInt(INSPECTOR_WIDTH_STORAGE_KEY));
  const [inspectorHeight, setInspectorHeight] = useState<number | null>(() => readStoredInt(INSPECTOR_HEIGHT_STORAGE_KEY));
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const [inspectorDragging, setInspectorDragging] = useState(false);

  // Only the active axis carries an inline size: a collapsed sidebar's dragged width must not
  // survive (it would beat `.sidebar.collapsed { width: auto }`); a right-docked inspector keeps
  // only width, a bottom-docked one only height.
  const sidebarStyle: CSSProperties | undefined =
    !sidebarCollapsed && sidebarWidth !== null ? { width: `${sidebarWidth}px` } : undefined;
  const inspectorStyle: CSSProperties | undefined =
    inspectorPosition === 'bottom'
      ? inspectorHeight !== null
        ? { height: `${inspectorHeight}px` }
        : undefined
      : inspectorWidth !== null
        ? { width: `${inspectorWidth}px` }
        : undefined;

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      writeStorageItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const setInspectorPosition = useCallback((position: InspectorPosition) => {
    setInspectorPositionState(position);
    writeStorageItem(INSPECTOR_POSITION_STORAGE_KEY, position);
  }, []);

  /** Pointer-captured drag on the sidebar/inspector dividers: `pointerdown` snapshots the anchor
   *  (reading the live rect), `pointermove` applies
   *  the live clamped size, `pointerup`/`pointercancel` persists once. Capture keeps the drag
   *  alive even when the pointer outruns the 5px handle. */
  const onSidebarResizerPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault(); // no text selection while dragging
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      setSidebarDragging(true);
      const originX = event.clientX;
      const originWidth = sidebarElRef.current?.getBoundingClientRect().width ?? 260;
      let latestWidth = originWidth;
      const onMove = (ev: globalThis.PointerEvent) => {
        latestWidth = Math.round(clampSize(originWidth + (ev.clientX - originX), 140, 520));
        setSidebarWidth(latestWidth);
      };
      const finish = () => {
        setSidebarDragging(false);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        saveLayoutPref(SIDEBAR_WIDTH_STORAGE_KEY, latestWidth);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    },
    [sidebarElRef],
  );

  const onInspectorResizerPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      setInspectorDragging(true);
      const originX = event.clientX;
      const originY = event.clientY;
      const rect = inspectorElRef.current?.getBoundingClientRect();
      const originWidth = rect?.width ?? 340;
      const originHeight = rect?.height ?? 260;
      const bottom = inspectorPosition === 'bottom';
      let latestWidth = originWidth;
      let latestHeight = originHeight;
      const onMove = (ev: globalThis.PointerEvent) => {
        if (bottom) {
          latestHeight = Math.round(clampSize(originHeight - (ev.clientY - originY), 120, window.innerHeight - 160));
          setInspectorHeight(latestHeight);
        } else {
          latestWidth = Math.round(clampSize(originWidth - (ev.clientX - originX), 220, window.innerWidth - 420));
          setInspectorWidth(latestWidth);
        }
      };
      const finish = () => {
        setInspectorDragging(false);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        if (bottom) saveLayoutPref(INSPECTOR_HEIGHT_STORAGE_KEY, latestHeight);
        else saveLayoutPref(INSPECTOR_WIDTH_STORAGE_KEY, latestWidth);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    },
    [inspectorElRef, inspectorPosition],
  );

  return {
    sidebarCollapsed,
    toggleSidebarCollapsed,
    inspectorPosition,
    setInspectorPosition,
    sidebarStyle,
    inspectorStyle,
    sidebarDragging,
    inspectorDragging,
    onSidebarResizerPointerDown,
    onInspectorResizerPointerDown,
  };
}
