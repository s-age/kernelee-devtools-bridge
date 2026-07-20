import { describe, it, expect } from 'vitest';
import type { StageDescriptor, WiringGuardEntry } from '@s-age/kernelee';
import type { IndexGate, IndexVerbEmission } from '../types.js';
import { buildEndpointTree, buildChain, canvasOptionsFor, stageShape, unanchoredGuards, type BuildTreeCtx } from './graph.js';

/** Minimal StageDescriptor fixture — only `kind`/`divertsTo` are required by the type; every
 *  other field defaults to absent, same as a scanner would emit for a bare stage. */
function stage(kind: StageDescriptor['kind'], overrides: Partial<StageDescriptor> = {}): StageDescriptor {
  return { kind, divertsTo: [], ...overrides };
}

function ctx(overrides: Partial<BuildTreeCtx> = {}): BuildTreeCtx {
  return {
    collapsed: false,
    mainLineOnly: false,
    cardSize: 'truncate',
    selectedStage: null,
    selectedEntryEndpoint: null,
    selectedGate: null,
    partColors: {},
    partKindByHandler: new Map(),
    endpointKeys: new Set(),
    verbEmissionsByNodeId: new Map(),
    indexGateById: new Map(),
    ...overrides,
  };
}

describe('buildChain — confluence join-edge emission', () => {
  it('emits one join edge per tracked branch tail into a fork continuation', () => {
    const fork = stage('fork(branches)', {
      branches: [[stage('pipe(function)', { handlerName: 'b1' })], [stage('pipe(function)', { handlerName: 'b2' })]],
    });
    const cont = stage('pipe(function)', { handlerName: 'cont' });
    const { joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [fork, cont] } as never, ctx());

    expect(joinEdges).toHaveLength(2);
    expect(joinEdges).toContainEqual({ from: 'ep::0::b0::0', to: 'ep::1' });
    expect(joinEdges).toContainEqual({ from: 'ep::0::b1::0', to: 'ep::1' });
  });

  it('never emits a join edge for an untracked (.spawn) branch', () => {
    const fork = stage('fork(branches)', {
      branches: [[stage('pipe(function)', { handlerName: 'tracked' })]],
      untrackedBranches: [[stage('pipe(function)', { handlerName: 'detached' })]],
    });
    const cont = stage('pipe(function)', { handlerName: 'cont' });
    const { joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [fork, cont] } as never, ctx());

    expect(joinEdges).toHaveLength(1);
    expect(joinEdges).toContainEqual({ from: 'ep::0::b0::0', to: 'ep::1' });
    // The untracked branch's tail id must not appear anywhere as a `from`.
    expect(joinEdges.some((e) => e.from === 'ep::0::u0::0')).toBe(false);
  });

  it('emits no join edges when the fork has no continuation (it is the last stage)', () => {
    const fork = stage('fork(branches)', {
      branches: [[stage('pipe(function)', { handlerName: 'b1' })], [stage('pipe(function)', { handlerName: 'b2' })]],
    });
    const { joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [fork] } as never, ctx());

    expect(joinEdges).toHaveLength(0);
  });

  it('emits no join edges for any fork when mainLineOnly hides branches entirely', () => {
    const fork = stage('fork(branches)', {
      branches: [[stage('pipe(function)', { handlerName: 'b1' })], [stage('pipe(function)', { handlerName: 'b2' })]],
    });
    const cont = stage('pipe(function)', { handlerName: 'cont' });
    const { joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [fork, cont] } as never, ctx({ mainLineOnly: true }));

    expect(joinEdges).toHaveLength(0);
  });

  it('nested fork: the outer join edge uses the branch\'s FINAL tail (through the inner confluence), not the nested fork stage itself', () => {
    // Outer: fork -> [ b1 (leaf), branch2 = [nestedFork -> [c1, c2] -> nestedContTail] ] -> outerCont
    const c1 = stage('pipe(function)', { handlerName: 'c1' });
    const c2 = stage('pipe(function)', { handlerName: 'c2' });
    const nestedFork = stage('fork(branches)', { branches: [[c1], [c2]] });
    const nestedContTail = stage('pipe(function)', { handlerName: 'nestedTail' });
    const b1 = stage('pipe(function)', { handlerName: 'b1' });
    const outerFork = stage('fork(branches)', {
      branches: [[b1], [nestedFork, nestedContTail]],
    });
    const outerCont = stage('pipe(function)', { handlerName: 'outerCont' });

    const { joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [outerFork, outerCont] } as never, ctx());

    expect(joinEdges).toHaveLength(4);
    // Inner confluence: c1/c2 -> nestedContTail's node id.
    expect(joinEdges).toContainEqual({ from: 'ep::0::b1::0::b0::0', to: 'ep::0::b1::1' });
    expect(joinEdges).toContainEqual({ from: 'ep::0::b1::0::b1::0', to: 'ep::0::b1::1' });
    // Outer confluence: b1's own tail, and branch2's FINAL tail (nestedContTail, id 'ep::0::b1::1')
    // — NOT the nested fork stage's own id ('ep::0::b1::0').
    expect(joinEdges).toContainEqual({ from: 'ep::0::b0::0', to: 'ep::1' });
    expect(joinEdges).toContainEqual({ from: 'ep::0::b1::1', to: 'ep::1' });
    expect(joinEdges.some((e) => e.from === 'ep::0::b1::0')).toBe(false);
  });

  it('buildChain itself accumulates into the joinEdges array passed in (out-parameter contract)', () => {
    const fork = stage('fork(branches)', { branches: [[stage('pipe(function)', { handlerName: 'b1' })]] });
    const cont = stage('pipe(function)', { handlerName: 'cont' });
    const acc: { from: string; to: string }[] = [];
    buildChain([fork, cont], 0, 'root', ctx(), acc);
    expect(acc).toEqual([{ from: 'root::0::b0::0', to: 'root::1' }]);
  });
});

