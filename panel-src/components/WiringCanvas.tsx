import { useEffect, useRef } from 'react';
import type { IndexGate, IndexVerbEmission, StageDescriptor, WiringEndpoint, WiringGuardEntry } from '../types.js';
import { DEFAULT_PART_COLORS, buildEndpointTree, canvasOptionsFor, emptyTree, type BuildTreeCtx, type SelectedGate } from '../lib/graph.js';
import * as styles from '../styles/WiringCanvas.css.js';

export interface WiringCanvasProps {
  readonly endpoint: WiringEndpoint | null;
  readonly mainLineOnly: boolean;
  readonly collapsed: boolean;
  readonly cardSize: BuildTreeCtx['cardSize'];
  readonly selectedStage: StageDescriptor | null;
  readonly selectedEntryEndpoint: WiringEndpoint | null;
  readonly selectedGate: SelectedGate | null;
  readonly partColors: Readonly<Record<string, string>>;
  readonly partKindByHandler: ReadonlyMap<string, string>;
  /** canvas node id -> that stage's `verbEmissions` (`IndexJoin.verbEmissions`) — threaded into
   *  `BuildTreeCtx` so `buildChain` can attach abort/fail chips (see `lib/graph.ts`'s
   *  `buildVerbChips`). */
  readonly verbEmissionsByNodeId: ReadonlyMap<string, readonly IndexVerbEmission[]>;
  /** gateId -> the index's gates[] entry (`IndexJoin.gates`) — the same map `InspectorPanel`
   *  already threads for source links, ALSO needed here for a gate's own `verbEmissions`
   *  (`buildGateNode` reads `.verbEmissions` off the entry). */
  readonly indexGateById: ReadonlyMap<string, IndexGate>;
  /** The selected endpoint's own guard entry (`guards[].targetId === endpoint.key`), or `null` when
   *  no `guard()` call ever named it — looked up by the caller (`App.tsx`'s `guardsByTarget`). */
  readonly guardEntry: WiringGuardEntry | null;
  /** `guards[].targetId` entries matching no catalogued endpoint — never dropped, rendered as the
   *  always-visible "unanchored" overlay regardless of which endpoint is selected. */
  readonly unanchoredGuards: readonly WiringGuardEntry[];
  /** The catalog's own endpoint key set — threaded into `BuildTreeCtx` so `buildChain` can bake
   *  each divert reference node's `resolved` flag in at build time (see `lib/graph.ts`'s
   *  `buildDivertNodes`). */
  readonly endpointKeys: ReadonlySet<string>;
  readonly onSelectStage: (stage: StageDescriptor, path: string) => void;
  readonly onSelectEntry: (endpoint: WiringEndpoint) => void;
  readonly onSelectGate: (gate: SelectedGate) => void;
  /** Jump to a divert target's own endpoint — same navigation path `StageInspector`'s resolved
   *  `divertsTo` chips already use (`App.tsx`'s `selectEndpoint(key, { viaJump: true })`). */
  readonly onJumpToEndpoint: (key: string) => void;
}

interface StructuralKey {
  readonly endpoint: WiringEndpoint | null;
  readonly mainLineOnly: boolean;
  readonly collapsed: boolean;
  readonly cardSize: BuildTreeCtx['cardSize'];
  readonly guardEntry: WiringGuardEntry | null;
}

function sameStructural(a: StructuralKey | undefined, b: StructuralKey): boolean {
  return (
    !!a &&
    a.endpoint === b.endpoint &&
    a.mainLineOnly === b.mainLineOnly &&
    a.collapsed === b.collapsed &&
    a.cardSize === b.cardSize &&
    a.guardEntry === b.guardEntry
  );
}

/**
 * The relaph-hosted canvas + part legend + zoom overlay. `RelationGraph` is created exactly once
 * (empty-deps effect), so `onNodeClick` must read fresh selection-setters via a ref rather than
 * closing over the first render's props. A second effect re-`setData`s whenever the
 * tree-affecting props change; it preserves the current pan/zoom when ONLY the selection changed
 * (a plain highlight, not a structural change) and lets `setData`'s own unconditional `fit()`
 * stand otherwise (endpoint switch, mainLineOnly/collapsed/cardSize toggle, or a fresh catalog).
 */
