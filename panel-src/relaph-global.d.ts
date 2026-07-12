// Minimal ambient typing for `window.Relaph`, vendored at /vendor/relaph.global.js and loaded via
// a plain <script> tag (not an ES import — see index.html) before this bundle runs. Only the
// surface the panel actually calls is declared; everything else is `any`. Mirrors relaph's own
// `dist/index.d.ts` (RelationGraph / GraphNode / Viewport) closely enough to typecheck call sites,
// without taking a compile-time dependency on the `relaph` package from this browser bundle.

export {};

declare global {
  interface RelaphGraphNode {
    id: string;
    label?: string;
    width?: number | 'fit-content';
    height?: number | 'fit-content';
    direction?: 'top' | 'right' | 'bottom' | 'left';
    baseline?: 'start' | 'center' | 'end';
    style?: {
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      textColor?: string;
      borderRadius?: number;
      font?: string;
    };
    data?: unknown;
    children?: RelaphGraphNode[];
  }

  interface RelaphViewport {
    scale: number;
    tx: number;
    ty: number;
    setScale(scale: number): void;
    setTranslate(tx: number, ty: number): void;
  }

  interface RelaphRelationGraphOptions {
    margin?: { node?: number; rank?: number };
    minScale?: number;
    maxScale?: number;
    labelOverflow?: 'visible' | 'truncate';
    labelPadding?: { x?: number; y?: number };
    onNodeClick?: (node: RelaphGraphNode, event: PointerEvent) => void;
    onBackgroundClick?: (world: { x: number; y: number }, event: PointerEvent) => void;
  }

  interface RelaphRelationGraph {
    setData(root: RelaphGraphNode): void;
    refresh(): void;
    fit(padding?: number): void;
    zoomBy(factor: number): void;
    readonly viewport: RelaphViewport;
    destroy(): void;
  }

  interface Window {
    Relaph: {
      RelationGraph: new (canvas: HTMLCanvasElement, options?: RelaphRelationGraphOptions) => RelaphRelationGraph;
    };
  }
}
