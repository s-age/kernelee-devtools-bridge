import { describe, expect, it } from 'vitest';
import { parseBridgeMessage } from './bridgeMessage.js';

/**
 * Table-driven coverage of `parseBridgeMessage`, mirroring `tests/protocol.test.ts`'s
 * `isBridgeMessage` table (same envelope rules — see `bridgeMessage.ts`'s header comment on why
 * the validator itself is duplicated rather than imported), plus the JSON-parse-failure case that
 * has no `src/protocol.ts` counterpart (the server never hands `isBridgeMessage` unparsed text).
 */

const ACCEPTED: readonly { readonly name: string; readonly value: unknown }[] = [
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
    name: 'trace with desc (abort(value, desc) / fail(error, desc))',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'abort', span: { id: 'span-1' }, timestamp: 0, desc: 'off-board' } },
  },
  {
    name: 'catalog, schemaVersion 6',
    value: { type: 'catalog', doc: { schemaVersion: 6, endpoints: [], symbols: [], guards: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] } },
  },
  {
    name: 'catalog, schemaVersion 7 (additive bump must still pass — gate on >= 6, not === 6)',
    value: { type: 'catalog', doc: { schemaVersion: 7, endpoints: [], symbols: [], guards: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] } },
  },
];

const REJECTED: readonly { readonly name: string; readonly value: unknown }[] = [
  { name: 'non-object (string)', value: 'trace' },
  { name: 'null', value: null },
  { name: 'type missing', value: {} },
  { name: 'unknown type', value: { type: 'ping' } },
  { name: '{"type":"trace"} with no entry', value: { type: 'trace' } },
  { name: '{"type":"catalog"} with no doc', value: { type: 'catalog' } },
  { name: 'catalog doc: {} (no fields at all)', value: { type: 'catalog', doc: {} } },
  {
    name: 'catalog doc: schemaVersion 5 (pre-guards, must be dropped)',
    value: { type: 'catalog', doc: { schemaVersion: 5, endpoints: [], symbols: [], guards: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] } },
  },
  {
    name: 'catalog doc: schemaVersion 6.5 (non-integer)',
    value: { type: 'catalog', doc: { schemaVersion: 6.5, endpoints: [], symbols: [], guards: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] } },
  },
  {
    name: 'catalog doc: missing guards array',
    value: { type: 'catalog', doc: { schemaVersion: 6, endpoints: [], symbols: [], unresolvedDivertTargets: [], unlistedBoundSymbols: [] } },
  },
  {
    name: 'trace entry: desc is not a string',
    value: { type: 'trace', entry: { symbolId: 'sym', verb: 'abort', span: { id: 'span-1' }, timestamp: 0, desc: 42 } },
  },
];

describe('parseBridgeMessage', () => {
  it.each(ACCEPTED.map((c) => [c.name, c.value] as const))('accepts: %s', (_name, value) => {
    expect(parseBridgeMessage(JSON.stringify(value))).toEqual(value);
  });

  it.each(REJECTED.map((c) => [c.name, c.value] as const))('rejects: %s', (_name, value) => {
    expect(parseBridgeMessage(JSON.stringify(value))).toBeNull();
  });

  it('returns null for a non-JSON string instead of throwing', () => {
    expect(parseBridgeMessage('not json{')).toBeNull();
  });
});