export function WiringCanvas({
  endpoint,
  mainLineOnly,
  collapsed,
  cardSize,
  selectedStage,
  selectedEntryEndpoint,
  selectedGate,
  partColors,
  partKindByHandler,
  verbEmissionsByNodeId,
  indexGateById,
  guardEntry,
  unanchoredGuards,
  endpointKeys,
  onSelectStage,
  onSelectEntry,
  onSelectGate,
  onJumpToEndpoint,
}: WiringCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<RelaphRelationGraph | null>(null);
  const actionsRef = useRef({ onSelectStage, onSelectEntry, onSelectGate, onJumpToEndpoint });
  const prevStructuralRef = useRef<StructuralKey | undefined>(undefined);

  useEffect(() => {
    actionsRef.current = { onSelectStage, onSelectEntry, onSelectGate, onJumpToEndpoint };
  });

  // Create the graph once per mode (cardSize changes recreate it). relaph's own options
  // (`margin`/`connector.labelMaxWidth`) are constructor-only, so a mode switch cannot just
  // `setData` on the existing instance — it must destroy and rebuild via `canvasOptionsFor`. Reset
  // `prevStructuralRef` on every (re)creation so the very first `setData` after a rebuild always
  // runs the unconditional (fit-triggering) branch below, never the pan/zoom-preserving one.
  // `onNodeClick` is registered here and never re-registered per instance, so it must dispatch
  // through `actionsRef` (kept fresh by the effect above) rather than closing over whatever
  // `onSelectStage`/`onSelectEntry`/`onSelectGate` happened to be at creation time.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const graph = new window.Relaph.RelationGraph(canvas, {
      ...canvasOptionsFor(cardSize),
      minScale: 0.5,
      maxScale: 2,
      labelOverflow: 'truncate',
      labelPadding: { x: 12, y: 10 },
      onNodeClick: (node) => {
        const data = node.data as
          | {
              kind?: string;
              stage?: StageDescriptor;
              endpoint?: WiringEndpoint;
              targetId?: string;
              gateId?: string;
              key?: string;
              resolved?: boolean;
            }
          | undefined;
        if (data?.kind === 'stage' && data.stage) {
          actionsRef.current.onSelectStage(data.stage, node.id);
        } else if (data?.kind === 'entry' && data.endpoint) {
          actionsRef.current.onSelectEntry(data.endpoint);
        } else if (data?.kind === 'gate' && data.targetId && data.gateId) {
          actionsRef.current.onSelectGate({ targetId: data.targetId, gateId: data.gateId });
        } else if (data?.kind === 'divertTarget' && data.resolved === true && data.key) {
          // Unresolved (no matching endpoint) stays visible but non-jumpable — same "report,
          // don't hide" stance as the unanchored-guards overlay below.
          actionsRef.current.onJumpToEndpoint(data.key);
        }
      },
    });
    graphRef.current = graph;
    prevStructuralRef.current = undefined;
    return () => {
      graph.destroy();
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardSize]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const structural: StructuralKey = { endpoint, mainLineOnly, collapsed, cardSize, guardEntry };
    const isStructural = !sameStructural(prevStructuralRef.current, structural);
    const ctx: BuildTreeCtx = {
      collapsed,
      mainLineOnly,
      cardSize,
      selectedStage,
      selectedEntryEndpoint,
      selectedGate,
      partColors,
      partKindByHandler,
      endpointKeys,
      verbEmissionsByNodeId,
      indexGateById,
    };
    const { root: tree, joinEdges } = endpoint
      ? buildEndpointTree(endpoint, ctx, guardEntry)
      : { root: emptyTree(), joinEdges: [] as RelaphJoinEdge[] };
    if (isStructural) {
      graph.setData(tree, joinEdges);
    } else {
      const { scale, tx, ty } = graph.viewport;
      graph.setData(tree, joinEdges);
      graph.viewport.setScale(scale);
      graph.viewport.setTranslate(tx, ty);
    }
    prevStructuralRef.current = structural;
  }, [
    endpoint,
    mainLineOnly,
    collapsed,
    cardSize,
    selectedStage,
    selectedEntryEndpoint,
    selectedGate,
    partColors,
    partKindByHandler,
    verbEmissionsByNodeId,
    indexGateById,
    guardEntry,
    endpointKeys,
  ]);

  const gateColor = partColors.gate ?? DEFAULT_PART_COLORS.gate;

  return (
    <div className={styles.canvasWrap}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <span className={`${styles.legend} ${styles.canvasOverlay} ${styles.legendOverlay}`}>
        {Object.keys(DEFAULT_PART_COLORS).map((kind) => (
          <span key={kind} className={styles.legendChip}>
            <span className={styles.legendSwatch} style={{ background: partColors[kind] ?? DEFAULT_PART_COLORS[kind] }} />
            {kind}
          </span>
        ))}
      </span>
      <div className={`${styles.canvasOverlay} ${styles.zoomOverlay}`}>
        <button onClick={() => graphRef.current?.zoomBy(1 / 1.25)}>－</button>
        <button onClick={() => graphRef.current?.zoomBy(1.25)}>＋</button>
        <button onClick={() => graphRef.current?.fit()}>Fit</button>
      </div>
      {/* Never dropped: a guard target absent from every catalogued endpoint still shows up here,
          regardless of which endpoint (if any) is currently selected — see `unanchoredGuards`'s own
          doc comment (lib/graph.ts) on why this can't just live inside a per-endpoint tree. */}
      <div className={`${styles.canvasOverlay} ${styles.unanchoredOverlay}`}>
        {unanchoredGuards.length > 0 && (
          <>
            <span className={styles.unanchoredTitle}>Unanchored guard targets</span>
            {unanchoredGuards.map((g) => (
              <div key={g.targetId} className={styles.unanchoredChip} title="guard() target matches no catalogued endpoint key or referenced symbol — reported, not judged">
                <span className={styles.unanchoredChipTarget}>{g.targetId}</span>
                <span className={styles.unanchoredChipGates}>
                  {g.gateIds.map((gateId) => (
                    <span
                      key={gateId}
                      className={styles.unanchoredGateBadge}
                      style={{ background: gateColor }}
                      onClick={() => onSelectGate({ targetId: g.targetId, gateId })}
                    >
                      {gateId}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