describe('buildChain — fork(symbol) dynamic fan-out (schema v13): one schematic branch node + join edge', () => {
  it('draws exactly one `×N` stand-in branch node joined to the continuation — no static branches to walk', () => {
    const fork = stage('fork(symbol)', { symbolId: 'LifePort.stepIndexRange' });
    const cont = stage('pipe(function)', { handlerName: 'cont' });
    const { root, joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [fork, cont] } as never, ctx());

    const forkNode = root.children![0]!;
    expect(forkNode.id).toBe('ep::0');
    expect(forkNode.label).toBe('LifePort.stepIndexRange'); // trunk keeps the symbolId identity
    expect(forkNode.children).toHaveLength(2);

    const fanoutNode = forkNode.children![0]!;
    expect(fanoutNode.id).toBe('ep::0::fanout');
    expect(fanoutNode.label).toBe('×N');
    expect(fanoutNode.data).toEqual({ kind: 'stage', stage: fork });

    const continuationNode = forkNode.children![1]!;
    expect(continuationNode.id).toBe('ep::1');

    expect(joinEdges).toEqual([{ from: 'ep::0::fanout', to: 'ep::1' }]);
  });

  it('emits no join edge when the fork(symbol) stage has no continuation (it is the last stage)', () => {
    const fork = stage('fork(symbol)', { symbolId: 'LifePort.stepIndexRange' });
    const { root, joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [fork] } as never, ctx());

    const children = root.children![0]!.children!;
    expect(children).toHaveLength(1);
    expect(children[0]!.id).toBe('ep::0::fanout');
    expect(children[0]!.label).toBe('×N');
    expect(joinEdges).toHaveLength(0);
  });

  it('hides the fanout node entirely under mainLineOnly, same as fork(branches)', () => {
    const fork = stage('fork(symbol)', { symbolId: 'LifePort.stepIndexRange' });
    const cont = stage('pipe(function)', { handlerName: 'cont' });
    const { root, joinEdges } = buildEndpointTree(
      { key: 'ep', title: 'ep', stages: [fork, cont] } as never,
      ctx({ mainLineOnly: true }),
    );

    const forkNode = root.children![0]!;
    // Only the continuation remains — no fanout node, no join edge.
    expect(forkNode.children).toHaveLength(1);
    expect(forkNode.children![0]!.id).toBe('ep::1');
    expect(joinEdges).toHaveLength(0);
  });
});

