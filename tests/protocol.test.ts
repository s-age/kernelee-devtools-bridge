import { describe, expect, it } from 'vitest';
import { isBridgeMessage, isBridgeTraceEntry, type WireWiringGraphDocument } from '../src/protocol.js';

/**
 * Table-driven coverage of the wire-contract validators. Cases mirror the design's accept/reject
 * lists exactly, including the "fixation" cases (unknown `verb`, unknown extra field, an invalid
 * `bufferSnapshot` element) that pin down the validators' deliberate broadness — see the doc
 * comments on `isBridgeTraceEntry` / `isBridgeMessage` in `protocol.ts` for why that broadness is
 * intentional, not a gap.
 *
 * The `schemaVersion: 7` fixture below is typed as `WireWiringGraphDocument` with no `as` cast —
 * that's the point of separating the receive-side wire type from `BridgeMessage`'s send-side
 * literal `schemaVersion: 6`: a cast there would be exactly the kind of drift-prone escape hatch
 * this split exists to avoid (see `protocol.ts`'s `WireWiringGraphDocument` doc comment).
 */

const ACCEPTED_MESSAGES: readonly { readonly name: string; readonly value: unknown }[] = [
  {
    name: 'trace, minimal (no payload/parentId/bufferSnapshot)',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: 0 } },
  },
  {
    name: 'trace, every field present',
    value: {
      type: 'trace',
      entry: {
        symbolId: 'sym',
        verb: 'next',
        span: { id: 'span-1', parentId: 'span-0' },
        payload: '"ok"',
        timestamp: 1,
        bufferSnapshot: [{ label: 'Score', value: '3' }],
      },
    },
  },
  {
    name: 'catalog',
    value: { type: 'catalog', doc: { schemaVersion: 6, endpoints: [], symbols: [], guards: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] } },
  },
  {
    name: 'catalog, schemaVersion 7 — fixation: additive kernelee bumps must still pass (gate on >= 6, not === 6)',
    value: {
      type: 'catalog',
      doc: {
        schemaVersion: 7,
        endpoints: [],
        symbols: [],
        guards: [],
        unresolvedDivertTargets: [],
        unlistedBoundSymbols: [],
      } satisfies WireWiringGraphDocument,
    },
  },
  {
    name: 'trace with an unknown extra field (forward compatibility)',
    value: {
      type: 'trace',
      entry: { symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: 0, futureField: 'x' },
    },
  },
  {
    name: 'trace with an unknown verb string — fixation: the predicate is deliberately broader than TraceVerbKind',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'some-future-verb', span: { id: 'span-1' }, timestamp: 0 } },
  },
  {
    name: 'trace with an invalid bufferSnapshot element — fixation: payload/bufferSnapshot are optional and not inspected',
    value: {
      type: 'trace',
      entry: {
        symbolId: 'sym',
        verb: 'next',
        span: { id: 'span-1' },
        timestamp: 0,
        bufferSnapshot: [{ label: 'Score', value: 3 }],
      },
    },
  },
  {
    name: "trace with desc (abort(value, desc) / fail(error, desc), mirrors TraceSink's sixth argument)",
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'fail', span: { id: 'span-1' }, timestamp: 0, desc: 'grid out of range' } },
  },
];

const REJECTED_MESSAGES: readonly { readonly name: string; readonly value: unknown }[] = [
  { name: 'non-object (string)', value: 'trace' },
  { name: 'non-object (number)', value: 42 },
  { name: 'null', value: null },
  { name: 'type missing', value: {} },
  { name: 'unknown type', value: { type: 'ping' } },
  { name: '{"type":"trace"} with no entry at all — the crash reproducer', value: { type: 'trace' } },
  { name: 'entry: null', value: { type: 'trace', entry: null } },
  {
    name: 'trace entry missing symbolId',
    value: { type: 'trace', entry: { verb: 'next', span: { id: 'span-1' }, timestamp: 0 } },
  },
  {
    name: 'trace entry missing verb',
    value: { type: 'trace', entry: { symbolId: 'sym', span: { id: 'span-1' }, timestamp: 0 } },
  },
  {
    name: 'trace entry missing span',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'next', timestamp: 0 } },
  },
  {
    name: 'trace entry missing timestamp',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'next', span: { id: 'span-1' } } },
  },
  {
    name: 'span is not an object',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'next', span: 'x', timestamp: 0 } },
  },
  {
    name: 'span.id is not a string',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'next', span: { id: 1 }, timestamp: 0 } },
  },
  {
    name: 'timestamp is not a number',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: '0' } },
  },
  { name: '{"type":"catalog"} with no doc at all', value: { type: 'catalog' } },
  { name: 'catalog doc: null', value: { type: 'catalog', doc: null } },
  { name: 'catalog doc: not an object', value: { type: 'catalog', doc: 'x' } },
  { name: 'catalog doc: array (not a plain object)', value: { type: 'catalog', doc: [] } },
  { name: 'catalog doc: {} — no fields at all', value: { type: 'catalog', doc: {} } },
  {
    name: 'catalog doc: schemaVersion 5 (pre-guards field — must be dropped, not rescued)',
    value: {
      type: 'catalog',
      doc: { schemaVersion: 5, endpoints: [], symbols: [], guards: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] },
    },
  },
  {
    name: 'catalog doc: schemaVersion 6.5 (non-integer)',
    value: {
      type: 'catalog',
      doc: { schemaVersion: 6.5, endpoints: [], symbols: [], guards: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] },
    },
  },
  {
    name: 'catalog doc: missing guards array',
    value: {
      type: 'catalog',
      doc: { schemaVersion: 6, endpoints: [], symbols: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] },
    },
  },
  {
    name: 'catalog doc: unresolvedDivertTargets not an array',
    value: {
      type: 'catalog',
      doc: { schemaVersion: 6, endpoints: [], symbols: [], guards: [], unresolvedDivertTargets: 'x', unlistedBoundSymbols: [] },
    },
  },
  {
    name: 'trace entry: desc is not a string',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'abort', span: { id: 'span-1' }, timestamp: 0, desc: 42 } },
  },
];

describe('isBridgeMessage', () => {
  it.each(ACCEPTED_MESSAGES.map((c) => [c.name, c.value] as const))('accepts: %s', (_name, value) => {
    expect(isBridgeMessage(value)).toBe(true);
  });

  it.each(REJECTED_MESSAGES.map((c) => [c.name, c.value] as const))('rejects: %s', (_name, value) => {
    expect(isBridgeMessage(value)).toBe(false);
  });
});

describe('isBridgeTraceEntry', () => {
  it('accepts a minimal entry', () => {
    expect(isBridgeTraceEntry({ symbolId: 'sym', verb: 'next', span: { id: 'span-1' }, timestamp: 0 })).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isBridgeTraceEntry(undefined)).toBe(false);
  });

  it('rejects null', () => {
    expect(isBridgeTraceEntry(null)).toBe(false);
  });

  it('accepts a string desc', () => {
    expect(isBridgeTraceEntry({ symbolId: 'sym', verb: 'abort', span: { id: 'span-1' }, timestamp: 0, desc: 'off-board' })).toBe(true);
  });

  it('rejects a non-string desc', () => {
    expect(isBridgeTraceEntry({ symbolId: 'sym', verb: 'abort', span: { id: 'span-1' }, timestamp: 0, desc: 42 })).toBe(false);
  });
});
