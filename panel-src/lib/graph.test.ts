import { describe, it, expect } from 'vitest';
import type { StageDescriptor } from '@s-age/kernelee';
import { buildEndpointTree, buildChain, type BuildTreeCtx } from './graph.js';

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