describe('buildEndpointTree — gate nodes fold in at the HEAD OF THE MAIN LINE, in fold order', () => {
  it('with no guardEntry (or none provided), the endpoint root is the tree root — unchanged from pre-gate behavior', () => {
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [] } as never, ctx());
    expect(root.id).toBe('ep::__root');
    expect(root.data).toMatchObject({ kind: 'entry' });
  });

  it('one gate: the endpoint header stays the tree root, the gate is its first (main-line) child', () => {
    const guardEntry: WiringGuardEntry = { targetId: 'ep', gateIds: ['guard:a'] };
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [] } as never, ctx(), guardEntry);

    expect(root.id).toBe('ep::__root');
    const gate = root.children![0]!;
    expect(gate.id).toBe('ep::__gate0');
    expect(gate.label).toBe('guard:a');
    expect(gate.data).toEqual({ kind: 'gate', targetId: 'ep', gateId: 'guard:a' });
    // On the spine, not floated: relaph's `direction` defaults to 'right' — a gate
    // node must pin itself 'bottom' or the layout drifts it off the main line.
    expect(gate.direction).toBe('bottom');
    expect(gate.children).toEqual([]); // no stages in this pipe
  });

  it('multiple gates: the spine segment preserves FOLD EXECUTION ORDER (gateIds[0] runs first, so it renders topmost), stages follow after', () => {
    const guardEntry: WiringGuardEntry = { targetId: 'ep', gateIds: ['guard:first', 'guard:second'] };
    const oneStage = stage('effect(closure)', { note: 'work' });
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [oneStage] } as never, ctx(), guardEntry);

    expect(root.id).toBe('ep::__root');
    const first = root.children![0]!;
    expect(first.id).toBe('ep::__gate0');
    expect(first.label).toBe('guard:first');
    const second = first.children![0]!;
    expect(second.id).toBe('ep::__gate1');
    expect(second.label).toBe('guard:second');
    // The pipe's own first stage hangs off the LAST gate — header → gates → stages, one line.
    const firstStage = second.children![0]!;
    expect(firstStage.id).toBe('ep::0');
    expect(firstStage.data).toMatchObject({ kind: 'stage' });
  });

  it('a gate entry with an empty gateIds array behaves exactly like no guardEntry at all', () => {
    const guardEntry: WiringGuardEntry = { targetId: 'ep', gateIds: [] };
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [] } as never, ctx(), guardEntry);
    expect(root.id).toBe('ep::__root');
  });
});

describe('unanchoredGuards — guards[].targetId matching no catalogued endpoint, never dropped', () => {
  it('returns only the entries whose targetId is absent from endpointKeys', () => {
    const guards: readonly WiringGuardEntry[] = [
      { targetId: 'anchored', gateIds: ['guard:a'] },
      { targetId: 'floating', gateIds: ['guard:b'] },
    ];
    expect(unanchoredGuards(guards, new Set(['anchored']))).toEqual([{ targetId: 'floating', gateIds: ['guard:b'] }]);
  });

  it('returns [] when every guard target is a catalogued endpoint', () => {
    const guards: readonly WiringGuardEntry[] = [{ targetId: 'anchored', gateIds: ['guard:a'] }];
    expect(unanchoredGuards(guards, new Set(['anchored']))).toEqual([]);
  });
});

// MARK: - (a) stageShape — the index join behind the diamond/rect activity-diagram vocabulary

describe('stageShape — switch-kind join resolves to diamond, everything else degrades to rect (undefined)', () => {
  it("resolves 'diamond' when handlerName joins to a 'switch' part kind", () => {
    const s = stage('map(function)', { handlerName: 'runningPhaseSwitch' });
    expect(stageShape(s, { partKindByHandler: new Map([['runningPhaseSwitch', 'switch']]) })).toBe('diamond');
  });

  it('degrades to undefined on a join miss (handlerName absent from the index)', () => {
    const s = stage('map(function)', { handlerName: 'unindexedHandler' });
    expect(stageShape(s, { partKindByHandler: new Map() })).toBeUndefined();
  });

  it('is always undefined for a symbol stage, even if partKindByHandler happens to hold a matching entry', () => {
    const s = stage('pipe(symbol)', { symbolId: 'LifePort.diffStats' });
    expect(stageShape(s, { partKindByHandler: new Map([['irrelevant', 'switch']]) })).toBeUndefined();
  });
});

