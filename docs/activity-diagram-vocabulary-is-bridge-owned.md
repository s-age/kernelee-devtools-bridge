# Activity-diagram vocabulary is bridge-owned

Context: the wiring-graph canvas grew a node **shape** axis (diamond vs. rect) and an **edge
label** axis ('divert' / 'next') on top of relaph 0.4.0's `style.shape` / `GraphNode.edgeLabel`
primitives, plus a rect reference node for divert hops that leave an endpoint's own tree.

## What

**relaph is geometry-only; the activity-diagram meaning of that geometry is entirely bridge-side.**
relaph 0.4.0 knows how to draw a `'diamond'` or a `'rect'` and how to print an `edgeLabel` on a
connector — nothing more. It has no idea that a diamond means "branch point" or that a rect means
"flow continues here." That vocabulary is assigned once, in `lib/graph.ts`:

- **diamond = decision point.** `stageShape` resolves a stage's shape the same way `stageFill`
  resolves its color: an anonymous stage whose `handlerName` joins (via the kernel-introspect
  index) to part kind `'switch'` is a diamond; a symbol stage, a join miss, or an index-less panel
  all degrade to `undefined` (rect) — never a broken shape, only a lost fact, same contract
  `stageFill`'s own join-miss fallback already documents. A gate node (`buildGateNode`) is
  `'diamond'` unconditionally instead: it has no index to join (it is fed straight from
  `WiringGraphDocument.guards`, a runtime fact, not a file classification), so there is no "miss"
  case for it to degrade from.
- **rect = flow continues.** Every ordinary stage node, and every divert reference node
  (`buildDivertNodes`), is a full ordinary-stage-sized rect (`width: cardWidth(220, ...)`,
  `height: 40`) — never a stub or a smaller "just a pointer" shape. A divert hop genuinely keeps
  the flow going, just off this endpoint's own tree; sizing the reference node down would visually
  claim the opposite.
- **`edgeLabel: 'divert'` / `edgeLabel: 'next'`** distinguish the two exits of a stage that has a
  divert option: the reference node's own incoming edge is always `'divert'`; the ordinary
  continuation (if the stage also has one) is labeled `'next'` **only** when the stage carries a
  non-empty `divertsTo` — a stage with no divert exit has only one way forward, so labeling it
  would be noise, not information.

None of this — the diamond/rect assignment rule, the reference-node sizing, the two edge-label
strings — lives in relaph. relaph only ever sees the already-resolved `style.shape` / `edgeLabel`
values on the `GraphNode`s it is handed.

## Why

Same reasoning as `part-kind-coloring-is-an-index-join.md`: the *fact* that a stage is a decision
point is a source-tree fact (a `*.switch.ts` file suffix), not something the runtime
`StageDescriptor` carries or that a generic canvas library should know how to derive. Keeping the
vocabulary on the bridge side means relaph stays a reusable, domain-agnostic graph renderer, and
this repo stays free to redefine or extend the vocabulary (a third shape, a third edge label)
without touching relaph at all.

### `tails` propagate declaratively — `chainTail`'s position-walk is retired

`buildChain` used to return a bare `RelaphGraphNode | null`, and a separate helper (`chainTail`)
re-derived a chain's "tail" by walking `children` and always taking the **last** entry — a
positional convention that happened to hold only because `buildChain` always appended the
continuation (or, for a fork, the last branch) as the final child. That convention breaks the
moment a branch's own last stage is itself a **continuation-less fork with more than one tail** (a
tracked fork floating multiple tails up with nothing to join them into yet): "last child" is not
even well-defined once a node can legitimately have more than one true tail.

`buildChain` now returns `ChainResult = { node, tails }`: `tails` is computed *at the point each
case is decided* (plain stage, fork with continuation, fork without one, pure `.spawn`) and handed
back explicitly, rather than re-derived later by walking the tree. A confluence caller (an outer
fork whose branch is this chain) reads `tails` directly — no positional assumption survives. See
`ChainResult`'s and `buildChain`'s own doc comments in `lib/graph.ts` for the full case-by-case
propagation rule.

### Divert reference nodes: `resolved` is baked in at build time, not looked up on click

`buildDivertNodes` computes `data.resolved = ctx.endpointKeys.has(key)` while building the node,
not later when the node is clicked. This mirrors the `actionsRef` discipline `WiringCanvas.tsx`
already documents for its own `onNodeClick`: that handler is registered exactly once (an
empty-deps effect) and only ever sees `node.data` — it has no independent path to the endpoint-key
set at click time, and giving it one would duplicate a join `buildChain` already has the inputs to
do once, at construction. An unresolved key still gets a node (never hidden), just a
non-jumpable one — the same "report, don't hide" stance `unanchoredGuards` already takes for a
guard target absent from every catalogued endpoint.

## Gotchas

- `relaph` is pinned as `file:../relaph` while 0.4.0 is unpublished (same interim state
  `label-truncation-ownership-moved-to-relaph.md` describes for 0.2.0); switch back to `^0.4.0`
  after publish.
- `public/vendor/relaph.global.js` is gitignored — after a relaph rebuild, `npm run vendor` must
  be re-run, or a running instance keeps serving the pre-shape/pre-edgeLabel bundle.
- A fork stage's own `divertsTo` is always `[]` (kernelee: a fork declares no divert target of its
  own), so `buildDivertNodes` never collides with the fork-branch children built alongside it in
  the same `buildChain` call — this is a structural guarantee from kernelee's own `pipe.ts`, not
  something this repo enforces defensively.
