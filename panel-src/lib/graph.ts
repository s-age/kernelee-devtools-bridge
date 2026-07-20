import type { CardSize, IndexGate, IndexVerbEmission, StageDescriptor, WiringEndpoint, WiringGuardEntry } from '../types.js';

/** Card fills per part kind — light washes with the label text on top. All 10 pairs validated
 *  CVD-separated (protan/deutan/tritan ΔE >= 15.5). Overridable per consumer repo via
 *  /panel-config.json's `partColors` (merged over these defaults). See
 *  `docs/part-kind-coloring-is-an-index-join.md`.
 *
 *  `gate` is NOT a part kind (it is never resolved via `partKindByHandler` / the index join — see
 *  `stageFill`'s own doc comment): it colors the new gate node kind `buildEndpointTree` folds in
 *  from `WiringGraphDocument.guards`, a fact the runtime wiring document itself carries, not a file
 *  classification. Kept in the same table anyway because the legend enumerates `DEFAULT_PART_COLORS`
 *  keys verbatim (`WiringCanvas`'s legend map) — adding it here is what makes it show up there
 *  automatically. Chosen hue (green) sits clear of the other five (gray/yellow/purple/salmon/blue). */
export const DEFAULT_PART_COLORS: Readonly<Record<string, string>> = {
  pipeline: '#f1f3f6',
  switch: '#fbe7a2',
  emitter: '#b1a0e6',
  mutator: '#f6c3bb',
  bridge: '#b3d6f9',
  gate: '#bfe6c2',
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

/** Card outline shape: the activity-diagram decision-point vocabulary (diamond = branch, rect =
 *  flow continues) lives entirely on the bridge side — relaph itself is geometry-only, it just
 *  draws whichever `style.shape` it is handed (see `docs/activity-diagram-vocabulary-is-bridge-owned.md`).
 *  Mirrors `stageFill`'s own index-join contract exactly: only an anonymous stage whose
 *  `handlerName` joins to a `'switch'` part kind is a decision point. A symbol stage is never a
 *  diamond (its branching, if any, lives inside the symbol's own pipe, not at this call site); a
 *  join miss (unindexed handler, or an index-less panel) degrades to `undefined` — the same
 *  "never break, only lose the extra fact" contract `stageFill`'s join-miss fallback documents. */
export function stageShape(
  stage: StageDescriptor,
  ctx: { partKindByHandler: ReadonlyMap<string, string> },
): 'diamond' | undefined {
  if (stage.symbolId) return undefined;
  if (!stage.handlerName) return undefined;
  return ctx.partKindByHandler.get(stage.handlerName) === 'switch' ? 'diamond' : undefined;
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

/** The `RelaphRelationGraphOptions` slice that varies by card-size mode — `WiringCanvas` recreates
 *  its `RelationGraph` instance whenever `cardSize` changes (relaph's own options are
 *  constructor-only), reading this function for the new instance's options. `'truncate'` boxes are
 *  fixed-width, so edge labels get the same pixel cap (`connector.labelMaxWidth`) truncated node
 *  labels already use, and a tighter rank gap reads fine; `'fit-content'` boxes grow with their
 *  label (verb-chip labels are always short, but a stage/gate label is not), so labels draw in
 *  full (no `connector` override at all) and the rank gap widens to give the bigger boxes room.
 *  Both modes keep the SAME node margin and Y rank gap — only the X rank gap and the label cap
 *  differ. Pure function, isolated here for testing without a canvas. */
export function canvasOptionsFor(
  cardSize: CardSize,
): { readonly connector?: { readonly labelMaxWidth: number }; readonly margin: { readonly node: number; readonly rank: { readonly x: number; readonly y: number } } } {
  return cardSize === 'truncate'
    ? { connector: { labelMaxWidth: 220 }, margin: { node: 24, rank: { x: 260, y: 56 } } }
    : { margin: { node: 24, rank: { x: 380, y: 56 } } };
}

/** Identifies one gate node selection — `targetId` + `gateId` together (not `gateId` alone), since
 *  the SAME gate id can legitimately guard more than one target (`guard(a, sameGate)` and
 *  `guard(b, sameGate)` are both valid `KernelBuilder.guard` calls), so `gateId` alone would not
 *  disambiguate which rendered node is selected when both appear in one view. */
export interface SelectedGate {
  readonly targetId: string;
  readonly gateId: string;
}

export interface BuildTreeCtx {
  readonly collapsed: boolean;
  readonly mainLineOnly: boolean;
  readonly cardSize: CardSize;
  readonly selectedStage: StageDescriptor | null;
  readonly selectedEntryEndpoint: WiringEndpoint | null;
  readonly selectedGate: SelectedGate | null;
  readonly partColors: Readonly<Record<string, string>>;
  readonly partKindByHandler: ReadonlyMap<string, string>;
  /** The catalog's own endpoint key set — the join a divert reference node's `resolved` flag is
   *  baked against at build time (see `buildDivertNodes`). */
  readonly endpointKeys: ReadonlySet<string>;
  /** canvas node id -> that stage's `verbEmissions` list (`IndexJoin.verbEmissions`) — the
   *  abort/fail-chip data join for STAGE nodes. See `buildVerbChips`. */
  readonly verbEmissionsByNodeId: ReadonlyMap<string, readonly IndexVerbEmission[]>;
  /** gateId -> the index's gates[] entry (`IndexJoin.gates`) — the abort/fail-chip data join for
   *  GATE nodes (a gate's `verbEmissions` travels on its own `IndexGate` entry, not a separate
   *  node-id-keyed map — see `buildGateNode`). */
  readonly indexGateById: ReadonlyMap<string, IndexGate>;
}

/** A `fork(symbol)` stage's single stand-in branch node. kernelee's dynamic fan-out (schema v13)
 *  carries no static `branches`/`untrackedBranches` — the whole point of the `fork(symbol)` kind
 *  is that N is a runtime fact, not a construction-time list of sub-`Pipe`s (see kernelee's
 *  `StageDescriptor.branches` doc comment: "`undefined` for every other kind — including
 *  `fork(symbol)`"). Drawing zero branch nodes would flatten the confluence "diamond" back into a
 *  straight line, silently losing the fan-out/join shape from the graph. Instead of N nodes this
 *  repo cannot know the count of, draw exactly ONE schematic node labeled `×N` (an unknown repeat
 *  count, never a real number — contrast the true count `fork(branches)` draws, because it HAS
 *  one) and join it to the continuation the same way a tracked `fork(branches)` branch is joined.
 *  The trunk stage node already carries the fanned-out `symbolId` (`stageLabel` returns it
 *  directly), so this node repeats no identity — only the shape. Shares the fork stage's own
 *  `StageDescriptor` as `data` so selecting either node opens the same inspector. */
function buildSymbolFanoutNode(stage: StageDescriptor, forkId: string, ctx: BuildTreeCtx): RelaphGraphNode {
  return {
    id: `${forkId}::fanout`,
    label: '×N',
    width: cardWidth(96, ctx.cardSize),
    height: 28,
    direction: 'bottom',
    baseline: 'center',
    data: { kind: 'stage', stage },
    style: { fill: stageFill(stage, ctx) },
    children: [],
  };
}

/** One rect reference node per `stage.divertsTo` key — the visible continuation of a divert hop
 *  that leaves this endpoint's own tree. Drawn at ordinary-stage size (not a stub): the flow really
 *  does continue there, just off-tree, so shrinking it would misstate that as a dead end (see
 *  `docs/activity-diagram-vocabulary-is-bridge-owned.md`). `resolved` is baked in against
 *  `ctx.endpointKeys` at BUILD time rather than left for the click handler to look up live —
 *  `onNodeClick` only ever sees `node.data` (see `WiringCanvas`), so the endpoint-key set has to
 *  travel with the node or not be checkable there at all. An unresolved key still renders (never
 *  jumpable, never hidden) — the same "report, don't hide" stance `unanchoredGuards` takes. A fork
 *  stage's own `divertsTo` is always `[]` (kernelee: a fork stage declares no divert target of its
 *  own — see `pipe.ts`'s `StageDescriptor.divertsTo` doc comment), so this never collides with the
 *  fork branch children built alongside it in `buildChain`. Reference nodes are pure leaves: never
 *  fed into `tails`, never a join-edge `from` — a divert hop exits THIS tree, so nothing here can be
 *  a confluence source for it. */
function buildDivertNodes(stage: StageDescriptor, stageId: string, ctx: BuildTreeCtx): RelaphGraphNode[] {
  return stage.divertsTo.map((key, di) => ({
    id: `${stageId}::d${di}`,
    label: key,
    width: cardWidth(220, ctx.cardSize),
    height: 40,
    direction: 'bottom',
    baseline: 'center',
    edgeLabel: 'divert',
    data: { kind: 'divertTarget', key, stage, resolved: ctx.endpointKeys.has(key) },
    style: { fill: '#ffffff', stroke: '#9ca3af' },
    children: [],
  }));
}

/**
 * One pill chip per reachable `abort`/`fail` verb — a true terminal, distinct from the ordinary
 * rect/diamond stage vocabulary (`docs/activity-diagram-vocabulary-is-bridge-owned.md`'s
 * decision-point split does not cover "the flow ends here"). `ownerId` is the owning stage/gate
 * node's own id (`${ownerId}::v${vi}`, `vi` = the emission's index in its `verbEmissions` array —
 * the SAME positional-join discipline the rest of this file's id grammar already follows). `data`
 * is shared with the owner (stage or gate) so clicking a chip opens the same inspector the owner
 * node itself would.
 *
 * `edgeLabel` carries the emission's `desc` in FULL — no truncation here; relaph's own
 * `connector.labelMaxWidth` (see `canvasOptionsFor`) is what caps it on-canvas, same as every
 * other edge label in this app. `desc === null` (the site called `abort(value)`/`fail(error)`
 * with no desc argument — a real, scanned fact, not "not scanned") renders the literal `'TODO'`
 * and ONLY THEN sets `edgeLabelColor` — a `desc`-bearing chip stays the ordinary uncolored label
 * (`nodeStyle.textColor`), so red ink means "this condition still needs a desc", never "this is an
 * abort/fail" (the chip's own fill/stroke already say that).
 *
 * Pure leaves, like a divert reference node: never fed into `tails`, never a join-edge `from` — a
 * terminal has no continuation to join anything into.
 */
function buildVerbChips(
  ownerId: string,
  emissions: readonly IndexVerbEmission[],
  data: { kind: 'stage'; stage: StageDescriptor } | { kind: 'gate'; targetId: string; gateId: string },
  ctx: BuildTreeCtx,
): RelaphGraphNode[] {
  return emissions.map((emission, vi) => ({
    id: `${ownerId}::v${vi}`,
    label: emission.verb,
    width: cardWidth(96, ctx.cardSize),
    height: 28,
    direction: 'right',
    baseline: 'center',
    edgeLabel: emission.desc ?? 'TODO',
    ...(emission.desc === null ? { edgeLabelColor: '#dc2626' } : {}),
    data,
    style: { fill: '#fee2e2', stroke: '#dc2626', borderRadius: 14 },
    children: [],
  }));
}

/** `buildChain`'s return value: the chain's own root node, plus its `tails` — the set of nodes
 *  whose completion IS this chain's completion, propagated declaratively instead of re-derived by
 *  walking `children` positionally afterward (see `docs/activity-diagram-vocabulary-is-bridge-owned.md`
 *  for why the former `chainTail` position-walk was retired). A confluence caller (an outer `fork` whose
 *  branch is this chain) reads `tails` to know exactly which node ids to join from — never by
 *  assuming "the last child" is the tail, which breaks the moment a branch itself ends in a
 *  continuation-less fork with more than one tail. */
export interface ChainResult {
  readonly node: RelaphGraphNode;
  readonly tails: readonly RelaphGraphNode[];
}

/** One stage -> one GraphNode, continuing via a single 'bottom' child (the next stage in the same
 *  sequence). A `fork` stage's own branches are additional 'bottom' siblings alongside that
 *  continuation. The id grammar
 *  (`${idPrefix}::${index}`, branches `${id}::b${bi}`) IS the positional join key
 *  `wireSiteByPath` reads (see `docs/wire-links-positional-join-on-node-id-grammar.md`); do not change it.
 *
 *  `joinEdges` is an out-parameter (pushed to, not read): for every `fork(branches)` stage that
 *  has a continuation, EVERY tail of EVERY tracked branch (see `ChainResult.tails` — a branch may
 *  surface more than one, when its own last stage is itself a continuation-less fork) feeds a join
 *  edge into that continuation — the visual "diamond" convergence. Untracked (`.spawn`) branches
 *  never push a join edge; they must dead-end (a fork always joins all TRACKED branches, which is
 *  exactly why untracked branches live in a separate array and are never walked for tails). A
 *  `fork(symbol)` stage (kernelee schema v13's dynamic fan-out — no static `branches` to walk, since
 *  `kind` itself says "N is decided at runtime") gets the same diamond with exactly one schematic
 *  branch node standing in for the whole runtime-sized fan-out (see `buildSymbolFanoutNode`) — one
 *  join edge, from that node to the continuation.
 *
 *  Return value / `tails` propagation (see `ChainResult`):
 *  - plain stage (including a `mainLineOnly`-hidden fork, and a stage with `divertsTo`): tails =
 *    continuation's tails if a continuation exists, else `[this node]`. A divert reference node
 *    (see `buildDivertNodes`) never enters `tails` regardless.
 *  - `fork(branches)` with a continuation: every tracked branch's tails feed a join edge into the
 *    continuation; this chain's own tails = the continuation's tails.
 *  - `fork(branches)` with no continuation and at least one tracked branch: no join edges pushed
 *    here (there is nothing to join into yet) — tails = the union of every tracked branch's own
 *    tails, "floated up" for an outer confluence (if any) to join later.
 *  - `fork(branches)` with no continuation and zero tracked branches (a pure `.spawn`): tails =
 *    `[this fork node]` — an empty tracked set completes immediately, at the fork itself.
 *  - `fork(symbol)` mirrors `fork(branches)`'s continuation-bearing case exactly (it always has
 *    exactly one stand-in branch, so there is no "zero tracked branches" case for it): with a
 *    continuation, tails = the continuation's tails; without one, tails = `[fanout node]`.
 *
 *  If `stage.divertsTo` is non-empty, OR this stage's own `verbEmissions` (`ctx.verbEmissionsByNodeId`)
 *  is non-empty, AND a continuation exists, the continuation node is given `edgeLabel: 'next'` —
 *  the ordinary "none of the labeled exits were taken" path, made visible now that the stage also
 *  has a labeled 'divert' exit and/or one or more labeled abort/fail chips sitting next to it (see
 *  `buildDivertNodes` / `buildVerbChips`). A stage with neither never gets this label: there is
 *  only one way forward, so labeling it would be noise. `next`'s label AND its very existence as a
 *  condition are both the COMPLEMENT of the abort/fail/divert conditions already drawn — it carries
 *  no derived data of its own (no desc, no source), so it is drawn as the bare word `next` only,
 *  never anything more specific. */
export function buildChain(
  stages: readonly StageDescriptor[],
  index: number,
  idPrefix: string,
  ctx: BuildTreeCtx,
  joinEdges: RelaphJoinEdge[],
): ChainResult | null {
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
        ? { fill: stageFill(stage, ctx), shape: stageShape(stage, ctx), stroke: '#2563eb', strokeWidth: 2.5 }
        : { fill: stageFill(stage, ctx), shape: stageShape(stage, ctx) },
    children: [],
  };
  const continuation = buildChain(stages, index + 1, idPrefix, ctx, joinEdges);
  const verbEmissions = ctx.verbEmissionsByNodeId.get(id) ?? [];
  if ((stage.divertsTo.length > 0 || verbEmissions.length > 0) && continuation) {
    continuation.node.edgeLabel = 'next';
  }
  const divertNodes = buildDivertNodes(stage, id, ctx);
  // Pure leaves, same standing as divert reference nodes: rendered `mainLineOnly` or not, never
  // fed into `tails`, never a join-edge `from` (see `buildVerbChips`'s own doc comment).
  const verbChips = buildVerbChips(id, verbEmissions, { kind: 'stage', stage }, ctx);

  let branchNodes: RelaphGraphNode[] = [];
  let tails: readonly RelaphGraphNode[];

  if (stage.kind === 'fork(branches)' && !ctx.mainLineOnly) {
    // Tracked branches render exactly as before; untracked (detached) branches
    // render alongside them but marked distinctly — a `.spawn`/`fork([], [x])`
    // stage has an empty tracked set and only detached branches, so both must
    // be considered (not just `stage.branches.length > 0`).
    const trackedResults = (stage.branches ?? [])
      .map((branchStages, bi) => buildChain(branchStages, 0, `${id}::b${bi}`, ctx, joinEdges))
      .filter((r): r is ChainResult => r !== null);
    const untrackedResults = (stage.untrackedBranches ?? [])
      .map((branchStages, bi) => buildChain(branchStages, 0, `${id}::u${bi}`, ctx, joinEdges))
      .filter((r): r is ChainResult => r !== null);
    branchNodes = [...trackedResults.map((r) => r.node), ...untrackedResults.map((r) => markDetached(r.node))];
    if (continuation) {
      for (const tracked of trackedResults) {
        for (const tail of tracked.tails) {
          joinEdges.push({ from: tail.id, to: continuation.node.id });
        }
      }
      tails = continuation.tails;
    } else if (trackedResults.length > 0) {
      tails = trackedResults.flatMap((r) => r.tails);
    } else {
      tails = [node];
    }
  } else if (stage.kind === 'fork(symbol)' && !ctx.mainLineOnly) {
    // No static branches to walk (see `buildSymbolFanoutNode`'s doc comment) — one schematic
    // node stands in for the whole runtime-sized fan-out, joined to the continuation exactly
    // like a tracked `fork(branches)` branch would be.
    const fanoutNode = buildSymbolFanoutNode(stage, id, ctx);
    branchNodes = [fanoutNode];
    if (continuation) {
      joinEdges.push({ from: fanoutNode.id, to: continuation.node.id });
      tails = continuation.tails;
    } else {
      tails = [fanoutNode];
    }
  } else {
    tails = continuation ? continuation.tails : [node];
  }

  const children = [...branchNodes, ...divertNodes, ...verbChips, ...(continuation ? [continuation.node] : [])];
  if (children.length > 0) node.children = children;

  return { node, tails };
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

/** One gate node — `WiringGraphDocument.guards[].gateIds[index]`, guarding `targetId`. Rendered ON
 *  the main line: the endpoint header stays the tree root, then the gate chain, then the first
 *  stage — a gate is pre-handler (it runs BEFORE the pipe's first stage), so first-on-the-main-line
 *  is the honest position, not a side annotation; the "not an ordinary stage" fact is carried by
 *  the gate color/inspector, never by displacement off the spine. `direction: 'bottom'` matters:
 *  relaph's `direction` says where THIS node attaches relative to its PARENT and defaults to
 *  `'right'` — the original gate-wraps-root shape floated the whole spine off to the gate's right
 *  for exactly that reason (the endpoint root carries no `direction`). Top-to-bottom order matches
 *  fold execution order: gate 0 runs first, only its `next` verdict reaches gate 1, and only the
 *  whole chain's `next` reaches the pipe at all — see kernel.ts's `gatedHandler` (kernelee core)
 *  for the runtime fold this mirrors. Label = gateId (the join key a trace entry's own `symbolId`
 *  matches back against — see `lib/trace.ts`). `child` is the next gate, the first stage, or
 *  `null` for a guarded endpoint whose catalogued pipe has no stages.
 *
 *  Always a diamond, unconditionally — unlike `stageShape`'s index join (which degrades to rect on
 *  a miss), a gate node has no join to miss: it comes from `WiringGraphDocument.guards`, a runtime
 *  `KernelBuilder.guard(...)` fact this function is handed directly, so there is no "index-less
 *  panel" case where the shape fact isn't available. A gate is always a decision point (`next` vs.
 *  veto), so it is always drawn as one.
 *
 *  Verb chips (`ctx.indexGateById.get(gateId)?.verbEmissions`, same shape/join-miss contract as a
 *  stage's — see `buildVerbChips`) render as additional children alongside `child`. When this
 *  gate's own emissions are non-empty, `child` (the next gate, or the first stage — the gate's
 *  `next`/allow path) is given `edgeLabel: 'next'`, the same "complement of the labeled
 *  abort/fail/divert exits" rule `buildChain` applies to a stage's continuation. */
function buildGateNode(gateId: string, targetId: string, index: number, ctx: BuildTreeCtx, child: RelaphGraphNode | null): RelaphGraphNode {
  const isSelected = ctx.selectedGate !== null && ctx.selectedGate.targetId === targetId && ctx.selectedGate.gateId === gateId;
  const fill = ctx.partColors.gate ?? DEFAULT_PART_COLORS.gate!;
  const id = `${targetId}::__gate${index}`;
  const verbEmissions = ctx.indexGateById.get(gateId)?.verbEmissions ?? [];
  if (verbEmissions.length > 0 && child) child.edgeLabel = 'next';
  const verbChips = buildVerbChips(id, verbEmissions, { kind: 'gate', targetId, gateId }, ctx);
  return {
    id,
    label: gateId,
    width: cardWidth(220, ctx.cardSize),
    height: 40,
    direction: 'bottom',
    baseline: 'center',
    data: { kind: 'gate', targetId, gateId },
    style: isSelected ? { fill, shape: 'diamond', stroke: '#2563eb', strokeWidth: 2.5 } : { fill, shape: 'diamond' },
    children: [...verbChips, ...(child ? [child] : [])],
  };
}

export interface EndpointTree {
  readonly root: RelaphGraphNode;
  /** Confluence join edges collected while walking the endpoint's stages — see `buildChain`. */
  readonly joinEdges: RelaphJoinEdge[];
}

/** `guardEntry` is `WiringGraphDocument.guards`'s entry for THIS endpoint's key (looked up by the
 *  caller — see `App.tsx`'s `guardsByTarget`), or `null`/omitted for an endpoint no `guard()` call
 *  ever named (the common case). `gateIds` stays in fold execution order — never re-sorted, the
 *  same behavioral-contract discipline `GuardCatalogEntry` itself documents — and folds in as a
 *  chain of gate nodes at the HEAD OF THE MAIN LINE, between the endpoint header (which stays the
 *  tree root) and the pipe's first stage, one node per gate, so multiple gates on one target
 *  render as a spine segment in the order they actually run (see `buildGateNode`'s own doc comment
 *  on why on-the-spine is the honest position for a pre-handler veto). */
export function buildEndpointTree(endpoint: WiringEndpoint, ctx: BuildTreeCtx, guardEntry?: WiringGuardEntry | null): EndpointTree {
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

  const gateIds = guardEntry?.gateIds ?? [];
  let head: RelaphGraphNode | null = chain?.node ?? null;
  for (let i = gateIds.length - 1; i >= 0; i--) {
    head = buildGateNode(gateIds[i]!, endpoint.key, i, ctx, head);
  }
  if (head) root.children!.push(head);
  return { root, joinEdges };
}

/** `doc.guards[].targetId` entries that match no `endpoints[].key` — the wiring-graph twin of
 *  kernelee's own `unanchoredGuardTarget` validation issue, computed here purely from what the
 *  panel already has in hand (no need to import `validateWiringGraph` into a browser bundle for
 *  one filter). Never dropped: the caller renders these as a separate, always-visible group (see
 *  `WiringCanvas`'s unanchored overlay) rather than silently losing gates whose target the catalog
 *  never names as an endpoint — "guard() targets are KernelSymbols, which may legitimately not be
 *  catalogued" (kernelee's own `WiringGraphIssue` doc comment) applies here exactly the same way. */
export function unanchoredGuards(guards: readonly WiringGuardEntry[], endpointKeys: ReadonlySet<string>): readonly WiringGuardEntry[] {
  return guards.filter((g) => !endpointKeys.has(g.targetId));
}

/** relaph's "select an endpoint" placeholder tree, shown when no endpoint is selected. */
export function emptyTree(): RelaphGraphNode {
  return { id: '__empty', label: 'Select an endpoint', width: 'fit-content', children: [] };
}
