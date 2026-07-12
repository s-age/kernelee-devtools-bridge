// localStorage keys — stable identifiers: renaming one silently discards every existing
// installation's saved layout/editor prefs.
export const EDITOR_STORAGE_KEY = 'kernelee-devtools-bridge.editor';
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'kernelee-devtools-bridge.sidebar-collapsed';
export const INSPECTOR_POSITION_STORAGE_KEY = 'kernelee-devtools-bridge.inspector-position';
export const SIDEBAR_WIDTH_STORAGE_KEY = 'kernelee-devtools-bridge.sidebar-width';
export const INSPECTOR_WIDTH_STORAGE_KEY = 'kernelee-devtools-bridge.inspector-width';
export const INSPECTOR_HEIGHT_STORAGE_KEY = 'kernelee-devtools-bridge.inspector-height';

/** Every localStorage read/write is best-effort: a denied/absent storage (private mode, strict
 *  cookie settings, ...) must degrade to tab-local behavior, never throw into the caller. */
export function readStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage denied — the pick still holds for this tab
  }
}

/** `null` = the stylesheet's default; persisted as `removeItem`, not the string `"null"`. */
export function saveLayoutPref(key: string, value: number | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    // storage denied — the pick still holds for this tab
  }
}

export function readStoredInt(key: string): number | null {
  const raw = readStorageItem(key);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export const clampSize = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));