// MARK: - (b) gate nodes are unconditionally diamond

describe('buildGateNode (via buildEndpointTree) — gate nodes are unconditionally diamond', () => {
  it('a gate node always carries style.shape === "diamond", selected or not', () => {
    const guardEntry: WiringGuardEntry = { targetId: 'ep', gateIds: ['guard:a'] };
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [] } as never, ctx(), guardEntry);
    const gate = root.children![0]!;
    expect(gate.style?.shape).toBe('diamond');

    const { root: selectedRoot } = buildEndpointTree(
      { key: 'ep', title: 'Endpoint', stages: [] } as never,
      ctx({ selectedGate: { targetId: 'ep', gateId: 'guard:a' } }),
      guardEntry,
    );
    expect(selectedRoot.children![0]!.style?.shape).toBe('diamond');
  });
});

// MARK: - (c) divert reference nodes

describe('divert reference nodes — one rect child per divertsTo key, resolved baked in at build time', () => {
  it('id grammar `::d${di}`, full-size rect (width/height match an ordinary stage), direction bottom, edgeLabel "divert"', () => {
    const s = stage('map(function)', { handlerName: 'sw', divertsTo: ['other.endpoint'] });
    const { root } = buildEndpointTree(
      { key: 'ep', title: 'ep', stages: [s] } as never,
      ctx({ endpointKeys: new Set(['other.endpoint']) }),
    );
    const stageNode = root.children![0]!;
    const divertNode = stageNode.children![0]!;
    expect(divertNode.id).toBe('ep::0::d0');
    expect(divertNode.label).toBe('other.endpoint');
    expect(divertNode.width).toBe(220);
    expect(divertNode.height).toBe(40);
    expect(divertNode.direction).toBe('bottom');
    expect(divertNode.edgeLabel).toBe('divert');
  });

  it('bakes data.resolved: true when the key matches ctx.endpointKeys, false when it does not', () => {
    const s = stage('map(function)', { handlerName: 'sw', divertsTo: ['known', 'unknown'] });
    const { root } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [s] } as never, ctx({ endpointKeys: new Set(['known']) }));
    const stageNode = root.children![0]!;
    const [known, unknown] = stageNode.children!;
    expect((known!.data as { resolved: boolean }).resolved).toBe(true);
    expect((unknown!.data as { resolved: boolean }).resolved).toBe(false);
  });

  it("still generates a node for a self-divert (a divertsTo key equal to the endpoint's own key)", () => {
    const s = stage('map(function)', { handlerName: 'sw', divertsTo: ['ep'] });
    const { root } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [s] } as never, ctx({ endpointKeys: new Set(['ep']) }));
    const stageNode = root.children![0]!;
    expect(stageNode.children).toHaveLength(1);
    expect(stageNode.children![0]!.id).toBe('ep::0::d0');
    expect((stageNode.children![0]!.data as { resolved: boolean }).resolved).toBe(true);
  });

  it('produces no reference node when divertsTo is empty (the fixture default)', () => {
    const s = stage('pipe(function)', { handlerName: 'plain' });
    const { root } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [s] } as never, ctx());
    const stageNode = root.children![0]!;
    expect(stageNode.children ?? []).toHaveLength(0);
  });

  it('renders even under mainLineOnly — fork branches hide there, but a divert reference node is the main line\'s own exit, not a branch', () => {
    const s = stage('map(function)', { handlerName: 'sw', divertsTo: ['other'] });
    const { root } = buildEndpointTree(
      { key: 'ep', title: 'ep', stages: [s] } as never,
      ctx({ mainLineOnly: true, endpointKeys: new Set(['other']) }),
    );
    const stageNode = root.children![0]!;
    expect(stageNode.children).toHaveLength(1);
    expect(stageNode.children![0]!.id).toBe('ep::0::d0');
  });

  it('a reference node never enters tails, and never appears as a joinEdges.from', () => {
    const divertStage = stage('map(function)', { handlerName: 'sw', divertsTo: ['other'] });
    const acc: RelaphJoinEdge[] = [];
    const result = buildChain([divertStage], 0, 'ep', ctx({ endpointKeys: new Set(['other']) }), acc);
    // No continuation after the divert stage -> its own tails is just itself, never the divert node.
    expect(result!.tails).toEqual([result!.node]);
    expect(acc).toEqual([]);
  });

  it('when a divertsTo-bearing stage is a fork branch\'s tail, the confluence join edge\'s "from" is the STAGE, never its divert reference node', () => {
    const divertStage = stage('map(function)', { handlerName: 'b1', divertsTo: ['other'] });
    const fork = stage('fork(branches)', { branches: [[divertStage]] });
    const cont = stage('pipe(function)', { handlerName: 'cont' });
    const { joinEdges } = buildEndpointTree(
      { key: 'ep', title: 'ep', stages: [fork, cont] } as never,
      ctx({ endpointKeys: new Set(['other']) }),
    );
    expect(joinEdges).toEqual([{ from: 'ep::0::b0::0', to: 'ep::1' }]);
  });

  it("an untracked branch's divert reference node does not inherit the amber detached stroke, and markDetached preserves children under the new ChainResult shape", () => {
    const divertStage = stage('map(function)', { handlerName: 'detached', divertsTo: ['other'] });
    const fork = stage('fork(branches)', { untrackedBranches: [[divertStage]] });
    const { root } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [fork] } as never, ctx({ endpointKeys: new Set(['other']) }));

    const forkNode = root.children![0]!;
    const detachedRoot = forkNode.children![0]!;
    expect(detachedRoot.style?.stroke).toBe('#d97706'); // the amber "fired off to the side" marking
    expect(detachedRoot.children).toHaveLength(1); // markDetached must preserve children
    const divertNode = detachedRoot.children![0]!;
    expect(divertNode.id).toBe('ep::0::u0::0::d0');
    expect(divertNode.style?.stroke).not.toBe('#d97706'); // the reference node keeps its own neutral stroke
  });
});

