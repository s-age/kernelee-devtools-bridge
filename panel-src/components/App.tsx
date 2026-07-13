import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BridgeMessage, CardSize, EditorDef, IndexJoin, PanelConfig, StageDescriptor, TabId, WiringEndpoint, WiringGraphDocument } from '../types.js';
import { BUILTIN_EDITORS, EDITOR_STORAGE_KEY, editorUrl as buildEditorUrl, mergeEditors, pickInitialEditorId } from '../lib/editors.js';
import { buildIndexJoin, emptyIndexJoin } from '../lib/indexJoin.js';
import { DEFAULT_PART_COLORS } from '../lib/graph.js';
import { buildForest } from '../lib/trace.js';
import { readStorageItem, writeStorageItem } from '../lib/storage.js';
import { useLayoutPrefs } from '../hooks/useLayoutPrefs.js';
import { useTracePipeline } from '../hooks/useTracePipeline.js';
import { Header, type WsStatus } from './Header.js';
import { Sidebar } from './Sidebar.js';
import { Resizer } from './Resizer.js';
import { Toolbar } from './Toolbar.js';
import { WiringCanvas } from './WiringCanvas.js';
import { InspectorPanel } from './InspectorPanel.js';
import { TimelineTree } from './TimelineTree.js';
import { TraceInspector } from './TraceInspector.js';
import * as appStyles from '../styles/App.css.js';
import * as sharedStyles from '../styles/shared.css.js';
import * as timelineStyles from '../styles/Timeline.css.js';

const EMPTY_DOC: WiringGraphDocument = { schemaVersion: 5, endpoints: [], symbols: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] };

