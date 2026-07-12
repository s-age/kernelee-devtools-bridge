import type { CardSize, StageDescriptor, WiringEndpoint } from '../types.js';

/** Card fills per part kind — light washes with the label text on top. All 10 pairs validated
 *  CVD-separated (protan/deutan/tritan ΔE >= 15.5). Overridable per consumer repo via
 *  /panel-config.json's `partColors` (merged over these defaults). See
 *  `docs/part-kind-coloring-is-an-index-join.md`. */
export const DEFAULT_PART_COLORS: Readonly<Record<string, string>> = {
  pipeline: '#f1f3f6',
  switch: '#fbe7a2',
  emitter: '#b1a0e6',
  mutator: '#f6c3bb',
  bridge: '#b3d6f9',
};

export function isCompactibleAnonymous(stage: StageDescriptor): boolean {
  return (
    !stage.symbolId &&
    (stage.kind === 'map(function)' ||
      stage.kind === 'map(closure)' ||
      stage.kind === 'effect(function)' ||
      stage.kind === 'effect(closure)')
  );
}

/** Color coding for symbol stages: by symbol prefix (namespace before the first `.`). Anonymous
 *  stages are colored by part kind instead (see `stageFill`). */
export function colorForSymbol(symbolId: string | undefined, partColors: Readonly<Record<string, string>>): string {
  if (!symbolId) return partColors.pipeline!; // anonymous stage with no part resolution
  const prefix = symbolId.split('.')[0]!;
  let hash = 0;
  for (let i = 0; i < prefix.length; i++) hash = (hash * 31 + prefix.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 92%)`;
}

/** Symbol stages keep the namespace hue; anonymous stages resolve handlerName -> part kind
 *  (join miss / no index = 'pipeline', so the panel degrades to the old look, never breaks). */
export function stageFill(
  stage: StageDescriptor,
  ctx: { partColors: Readonly<Record<string, string>>; partKindByHandler: ReadonlyMap<string, string> },
): string {
  if (stage.symbolId) return colorForSymbol(stage.symbolId, ctx.partColors);
  const kind = stage.handlerName ? ctx.partKindByHandler.get(stage.handlerName) : undefined;
  return ctx.partColors[kind ?? 'pipeline'] ?? ctx.partColors.pipeline!;
}

/** The kind token with its operand slot specialized: a named handler replaces the `function`
 *  operand — `map(function)` becomes `map(mergeGranularityBranches)`, mirroring the source call
 *  shape `.map(mergeGranularityBranches)`. kernelee's `handlerNameOf` casts `kind`/`handlerName`
 *  from the same check (kernel-introspect StageKind symbol/function/closure operand split), so a
 *  stage carries `handlerName` if and only if its kind is a `(function)` operand — `(closure)`
 *  stages never have one, `(symbol)`/`(branches)` stages never have one either. Only `(function)`
 *  needs replacing here; the other three operands always keep their bare kind. */
export function stageToken(stage: StageDescriptor): string {
  return stage.handlerName ? stage.kind.replace('(function)', `(${stage.handlerName})`) : stage.kind;
}

/** Labels are one line (relaph has no wrapping / `\n` support) but are passed in full: sizing /
 *  overflow is relaph's job — see `docs/label-truncation-ownership-moved-to-relaph.md`. */
export function stageLabel(stage: StageDescriptor, ctx: { collapsed: boolean; mainLineOnly: boolean }): string {
  if (ctx.collapsed && isCompactibleAnonymous(stage)) {
    return stage.note ? `${stageToken(stage)}: ${stage.note}` : stageToken(stage);
  }
  if (stage.symbolId) return stage.symbolId;
  if (stage.note && !ctx.mainLineOnly) return stage.note;
  return stageToken(stage);
}

/** Node width for the current card-size mode ('fit-content' grows, otherwise fixed). */
export function cardWidth(fixed: number, cardSize: CardSize): number | 'fit-content' {
  return cardSize === 'fit-content' ? 'fit-content' : fixed;
}

export interface BuildTreeCtx {
  readonly collapsed: boolean;
  readonly mainLineOnly: boolean;
  readonly cardSize: CardSize;
  readonly selectedStage: StageDescriptor | null;
  readonly selectedEntryEndpoint: WiringEndpoint | null;
  readonly partColors: Readonly<Record<string, string>>;
  readonly partKindByHandler: ReadonlyMap<string, string>;
}

/** One stage -> one GraphNode, continuing via a single 'bottom' child (the next stage in the same
 *  sequence). A `fork` stage's own branches are additional 'bottom' siblings alongside that
 *  continuation. The id grammar
 *  (`${idPrefix}::${index}`, branches `${id}::b${bi}`) IS the positional join key
 *  `wireSiteByPath` reads (see `docs/wire-links-positional-join-on-node-id-grammar.md`); do not change it. */
export function buildChain(stages: readonly StageDescriptor[], index: number, idPrefix: string, ctx: BuildTreeCtx): RelaphGraphNode | null {
  if (index >= stages.length) return null;
  const stage = stages[index]!;
  const id = `${idPrefix}::${index}`;
  const compact = ctx.collapsed && isCompactibleAnonymous(stage);
  const node: RelaphGraphNode = {
    id,
    label: stageLabel(stage, ctx),
    width: cardWidth(compact ? 96 : 220, ctx.cardSize),
    height: compact ? 28 : 40,
    direction: 'bottom',
    baseline: 'center',
    data: { kind: 'stage', stage },
    style:
      ctx.selectedStage === stage
        ? { fill: stageFill(stage, ctx), stroke: '#2563eb', strokeWidth: 2.5 }
        : { fill: stageFill(stage, ctx) },
    children: [],
  };
  const continuation = buildChain(stages, index + 1, idPrefix, ctx);
  if (stage.kind === 'fork(branches)' && !ctx.mainLineOnly && stage.branches && stage.branches.length > 0) {
    const branchChains = stage.branches
      .map((branchStages, bi) => buildChain(branchStages, 0, `${id}::b${bi}`, ctx))
      .filter((n): n is RelaphGraphNode => n !== null);
    node.children = continuation ? [...branchChains, continuation] : branchChains;
  } else if (continuation) {
    node.children = [continuation];
  }
  return node;
}

export function buildEndpointTree(endpoint: WiringEndpoint, ctx: BuildTreeCtx): RelaphGraphNode {
  const root: RelaphGraphNode = {
    id: `${endpoint.key}::__root`,
    label: endpoint.title,
    width: cardWidth(220, ctx.cardSize),
    height: 44,
    data: { kind: 'entry', endpoint },
    style: ctx.selectedEntryEndpoint === endpoint ? { stroke: '#2563eb', strokeWidth: 2.5 } : undefined,
    children: [],
  };
  const chain = buildChain(endpoint.stages, 0, endpoint.key, ctx);
  if (chain) root.children!.push(chain);
  return root;
}

/** relaph's "select an endpoint" placeholder tree, shown when no endpoint is selected. */
export function emptyTree(): RelaphGraphNode {
  return { id: '__empty', label: 'Select an endpoint', width: 'fit-content', children: [] };
}