// MARK: - (d) tails propagation (ChainResult)

describe('tails propagation (ChainResult) — declarative floating of confluence sources, replacing the retired chainTail position-walk', () => {
  it('a continuation-less tracked fork nested as the sole branch of an outer fork WITH a continuation floats each of its own tails up: one join edge per floated tail into the OUTER continuation, never from the inner fork\'s own id', () => {
    const c1 = stage('map(function)', { handlerName: 'c1' });
    const c2 = stage('map(function)', { handlerName: 'c2' });
    const innerFork = stage('fork(branches)', { branches: [[c1], [c2]] });
    const outerFork = stage('fork(branches)', { branches: [[innerFork]] });
    const outerCont = stage('map(function)', { handlerName: 'outerCont' });

    const { joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [outerFork, outerCont] } as never, ctx());

    expect(joinEdges).toHaveLength(2);
    expect(joinEdges).toContainEqual({ from: 'ep::0::b0::0::b0::0', to: 'ep::1' });
    expect(joinEdges).toContainEqual({ from: 'ep::0::b0::0::b1::0', to: 'ep::1' });
    expect(joinEdges.some((e) => e.from === 'ep::0::b0::0')).toBe(false); // never the inner fork's own id
  });

  it("an untracked branch's tail never appears as a joinEdges.from, even nested inside a floated-up inner fork", () => {
    const tracked = stage('map(function)', { handlerName: 'tracked' });
    const detached = stage('map(function)', { handlerName: 'detached' });
    const innerFork = stage('fork(branches)', { branches: [[tracked]], untrackedBranches: [[detached]] });
    const outerFork = stage('fork(branches)', { branches: [[innerFork]] });
    const outerCont = stage('map(function)', { handlerName: 'outerCont' });

    const { joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [outerFork, outerCont] } as never, ctx());

    expect(joinEdges).toHaveLength(1);
    expect(joinEdges).toContainEqual({ from: 'ep::0::b0::0::b0::0', to: 'ep::1' });
    expect(joinEdges.some((e) => e.from === 'ep::0::b0::0::u0::0')).toBe(false);
  });

  it('a pure .spawn fork (zero tracked branches) with no continuation has tails = [the fork node itself]', () => {
    const detached = stage('map(function)', { handlerName: 'detached' });
    const fork = stage('fork(branches)', { untrackedBranches: [[detached]] });
    const acc: RelaphJoinEdge[] = [];
    const result = buildChain([fork], 0, 'ep', ctx(), acc);
    expect(result!.tails).toEqual([result!.node]);
    expect(acc).toEqual([]);
  });

  it("a tracked fork with no continuation floats the union of every tracked branch's own tails, pushing no join edges yet", () => {
    const b1 = stage('map(function)', { handlerName: 'b1' });
    const b2 = stage('map(function)', { handlerName: 'b2' });
    const fork = stage('fork(branches)', { branches: [[b1], [b2]] });
    const acc: RelaphJoinEdge[] = [];
    const result = buildChain([fork], 0, 'ep', ctx(), acc);
    const forkNode = result!.node;
    const [b1Node, b2Node] = forkNode.children!;
    expect(result!.tails).toEqual([b1Node, b2Node]);
    expect(acc).toEqual([]);
  });

  it('a nested fork WITH its own continuation still joins through that inner confluence (unchanged from before the tails refactor)', () => {
    const c1 = stage('map(function)', { handlerName: 'c1' });
    const c2 = stage('map(function)', { handlerName: 'c2' });
    const nestedFork = stage('fork(branches)', { branches: [[c1], [c2]] });
    const nestedContTail = stage('map(function)', { handlerName: 'nestedTail' });
    const outerFork = stage('fork(branches)', { branches: [[nestedFork, nestedContTail]] });
    const outerCont = stage('map(function)', { handlerName: 'outerCont' });

    const { joinEdges } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [outerFork, outerCont] } as never, ctx());

    expect(joinEdges).toContainEqual({ from: 'ep::0::b0::0::b0::0', to: 'ep::0::b0::1' });
    expect(joinEdges).toContainEqual({ from: 'ep::0::b0::0::b1::0', to: 'ep::0::b0::1' });
    expect(joinEdges).toContainEqual({ from: 'ep::0::b0::1', to: 'ep::1' });
  });
});

