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

/** Walk a chain built by `buildChain` down to its deepest node. `buildChain` always appends the
 *  continuation (if any) as the LAST entry of `children` — for a plain stage that's its sole
 *  child, for a `fork(branches)` stage it's the last of `[...branchChains, continuation]` — so
 *  repeatedly following the last child reaches the chain's true tail regardless of any nested
 *  fork/confluence along the way (the nested fork's own continuation is just another node in the
 *  same walk). */
function chainTail(node: RelaphGraphNode): RelaphGraphNode {
  let tail = node;
  while (tail.children && tail.children.length > 0) {
    tail = tail.children[tail.children.length - 1]!;
  }
  return tail;
}

/** One stage -> one GraphNode, continuing via a single 'bottom' child (the next stage in the same
 *  sequence). A `fork` stage's own branches are additional 'bottom' siblings alongside that
 *  continuation. The id grammar
 *  (`${idPrefix}::${index}`, branches `${id}::b${bi}`) IS the positional join key
 *  `wireSiteByPath` reads (see `docs/wire-links-positional-join-on-node-id-grammar.md`); do not change it.
 *
 *  `joinEdges` is an out-parameter (pushed to, not read): for every `fork(branches)` stage that
 *  has a continuation, each TRACKED branch's tail feeds a join edge into that continuation — the
 *  visual "diamond" convergence. Untracked (`.spawn`) branches never push a join edge; they must
 *  dead-end (see `docs/...` fork/join design — a fork always joins all tracked branches, which is
 *  exactly why untracked branches live in a separate array). */
export function buildChain(
  stages: readonly StageDescriptor[],
  index: number,
  idPrefix: string,
  ctx: BuildTreeCtx,
  joinEdges: RelaphJoinEdge[],
): RelaphGraphNode | null {
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
  const continuation = buildChain(stages, index + 1, idPrefix, ctx, joinEdges);
  if (stage.kind === 'fork(branches)' && !ctx.mainLineOnly) {
    // Tracked branches render exactly as before; untracked (detached) branches
    // render alongside them but marked distinctly — a `.spawn`/`fork([], [x])`
    // stage has an empty tracked set and only detached branches, so both must
    // be considered (not just `stage.branches.length > 0`).
    const trackedChains = (stage.branches ?? [])
      .map((branchStages, bi) => buildChain(branchStages, 0, `${id}::b${bi}`, ctx, joinEdges))
      .filter((n): n is RelaphGraphNode => n !== null);
    const untrackedChains = (stage.untrackedBranches ?? [])
      .map((branchStages, bi) => buildChain(branchStages, 0, `${id}::u${bi}`, ctx, joinEdges))
      .filter((n): n is RelaphGraphNode => n !== null)
      .map(markDetached);
    const branchChains = [...trackedChains, ...untrackedChains];
    if (branchChains.length > 0) {
      node.children = continuation ? [...branchChains, continuation] : branchChains;
    } else if (continuation) {
      node.children = [continuation];
    }
    if (continuation) {
      for (const branchRoot of trackedChains) {
        joinEdges.push({ from: chainTail(branchRoot).id, to: continuation.id });
      }
    }
  } else if (continuation) {
    node.children = [continuation];
  }
  return node;
}

/** Mark a detached (untracked) branch subtree's root distinctly from a tracked
 * branch — a `⇢` label prefix ("fired off to the side") plus a dashed-intent
 * amber stroke. Additive: tracked branch nodes are never touched. */
function markDetached(node: RelaphGraphNode): RelaphGraphNode {
  return {
    ...node,
    label: node.label === undefined ? node.label : `⇢ ${node.label}`,
    style: { ...(node.style ?? {}), stroke: '#d97706', strokeWidth: node.style?.strokeWidth ?? 1.5 },
  };
}

export interface EndpointTree {
  readonly root: RelaphGraphNode;
  /** Confluence join edges collected while walking the endpoint's stages — see `buildChain`. */
  readonly joinEdges: RelaphJoinEdge[];
}

export function buildEndpointTree(endpoint: WiringEndpoint, ctx: BuildTreeCtx): EndpointTree {
  const root: RelaphGraphNode = {
    id: `${endpoint.key}::__root`,
    label: endpoint.title,
    width: cardWidth(220, ctx.cardSize),
    height: 44,
    data: { kind: 'entry', endpoint },
    style: ctx.selectedEntryEndpoint === endpoint ? { stroke: '#2563eb', strokeWidth: 2.5 } : undefined,
    children: [],
  };
  const joinEdges: RelaphJoinEdge[] = [];
  const chain = buildChain(endpoint.stages, 0, endpoint.key, ctx, joinEdges);
  if (chain) root.children!.push(chain);
  return { root, joinEdges };
}

/** relaph's "select an endpoint" placeholder tree, shown when no endpoint is selected. */
export function emptyTree(): RelaphGraphNode {
  return { id: '__empty', label: 'Select an endpoint', width: 'fit-content', children: [] };
}
