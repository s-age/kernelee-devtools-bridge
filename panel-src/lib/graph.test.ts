import { describe, it, expect } from 'vitest';
import type { StageDescriptor, WiringGuardEntry } from '@s-age/kernelee';
import { buildEndpointTree, buildChain, unanchoredGuards, type BuildTreeCtx } from './graph.js';

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
    const stage = { kind: 'effect(closure)', note: 'work' } as never;
    const { root } = buildEndpointTree({ key: 'ep', title: 'Endpoint', stages: [stage] } as never, ctx(), guardEntry);

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