// MARK: - (e) "next" edgeLabel

describe('"next" edgeLabel — only on a continuation immediately following a divertsTo-bearing stage', () => {
  it('a stage with divertsTo AND a continuation labels the continuation edgeLabel "next"', () => {
    const divertStage = stage('map(function)', { handlerName: 'sw', divertsTo: ['other'] });
    const cont = stage('map(function)', { handlerName: 'cont' });
    const { root } = buildEndpointTree(
      { key: 'ep', title: 'ep', stages: [divertStage, cont] } as never,
      ctx({ endpointKeys: new Set(['other']) }),
    );
    const stageNode = root.children![0]!;
    const contNode = stageNode.children!.find((c) => c.id === 'ep::1')!;
    expect(contNode.edgeLabel).toBe('next');
  });

  it('a continuation following a divertsTo-less stage never gets edgeLabel "next"', () => {
    const plain = stage('map(function)', { handlerName: 'plain' });
    const cont = stage('map(function)', { handlerName: 'cont' });
    const { root } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [plain, cont] } as never, ctx());
    const stageNode = root.children![0]!;
    const contNode = stageNode.children![0]!;
    expect(contNode.edgeLabel).toBeUndefined();
  });

  it('a stage with non-empty verbEmissions (but no divertsTo) AND a continuation also labels the continuation edgeLabel "next"', () => {
    const emitting = stage('map(function)', { handlerName: 'sw' });
    const cont = stage('map(function)', { handlerName: 'cont' });
    const emissions: IndexVerbEmission[] = [{ verb: 'abort', desc: 'off-board', site: 'a.ts:1' }];
    const { root } = buildEndpointTree(
      { key: 'ep', title: 'ep', stages: [emitting, cont] } as never,
      ctx({ verbEmissionsByNodeId: new Map([['ep::0', emissions]]) }),
    );
    const stageNode = root.children![0]!;
    const contNode = stageNode.children!.find((c) => c.id === 'ep::1')!;
    expect(contNode.edgeLabel).toBe('next');
  });

  it('a gate with non-empty verbEmissions labels its child (next gate / first stage) edgeLabel "next"', () => {
    const guardEntry: WiringGuardEntry = { targetId: 'ep', gateIds: ['guard:a'] };
    const oneStage = stage('effect(closure)', { note: 'work' });
    const emissions: IndexVerbEmission[] = [{ verb: 'abort', desc: null, site: 'g.ts:1' }];
    const indexGateById = new Map<string, IndexGate>([['guard:a', { id: 'guard:a', verbEmissions: emissions }]]);
    const { root } = buildEndpointTree(
      { key: 'ep', title: 'Endpoint', stages: [oneStage] } as never,
      ctx({ indexGateById }),
      guardEntry,
    );
    const gate = root.children![0]!;
    const firstStage = gate.children!.find((c) => c.id === 'ep::0')!;
    expect(firstStage.edgeLabel).toBe('next');
  });

  it('a gate with EMPTY verbEmissions leaves its child edgeLabel untouched', () => {
    const guardEntry: WiringGuardEntry = { targetId: 'ep', gateIds: ['guard:a'] };
    const oneStage = stage('effect(closure)', { note: 'work' });
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [oneStage] } as never, ctx(), guardEntry);
    const gate = root.children![0]!;
    const firstStage = gate.children!.find((c) => c.id === 'ep::0')!;
    expect(firstStage.edgeLabel).toBeUndefined();
  });
});

