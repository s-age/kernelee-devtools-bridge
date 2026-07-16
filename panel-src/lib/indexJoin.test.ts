import { describe, expect, it } from 'vitest';
import { buildIndexJoin, emptyIndexJoin } from './indexJoin.js';
import type { IndexDoc } from '../types.js';

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
