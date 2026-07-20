import { describe, expect, it } from 'vitest';
import { buildIndexJoin, emptyIndexJoin } from './indexJoin.js';
import type { IndexDoc } from '../types.js';

describe('buildIndexJoin — verbEmissions map (canvas node id -> stage verbEmissions, the abort/fail-chip data join)', () => {
  it('keys a top-level stage entry by its own node id (endpointKey::index)', () => {
    const doc: IndexDoc = {
      endpoints: [
        {
          key: 'ep',
          stages: [{ verbEmissions: [{ verb: 'abort', desc: 'off-board', site: 'a.ts:1' }] }, { verbEmissions: [] }],
        },
      ],
    };
    const join = buildIndexJoin(doc);
    expect(join.verbEmissions.get('ep::0')).toEqual([{ verb: 'abort', desc: 'off-board', site: 'a.ts:1' }]);
    // An empty list is never keyed at all — same convention as a stage with no wireSite.
    expect(join.verbEmissions.has('ep::1')).toBe(false);
  });

  it('walks tracked branches (::b${bi}) and untracked/detached branches (::u${bi}) alike', () => {
    const doc: IndexDoc = {
      endpoints: [
        {
          key: 'ep',
          stages: [
            {
              branches: [[{ verbEmissions: [{ verb: 'fail', desc: null, site: 'b.ts:1' }] }]],
              untrackedBranches: [[{ verbEmissions: [{ verb: 'abort', desc: 'x', site: 'u.ts:1' }] }]],
            },
          ],
        },
      ],
    };
    const join = buildIndexJoin(doc);
    expect(join.verbEmissions.get('ep::0::b0::0')).toEqual([{ verb: 'fail', desc: null, site: 'b.ts:1' }]);
    expect(join.verbEmissions.get('ep::0::u0::0')).toEqual([{ verb: 'abort', desc: 'x', site: 'u.ts:1' }]);
  });

  it('degrades to an empty map when verbEmissions is absent (old index) OR null (scanner ran pre-v14) on a stage', () => {
    const doc: IndexDoc = {
      endpoints: [{ key: 'ep', stages: [{}, { verbEmissions: null }] }],
    };
    const join = buildIndexJoin(doc);
    expect(join.verbEmissions.size).toBe(0);
    expect(buildIndexJoin({}).verbEmissions.size).toBe(0);
    expect(emptyIndexJoin().verbEmissions.size).toBe(0);
  });
});

describe('buildIndexJoin — gates[].verbEmissions travels on the existing gates map entry (no separate map)', () => {
  it('a gates[] entry carries its own verbEmissions through untouched', () => {
    const doc: IndexDoc = {
      gates: [{ id: 'guard:a', verbEmissions: [{ verb: 'abort', desc: 'idle', site: 'g.ts:3' }] }],
    };
    const join = buildIndexJoin(doc);
    expect(join.gates.get('guard:a')?.verbEmissions).toEqual([{ verb: 'abort', desc: 'idle', site: 'g.ts:3' }]);
  });

  it('a gates[] entry with verbEmissions: null (pre-v14) degrades the same way as a missing field', () => {
    const doc: IndexDoc = {
      gates: [{ id: 'guard:a', verbEmissions: null }],
    };
    const join = buildIndexJoin(doc);
    expect(join.gates.get('guard:a')?.verbEmissions).toBeNull();
  });
});

describe('buildIndexJoin — gates map (gateId -> gates[] entry, the gate inspector source-link join)', () => {
  it('keys every gates[] entry by its id', () => {
    const doc: IndexDoc = {
      gates: [
        { id: 'guard:a', declarationSite: 'src/a.gate.ts:3', handler: { functionName: 'aGate', site: 'src/a.gate.ts:10' } },
        { id: 'guard:b', declarationSite: 'src/b.gate.ts:5', handler: null },
      ],
    };
    const join = buildIndexJoin(doc);
    expect(join.gates.get('guard:a')?.declarationSite).toBe('src/a.gate.ts:3');
    expect(join.gates.get('guard:a')?.handler?.functionName).toBe('aGate');
    expect(join.gates.get('guard:b')?.handler).toBeNull();
    expect(join.gates.has('guard:missing')).toBe(false);
  });

  it('degrades to an empty map when gates is absent (old index) OR null (scanner ran pre-v11)', () => {
    expect(buildIndexJoin({}).gates.size).toBe(0);
    expect(buildIndexJoin({ gates: null }).gates.size).toBe(0);
    expect(emptyIndexJoin().gates.size).toBe(0);
  });
});