// MARK: - (f) verb chips (abort/fail terminals)

describe('buildVerbChips (via buildChain) — abort/fail pill chips on a stage node', () => {
  it('an empty map produces zero chips — canvas is unchanged from before this feature', () => {
    const s = stage('map(function)', { handlerName: 'plain' });
    const { root } = buildEndpointTree({ key: 'ep', title: 'ep', stages: [s] } as never, ctx());
    const stageNode = root.children![0]!;
    expect(stageNode.children ?? []).toHaveLength(0);
  });

  it('one chip per emission: id grammar `${stageId}::v${vi}`, direction right, 96x28 + borderRadius 14, data shared with the owning stage', () => {
    const s = stage('map(function)', { handlerName: 'plain' });
    const emissions: IndexVerbEmission[] = [
      { verb: 'abort', desc: 'off-board', site: 'a.ts:1' },
      { verb: 'fail', desc: null, site: 'a.ts:2' },
    ];
    const { root } = buildEndpointTree(
      { key: 'ep', title: 'ep', stages: [s] } as never,
      ctx({ verbEmissionsByNodeId: new Map([['ep::0', emissions]]) }),
    );
    const stageNode = root.children![0]!;
    expect(stageNode.children).toHaveLength(2);
    const [chip0, chip1] = stageNode.children!;

    expect(chip0!.id).toBe('ep::0::v0');
    expect(chip0!.label).toBe('abort');
    expect(chip0!.direction).toBe('right');
    expect(chip0!.baseline).toBe('center');
    expect(chip0!.width).toBe(96);
    expect(chip0!.height).toBe(28);
    expect(chip0!.style).toEqual({ fill: '#fee2e2', stroke: '#dc2626', borderRadius: 14 });
    expect(chip0!.data).toEqual({ kind: 'stage', stage: s });
    expect(chip0!.children).toEqual([]);
    // desc present -> edgeLabel is the desc verbatim, no color override.
    expect(chip0!.edgeLabel).toBe('off-board');
    expect(chip0!.edgeLabelColor).toBeUndefined();

    expect(chip1!.id).toBe('ep::0::v1');
    expect(chip1!.label).toBe('fail');
    // desc null -> edgeLabel 'TODO' AND edgeLabelColor set.
    expect(chip1!.edgeLabel).toBe('TODO');
    expect(chip1!.edgeLabelColor).toBe('#dc2626');
    expect(chip1!.data).toEqual({ kind: 'stage', stage: s });
  });

  it('a chip is a pure leaf: never in tails, never a joinEdges.from', () => {
    const s = stage('map(function)', { handlerName: 'plain' });
    const emissions: IndexVerbEmission[] = [{ verb: 'abort', desc: 'x', site: 'a.ts:1' }];
    const acc: RelaphJoinEdge[] = [];
    const result = buildChain([s], 0, 'ep', ctx({ verbEmissionsByNodeId: new Map([['ep::0', emissions]]) }), acc);
    expect(result!.tails).toEqual([result!.node]);
    expect(acc).toEqual([]);
  });

  it('renders even under mainLineOnly, same as a divert reference node', () => {
    const s = stage('map(function)', { handlerName: 'plain' });
    const emissions: IndexVerbEmission[] = [{ verb: 'abort', desc: 'x', site: 'a.ts:1' }];
    const { root } = buildEndpointTree(
      { key: 'ep', title: 'ep', stages: [s] } as never,
      ctx({ mainLineOnly: true, verbEmissionsByNodeId: new Map([['ep::0', emissions]]) }),
    );
    const stageNode = root.children![0]!;
    expect(stageNode.children).toHaveLength(1);
    expect(stageNode.children![0]!.id).toBe('ep::0::v0');
  });

  it('cardSize truncate uses a fixed width; fit-content sizes to content', () => {
    const s = stage('map(function)', { handlerName: 'plain' });
    const emissions: IndexVerbEmission[] = [{ verb: 'abort', desc: 'x', site: 'a.ts:1' }];
    const { root } = buildEndpointTree(
      { key: 'ep', title: 'ep', stages: [s] } as never,
      ctx({ cardSize: 'fit-content', verbEmissionsByNodeId: new Map([['ep::0', emissions]]) }),
    );
    const chip = root.children![0]!.children![0]!;
    expect(chip.width).toBe('fit-content');
  });
});