export function App() {
  // MARK: - Wiring-graph / catalog state
  const [currentDoc, setCurrentDoc] = useState<WiringGraphDocument>(EMPTY_DOC);
  const [usingSample, setUsingSample] = useState(true);
  const [selectedEndpointKey, setSelectedEndpointKey] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageDescriptor | null>(null);
  const [selectedStagePath, setSelectedStagePath] = useState<string | null>(null);
  const [selectedEntryEndpoint, setSelectedEntryEndpoint] = useState<WiringEndpoint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mainLineOnly, setMainLineOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cardSize, setCardSize] = useState<CardSize>('fit-content');
  const [navigationHistory, setNavigationHistory] = useState<readonly string[]>([]);

  // MARK: - Index join (kernel-introspect) + panel-config-derived state
  const [indexJoin, setIndexJoin] = useState<IndexJoin>(() => emptyIndexJoin());
  const [partColors, setPartColors] = useState<Readonly<Record<string, string>>>(DEFAULT_PART_COLORS);
  const [repoRoot, setRepoRoot] = useState<string | null>(null);
  const [editors, setEditors] = useState<readonly EditorDef[]>(BUILTIN_EDITORS);
  const [selectedEditorId, setSelectedEditorId] = useState<string>(BUILTIN_EDITORS[0]!.id);

  // MARK: - WS / tabs
  const [wsStatus, setWsStatus] = useState<WsStatus>('idle');
  const [activeTab, setActiveTab] = useState<TabId>('wiring');

  // MARK: - Trace pipeline (rAF-coalesced, hidden-tab-skipping — see useTracePipeline)
  const trace = useTracePipeline();

  // MARK: - Layout prefs (sidebar/inspector dock+size, drag-resize)
  const sidebarElRef = useRef<HTMLElement | null>(null);
  const inspectorElRef = useRef<HTMLElement | null>(null);
  const layout = useLayoutPrefs(sidebarElRef, inspectorElRef);

  // MARK: - Derived values
  const currentEndpoint = useMemo(
    () => currentDoc.endpoints.find((e) => e.key === selectedEndpointKey) ?? null,
    [currentDoc, selectedEndpointKey],
  );
  const endpointKeys = useMemo(() => new Set(currentDoc.endpoints.map((e) => e.key)), [currentDoc]);
  const editorLabel = (editors.find((e) => e.id === selectedEditorId) ?? editors[0])?.label ?? '';
  const editorUrl = useCallback(
    (site: string) => buildEditorUrl(site, { repoRoot, editors, selectedEditorId }),
    [repoRoot, editors, selectedEditorId],
  );

  // MARK: - Catalog application
  const applyCatalog = useCallback((doc: WiringGraphDocument, sample: boolean) => {
    setCurrentDoc(doc);
    setUsingSample(sample);
    setSelectedStage(null);
    setSelectedStagePath(null);
    setSelectedEntryEndpoint(null);
    const keys = new Set(doc.endpoints.map((e) => e.key));
    setNavigationHistory((prev) => prev.filter((k) => keys.has(k)));
    setSelectedEndpointKey((prev) => {
      let key = prev;
      if (key && !keys.has(key)) key = null;
      // First load only: auto-select so the demo isn't a blank canvas.
      if (key === null && sample && doc.endpoints.length > 0) key = doc.endpoints[0]!.key;
      return key;
    });
  }, []);

  // MARK: - Navigation
  const selectEndpoint = useCallback(
    (key: string, opts?: { viaJump: boolean }) => {
      if (opts?.viaJump && selectedEndpointKey) {
        setNavigationHistory((prev) => [...prev, selectedEndpointKey]);
      }
      setSelectedEndpointKey(key);
      setSelectedStage(null);
      setSelectedStagePath(null);
      setSelectedEntryEndpoint(null);
    },
    [selectedEndpointKey],
  );

  const goBack = useCallback(() => {
    if (navigationHistory.length === 0) return;
    const previous = navigationHistory[navigationHistory.length - 1]!;
    setNavigationHistory((prev) => prev.slice(0, -1));
    setSelectedEndpointKey(previous);
    setSelectedStage(null);
    setSelectedStagePath(null);
    setSelectedEntryEndpoint(null);
  }, [navigationHistory]);

  const onSelectStage = useCallback((stage: StageDescriptor, path: string) => {
    setSelectedStage(stage);
    setSelectedStagePath(path);
    setSelectedEntryEndpoint(null);
  }, []);

  const onSelectEntry = useCallback((endpoint: WiringEndpoint) => {
    setSelectedEntryEndpoint(endpoint);
    setSelectedStage(null);
    setSelectedStagePath(null);
  }, []);

  const onEditorChange = useCallback((id: string) => {
    setSelectedEditorId(id);
    writeStorageItem(EDITOR_STORAGE_KEY, id);
  }, []);

  const onSelectTab = useCallback(
    (tab: TabId) => {
      trace.setActiveTabHint(tab);
      setActiveTab(tab);
    },
    [trace],
  );

  // MARK: - Boot + WS lifecycle
  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      ws = new WebSocket(`ws://${location.host}/ws`);
      ws.addEventListener('open', () => {
        if (cancelled) return;
        setWsStatus('connected');
      });
      ws.addEventListener('close', () => {
        if (cancelled) return;
        setWsStatus('reconnecting');
        reconnectTimer = setTimeout(connect, 1000);
      });
      ws.addEventListener('message', (event) => {
        if (cancelled) return;
        const message = JSON.parse(event.data as string) as BridgeMessage;
        if (message.type === 'catalog') {
          applyCatalog(message.doc, false);
        } else if (message.type === 'trace') {
          trace.pushTraceEntry(message.entry);
        }
      });
    }

    async function boot() {
      // Panel config (color scheme / repoRoot / editors) + part-kind index, before the first
      // catalog render so the first paint is already colored. Both degrade silently.
      let configDefaultEditor: string | null = null;
      let nextPartColors = DEFAULT_PART_COLORS;
      let nextRepoRoot: string | null = null;
      let nextEditors: EditorDef[] = [...BUILTIN_EDITORS];
      try {
        const config = (await (await fetch('/panel-config.json')).json()) as PanelConfig;
        if (config && typeof config === 'object') {
          if (config.partColors) nextPartColors = { ...DEFAULT_PART_COLORS, ...config.partColors };
          if (typeof config.repoRoot === 'string') nextRepoRoot = config.repoRoot;
          if (Array.isArray(config.editors)) nextEditors = mergeEditors(nextEditors, config.editors);
          if (typeof config.defaultEditor === 'string') configDefaultEditor = config.defaultEditor;
        }
      } catch {
        // defaults stay
      }
      const storedEditor = readStorageItem(EDITOR_STORAGE_KEY);
      const chosenEditorId = pickInitialEditorId(nextEditors, storedEditor, configDefaultEditor);
      if (cancelled) return;
      setPartColors(nextPartColors);
      setRepoRoot(nextRepoRoot);
      setEditors(nextEditors);
      setSelectedEditorId(chosenEditorId);

      try {
        let res = await fetch('/introspect/index.json');
        if (!res.ok) res = await fetch('/sample-index.json');
        if (res.ok) {
          const join = buildIndexJoin(await res.json());
          if (!cancelled) setIndexJoin(join);
        }
      } catch {
        // uncolored (all-'pipeline') is a working state
      }

      try {
        const res = await fetch('/sample-catalog.json');
        const sample = (await res.json()) as WiringGraphDocument;
        if (!cancelled) applyCatalog(sample, true);
      } catch {
        // still wire up an empty UI rather than leaving nothing rendered — React already does.
      }

      try {
        const res = await fetch('/sample-trace.json');
        const entries = await res.json();
        if (!cancelled) trace.loadSampleTrace(entries);
      } catch {
        if (!cancelled) trace.loadSampleTraceFailed();
      }

      if (!cancelled) connect();
    }

    void boot();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
    // Boot + WS lifecycle run exactly once — `applyCatalog`/`trace.*` are stable (useCallback
    // with no reactive deps, or refs internally), so this intentionally-empty deps array does
    // not stale-close over anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceText = usingSample ? 'showing sample data' : 'live data received';
  const forest = useMemo(() => (activeTab === 'trace' ? buildForest(trace.traceEntries) : []), [activeTab, trace.traceEntries]);

  return (
    <>
      <Header activeTab={activeTab} onSelectTab={onSelectTab} wsStatus={wsStatus} sourceText={sourceText} />
      <div className={`${appStyles.layout}${activeTab !== 'wiring' ? ` ${appStyles.hidden}` : ''}`}>
        <Sidebar
          asideRef={sidebarElRef}
          collapsed={layout.sidebarCollapsed}
          style={layout.sidebarStyle}
          endpoints={currentDoc.endpoints}
          selectedEndpointKey={selectedEndpointKey}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectEndpoint={(key) => selectEndpoint(key, { viaJump: false })}
          onToggleCollapsed={layout.toggleSidebarCollapsed}
        />
        <Resizer variant="sidebar" dragging={layout.sidebarDragging} onPointerDown={layout.onSidebarResizerPointerDown} />
        <div className={`${appStyles.content}${layout.inspectorPosition === 'bottom' ? ` ${appStyles.contentInspectorBottom}` : ''}`}>
          <div className={appStyles.main}>
            <Toolbar
              backDisabled={navigationHistory.length === 0}
              onBack={goBack}
              mainLineOnly={mainLineOnly}
              onToggleMainLineOnly={() => setMainLineOnly((v) => !v)}
              collapsed={collapsed}
              onToggleCollapsed={() => setCollapsed((v) => !v)}
              cardSize={cardSize}
              onSetCardSize={setCardSize}
            />
            <WiringCanvas
              endpoint={currentEndpoint}
              mainLineOnly={mainLineOnly}
              collapsed={collapsed}
              cardSize={cardSize}
              selectedStage={selectedStage}
              selectedEntryEndpoint={selectedEntryEndpoint}
              partColors={partColors}
              partKindByHandler={indexJoin.kinds}
              onSelectStage={onSelectStage}
              onSelectEntry={onSelectEntry}
            />
          </div>
          <Resizer variant="inspector" dragging={layout.inspectorDragging} onPointerDown={layout.onInspectorResizerPointerDown} />
          <InspectorPanel
            asideRef={inspectorElRef}
            style={layout.inspectorStyle}
            editors={editors}
            selectedEditorId={selectedEditorId}
            onEditorChange={onEditorChange}
            inspectorPosition={layout.inspectorPosition}
            onSetInspectorPosition={layout.setInspectorPosition}
            selectedStage={selectedStage}
            selectedStagePath={selectedStagePath}
            selectedEntryEndpoint={selectedEntryEndpoint}
            indexEndpointByKey={indexJoin.endpoints}
            indexSymbolById={indexJoin.symbols}
            handlerSiteByName={indexJoin.sites}
            wireSiteByPath={indexJoin.wireSites}
            editorUrl={editorUrl}
            endpointKeys={endpointKeys}
            onJumpToEndpoint={(key) => selectEndpoint(key, { viaJump: true })}
          />
        </div>
      </div>
      <div className={`${appStyles.layout}${activeTab !== 'trace' ? ` ${appStyles.hidden}` : ''}`}>
        <div className={appStyles.main}>
          <div className={sharedStyles.toolbar}>
            <span>{`${trace.traceEntries.length} / 300 entries${trace.usingSampleTrace ? ' (sample)' : ''}`}</span>
            <span className={sharedStyles.spacer} />
            <button onClick={trace.clearTrace}>Clear</button>
          </div>
          <div className={timelineStyles.wrap}>
            {activeTab === 'trace' && (
              <TimelineTree
                forest={forest}
                collapsedSpanIds={trace.collapsedSpanIds}
                selectedTraceEntry={trace.selectedTraceEntry}
                onSelectEntry={trace.selectTraceEntry}
                onToggleCollapse={trace.toggleSpanCollapse}
              />
            )}
          </div>
        </div>
        <TraceInspector entry={trace.selectedTraceEntry} />
      </div>
    </>
  );
}
