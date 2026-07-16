import { useEffect, useRef } from 'react';
import type { StageDescriptor, WiringEndpoint, WiringGuardEntry } from '../types.js';
import { DEFAULT_PART_COLORS, buildEndpointTree, emptyTree, type BuildTreeCtx, type SelectedGate } from '../lib/graph.js';
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
  /** The selected endpoint's own guard entry (`guards[].targetId === endpoint.key`), or `null` when
   *  no `guard()` call ever named it — looked up by the caller (`App.tsx`'s `guardsByTarget`). */
  readonly guardEntry: WiringGuardEntry | null;
  /** `guards[].targetId` entries matching no catalogued endpoint — never dropped, rendered as the
   *  always-visible "unanchored" overlay regardless of which endpoint is selected. */
  readonly unanchoredGuards: readonly WiringGuardEntry[];
  readonly onSelectStage: (stage: StageDescriptor, path: string) => void;
  readonly onSelectEntry: (endpoint: WiringEndpoint) => void;
  readonly onSelectGate: (gate: SelectedGate) => void;
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
  guardEntry,
  unanchoredGuards,
  onSelectStage,
  onSelectEntry,
  onSelectGate,
}: WiringCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<RelaphRelationGraph | null>(null);
  const actionsRef = useRef({ onSelectStage, onSelectEntry, onSelectGate });
  const prevStructuralRef = useRef<StructuralKey | undefined>(undefined);

  useEffect(() => {
    actionsRef.current = { onSelectStage, onSelectEntry, onSelectGate };
  });

  // Create the graph once. `onNodeClick` is registered here and never re-registered, so it must
  // dispatch through `actionsRef` (kept fresh by the effect above) rather than closing over
  // whatever `onSelectStage`/`onSelectEntry`/`onSelectGate` happened to be at mount time.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const graph = new window.Relaph.RelationGraph(canvas, {
      margin: { node: 24, rank: 56 },
      minScale: 0.5,
      maxScale: 2,
      labelOverflow: 'truncate',
      labelPadding: { x: 12, y: 10 },
      onNodeClick: (node) => {
        const data = node.data as
          | { kind?: string; stage?: StageDescriptor; endpoint?: WiringEndpoint; targetId?: string; gateId?: string }
          | undefined;
        if (data?.kind === 'stage' && data.stage) {
          actionsRef.current.onSelectStage(data.stage, node.id);
        } else if (data?.kind === 'entry' && data.endpoint) {
          actionsRef.current.onSelectEntry(data.endpoint);
        } else if (data?.kind === 'gate' && data.targetId && data.gateId) {
          actionsRef.current.onSelectGate({ targetId: data.targetId, gateId: data.gateId });
        }
      },
    });
    graphRef.current = graph;
    return () => {
      graph.destroy();
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [endpoint, mainLineOnly, collapsed, cardSize, selectedStage, selectedEntryEndpoint, selectedGate, partColors, partKindByHandler, guardEntry]);

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