describe('buildVerbChips (via buildGateNode) — abort/fail pill chips on a gate node', () => {
  it('one chip per gate emission, id grammar `${targetId}::__gate${i}::v${vi}`, data shares kind/targetId/gateId', () => {
    const guardEntry: WiringGuardEntry = { targetId: 'ep', gateIds: ['guard:a'] };
    const emissions: IndexVerbEmission[] = [{ verb: 'abort', desc: 'idle', site: 'g.ts:1' }];
    const indexGateById = new Map<string, IndexGate>([['guard:a', { id: 'guard:a', verbEmissions: emissions }]]);
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [] } as never, ctx({ indexGateById }), guardEntry);
    const gate = root.children![0]!;
    expect(gate.children).toHaveLength(1);
    const chip = gate.children![0]!;
    expect(chip.id).toBe('ep::__gate0::v0');
    expect(chip.label).toBe('abort');
    expect(chip.edgeLabel).toBe('idle');
    expect(chip.data).toEqual({ kind: 'gate', targetId: 'ep', gateId: 'guard:a' });
  });

  it('a gate whose IndexGate join misses (absent from indexGateById) produces zero chips', () => {
    const guardEntry: WiringGuardEntry = { targetId: 'ep', gateIds: ['guard:a'] };
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [] } as never, ctx(), guardEntry);
    const gate = root.children![0]!;
    expect(gate.children).toEqual([]);
  });

  it('a gate whose IndexGate.verbEmissions is null (pre-v14 index) degrades to zero chips', () => {
    const guardEntry: WiringGuardEntry = { targetId: 'ep', gateIds: ['guard:a'] };
    const indexGateById = new Map<string, IndexGate>([['guard:a', { id: 'guard:a', verbEmissions: null }]]);
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [] } as never, ctx({ indexGateById }), guardEntry);
    const gate = root.children![0]!;
    expect(gate.children).toEqual([]);
  });
});

// MARK: - (g) canvasOptionsFor — cardSize-mode-dependent RelationGraph options

describe('canvasOptionsFor — truncate vs fit-content mode options', () => {
  it("'truncate' caps edge labels (connector.labelMaxWidth) and uses the tighter X rank gap", () => {
    const opts = canvasOptionsFor('truncate');
    expect(opts.connector).toEqual({ labelMaxWidth: 220 });
    expect(opts.margin).toEqual({ node: 24, rank: { x: 260, y: 56 } });
  });

  it("'fit-content' draws labels in full (no connector override) and uses the wider X rank gap", () => {
    const opts = canvasOptionsFor('fit-content');
    expect(opts.connector).toBeUndefined();
    expect(opts.margin).toEqual({ node: 24, rank: { x: 380, y: 56 } });
  });

  it('both modes share the same node margin and Y rank gap', () => {
    const truncate = canvasOptionsFor('truncate');
    const fitContent = canvasOptionsFor('fit-content');
    expect(truncate.margin.node).toBe(fitContent.margin.node);
    expect(truncate.margin.rank.y).toBe(fitContent.margin.rank.y);
  });
});
