import { describe, expect, it } from 'vitest';
import { defaultTraceOutPath } from '../src/tracePath.js';

describe('defaultTraceOutPath', () => {
  it('derives a repoRoot-relative, per-project default under node_modules/.cache', () => {
    expect(defaultTraceOutPath('/repo')).toBe('/repo/node_modules/.cache/kernelee-devtools-bridge/trace.json');
  });
});
