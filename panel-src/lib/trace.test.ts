import { describe, it, expect } from 'vitest';
import type { BridgeTraceEntry } from '../types.js';
import { TRACE_CAP, trimTraceEntries } from './trace.js';

/** Minimal BridgeTraceEntry fixture — only `span.id` varies across entries; every other field is
 *  irrelevant to the trim ring's own length-based logic. */
function entry(id: string): BridgeTraceEntry {
  return { symbolId: 'sym', verb: 'next', span: { id }, timestamp: 0 };
}

function entries(count: number): BridgeTraceEntry[] {
  return Array.from({ length: count }, (_, i) => entry(`span-${i}`));
}

describe('trimTraceEntries', () => {
  it('leaves entries alone at or under the default TRACE_CAP*1.25 threshold', () => {
    const input = entries(Math.floor(TRACE_CAP * 1.25));
    expect(trimTraceEntries(input)).toBe(input);
  });

  it('trims down to the default TRACE_CAP once the 1.25x threshold is exceeded', () => {
    const input = entries(Math.floor(TRACE_CAP * 1.25) + 1);
    const result = trimTraceEntries(input);
    expect(result).toHaveLength(TRACE_CAP);
    expect(result[result.length - 1]).toBe(input[input.length - 1]);
  });

  it('honors an explicit small cap instead of the module default', () => {
    const input = entries(4);
    expect(trimTraceEntries(input, 4)).toBe(input); // 4 <= 4*1.25 — untouched

    const overThreshold = entries(6); // 6 > 4*1.25 (5)
    const result = trimTraceEntries(overThreshold, 4);
    expect(result).toHaveLength(4);
    expect(result).toEqual(overThreshold.slice(2));
  });
});
