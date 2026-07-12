import { useEffect, useRef } from 'react';
import type { StageDescriptor, WiringEndpoint } from '../types.js';
import { DEFAULT_PART_COLORS, buildEndpointTree, emptyTree, type BuildTreeCtx } from '../lib/graph.js';
import * as styles from '../styles/WiringCanvas.css.js';

export interface WiringCanvasProps {
  readonly endpoint: WiringEndpoint | null;
  readonly mainLineOnly: boolean;
  readonly collapsed: boolean;
  readonly cardSize: BuildTreeCtx['cardSize'];
  readonly selectedStage: StageDescriptor | null;
  readonly selectedEntryEndpoint: WiringEndpoint | null;
  readonly partColors: Readonly<Record<string, string>>;
  readonly partKindByHandler: ReadonlyMap<string, string>;
  readonly onSelectStage: (stage: StageDescriptor, path: string) => void;
  readonly onSelectEntry: (endpoint: WiringEndpoint) => void;
}

interface StructuralKey {
  readonly endpoint: WiringEndpoint | null;
  readonly mainLineOnly: boolean;
  readonly collapsed: boolean;
  readonly cardSize: BuildTreeCtx['cardSize'];
}

function sameStructural(a: StructuralKey | undefined, b: StructuralKey): boolean {
  return !!a && a.endpoint === b.endpoint && a.mainLineOnly === b.mainLineOnly && a.collapsed === b.collapsed && a.cardSize === b.cardSize;
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
  partColors,
  partKindByHandler,
  onSelectStage,
  onSelectEntry,
}: WiringCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<RelaphRelationGraph | null>(null);
  const actionsRef = useRef({ onSelectStage, onSelectEntry });
  const prevStructuralRef = useRef<StructuralKey | undefined>(undefined);

  useEffect(() => {
    actionsRef.current = { onSelectStage, onSelectEntry };
  });

  // Create the graph once. `onNodeClick` is registered here and never re-registered, so it must
  // dispatch through `actionsRef` (kept fresh by the effect above) rather than closing over
  // whatever `onSelectStage`/`onSelectEntry` happened to be at mount time.
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
        const data = node.data as { kind?: string; stage?: StageDescriptor; endpoint?: WiringEndpoint } | undefined;
        if (data?.kind === 'stage' && data.stage) {
          actionsRef.current.onSelectStage(data.stage, node.id);
        } else if (data?.kind === 'entry' && data.endpoint) {
          actionsRef.current.onSelectEntry(data.endpoint);
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
    const structural: StructuralKey = { endpoint, mainLineOnly, collapsed, cardSize };
    const isStructural = !sameStructural(prevStructuralRef.current, structural);
    const ctx: BuildTreeCtx = { collapsed, mainLineOnly, cardSize, selectedStage, selectedEntryEndpoint, partColors, partKindByHandler };
    const tree = endpoint ? buildEndpointTree(endpoint, ctx) : emptyTree();
    if (isStructural) {
      graph.setData(tree);
    } else {
      const { scale, tx, ty } = graph.viewport;
      graph.setData(tree);
      graph.viewport.setScale(scale);
      graph.viewport.setTranslate(tx, ty);
    }
    prevStructuralRef.current = structural;
  }, [endpoint, mainLineOnly, collapsed, cardSize, selectedStage, selectedEntryEndpoint, partColors, partKindByHandler]);

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
    </div>
  );
}
