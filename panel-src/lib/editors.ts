import type { EditorDef, PanelConfig } from '../types.js';

/** Editors whose app bundle registers its URL scheme itself — no Toolbox/plugin/extra install.
 *  All five share the VS Code family's path-embedded grammar. See
 *  `docs/open-in-editor-is-protocol-links-only.md`. */
export const BUILTIN_EDITORS: readonly EditorDef[] = [
  { id: 'vscode', label: 'VS Code', urlTemplate: 'vscode://file{path}:{line}:{column}' },
  { id: 'vscode-insiders', label: 'VS Code Insiders', urlTemplate: 'vscode-insiders://file{path}:{line}:{column}' },
  { id: 'cursor', label: 'Cursor', urlTemplate: 'cursor://file{path}:{line}:{column}' },
  { id: 'windsurf', label: 'Windsurf', urlTemplate: 'windsurf://file{path}:{line}:{column}' },
  { id: 'zed', label: 'Zed', urlTemplate: 'zed://file{path}:{line}:{column}' },
];

export const EDITOR_STORAGE_KEY = 'kernelee-devtools-bridge.editor';

/** Merge `/panel-config.json`'s `editors` over the builtins: same id replaces, new id appends.
 *  Malformed entries (missing id/urlTemplate) are skipped. */
export function mergeEditors(base: readonly EditorDef[], configEditors: PanelConfig['editors']): EditorDef[] {
  const merged = [...base];
  for (const entry of configEditors ?? []) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.urlTemplate !== 'string') continue;
    const editor: EditorDef = {
      id: entry.id,
      label: typeof entry.label === 'string' ? entry.label : entry.id,
      urlTemplate: entry.urlTemplate,
    };
    const at = merged.findIndex((e) => e.id === editor.id);
    if (at >= 0) merged[at] = editor;
    else merged.push(editor);
  }
  return merged;
}

/** The user's own last pick beats the repo's `defaultEditor` recommendation; either only counts
 *  if it still names a known editor id (a removed override must not leave the select pointing at
 *  nothing). */
export function pickInitialEditorId(
  editors: readonly EditorDef[],
  storedEditorId: string | null,
  configDefaultEditorId: string | null,
): string {
  const knownIds = new Set(editors.map((e) => e.id));
  for (const candidate of [storedEditorId, configDefaultEditorId]) {
    if (candidate !== null && knownIds.has(candidate)) return candidate;
  }
  return editors[0]?.id ?? BUILTIN_EDITORS[0]!.id;
}

/** Repo-relative "file:line" -> a protocol URL for the selected editor, or null when no repoRoot
 *  arrived (links need an absolute path — plain-text fallback). `{path}` keeps its slashes
 *  (encodeURI), so it works in both path-embedded and query-style templates. */
export function editorUrl(
  site: string,
  opts: { repoRoot: string | null; editors: readonly EditorDef[]; selectedEditorId: string },
): string | null {
  if (!opts.repoRoot) return null;
  const editor = opts.editors.find((e) => e.id === opts.selectedEditorId) ?? opts.editors[0];
  if (!editor) return null;
  const match = /^(.*):(\d+)$/.exec(site);
  const file = match ? match[1]! : site;
  const line = match ? match[2]! : '1';
  const absolute = `${opts.repoRoot.replace(/\/+$/, '')}/${file}`;
  return editor.urlTemplate.replaceAll('{path}', encodeURI(absolute)).replaceAll('{line}', line).replaceAll('{column}', '1');
}
