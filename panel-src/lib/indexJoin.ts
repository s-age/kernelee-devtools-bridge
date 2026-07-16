import type { IndexDoc, IndexEndpoint, IndexGate, IndexJoin, IndexStage, IndexSymbol } from '../types.js';

/** Empty join — the panel's "no index yet" state (before boot's fetch resolves, or on a
 *  permanent join miss). Uncolored (all-'pipeline') is a working state, never a broken one. */
export function emptyIndexJoin(): IndexJoin {
  return {
    kinds: new Map(),
    sites: new Map(),
    wireSites: new Map(),
    endpoints: new Map(),
    symbols: new Map(),
    gates: new Map(),
  };
}

/** Walks a kernel-introspect `index.json` into the six lookup maps the panel joins against the
 *  runtime catalog with (the node-id grammar, kind-by-file resolution, and the "join miss just
 *  degrades" contract). See
 *  `docs/part-kind-coloring-is-an-index-join.md` and `docs/wire-links-positional-join-on-node-id-grammar.md`. */
export function buildIndexJoin(indexDoc: IndexDoc): IndexJoin {
  const kinds = new Map<string, string>();
  const sites = new Map<string, string>();
  const wireSites = new Map<string, string>();
  const endpoints = new Map<string, IndexEndpoint>();
  const symbols = new Map<string, IndexSymbol>();
  const gates = new Map<string, IndexGate>();

  for (const symbol of indexDoc.symbols ?? []) symbols.set(symbol.id, symbol);
  // `gates` may be null (pre-v11 index: "not scanned") as well as absent — both degrade the same.
  for (const gate of indexDoc.gates ?? []) gates.set(gate.id, gate);

  const kindByFile = new Map<string, string>();
  for (const part of indexDoc.parts ?? []) kindByFile.set(part.file, part.kind);

  const visitStages = (stages: readonly IndexStage[] | undefined, prefix: string): void => {
    (stages ?? []).forEach((stage, i) => {
      const id = `${prefix}::${i}`;
      if (typeof stage.wireSite === 'string') wireSites.set(id, stage.wireSite);
      const handler = stage.handler;
      if (handler && handler.functionName && typeof handler.site === 'string') {
        const file = handler.site.replace(/:\d+$/, '');
        kinds.set(handler.functionName, kindByFile.get(file) ?? 'pipeline');
        sites.set(handler.functionName, handler.site);
      }
      (stage.branches ?? []).forEach((branch, bi) => visitStages(branch, `${id}::b${bi}`));
      // Detached branches carry real wire sites / named handlers too — walk them
      // like tracked branches so a `.spawn`/untracked subtree is not dropped.
      (stage.untrackedBranches ?? []).forEach((branch, bi) => visitStages(branch, `${id}::u${bi}`));
    });
  };

  for (const endpoint of indexDoc.endpoints ?? []) {
    endpoints.set(endpoint.key, endpoint);
    visitStages(endpoint.stages, endpoint.key);
  }

  return { kinds, sites, wireSites, endpoints, symbols, gates };
}
