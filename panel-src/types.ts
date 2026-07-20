// Shared type vocabulary for the panel UI. Runtime-catalog shapes (`WiringGraphDocument`,
// `StageDescriptor`, ...) come straight from `kernelee` (already a devDependency, and the same
// package `src/protocol.ts` types against) — no need to duplicate those. The WS envelope
// (`BridgeMessage`/`BridgeTraceEntry`) IS duplicated rather than imported from `src/protocol.ts`:
// panel-src is an independently bundled client tree (esbuild, browser target), so mirroring the
// on-the-wire shape here keeps the two builds decoupled.
import type { Span, StageDescriptor, TraceVerbKind, WiringEndpoint, WiringGraphDocument, WiringGuardEntry } from '@s-age/kernelee';

export type { StageDescriptor, WiringEndpoint, WiringGraphDocument, WiringGuardEntry };

/** Mirrors `src/protocol.ts`'s `BridgeTraceEntry` — one live `onTrace` callback's arguments,
 *  forwarded verbatim over the wire. */
export interface BridgeTraceEntry {
  readonly symbolId: string;
  readonly verb: TraceVerbKind;
  readonly span: Span;
  readonly payload?: string;
  readonly timestamp: number;
  readonly bufferSnapshot?: readonly { readonly label: string; readonly value: string }[];
  /** The resolved verb's own `desc` (`abort(value, desc)` / `fail(error, desc)`) — mirrors
   *  kernelee's `TraceSink`'s sixth argument / `TraceEntry.desc`. Additive and optional: absent
   *  whenever the resolved verb had no `desc`. */
  readonly desc?: string;
}

/** Mirrors `src/protocol.ts`'s `BridgeMessage`. */
export type BridgeMessage =
  | { readonly type: 'trace'; readonly entry: BridgeTraceEntry }
  | { readonly type: 'catalog'; readonly doc: WiringGraphDocument };

/** Mirrors `src/protocol.ts`'s `WireWiringGraphDocument` — same v6 envelope, `schemaVersion`
 *  widened to `number` so an additive kernelee bump (v7, ...) still passes `parseBridgeMessage`. */
export type WireWiringGraphDocument =
  Omit<WiringGraphDocument, 'schemaVersion'> & { readonly schemaVersion: number };

/** Mirrors `src/protocol.ts`'s `WireBridgeMessage` — the envelope `parseBridgeMessage`
 *  (`lib/bridgeMessage.ts`) narrows a raw WS frame to. */
export type WireBridgeMessage =
  | { readonly type: 'trace'; readonly entry: BridgeTraceEntry }
  | { readonly type: 'catalog'; readonly doc: WireWiringGraphDocument };

/** One editor entry — either a built-in or a `/panel-config.json`-supplied override/addition. */
export interface EditorDef {
  readonly id: string;
  readonly label: string;
  readonly urlTemplate: string;
}

/** Card sizing mode: 'fit-content' = box grows with the label, 'truncate' = fixed-width boxes,
 *  relaph ellipsizes the label to fit. */
export type CardSize = 'fit-content' | 'truncate';

/** Which side the inspector panel docks to (wiring view only). */
export type InspectorPosition = 'right' | 'bottom';

export type TabId = 'wiring' | 'trace';

// MARK: - kernel-introspect index.json (the part-kind coloring / source-link join)
//
// This document has no shipped TS package (it is emitted by the consumer's own kernel-introspect
// scanner) — the shape below is only as wide as `buildIndexJoin` (lib/indexJoin.ts) actually
// reads.

export interface IndexPart {
  readonly file: string;
  readonly kind: string;
}

export interface IndexHandler {
  readonly functionName?: string;
  readonly site?: string;
}

/** One `StageEntry.verbEmissions` / `GateEntry.verbEmissions` entry (kernel-introspect index
 *  schema v14): a `verb: 'abort' | 'fail'` reachable from this stage/gate, its `desc` condition
 *  string (`null` when the site called `abort(value)`/`fail(error)` with no desc argument — a
 *  real fact, distinct from "not scanned"), and the call `site` ("file:line"). Read only as wide
 *  as the panel actually uses; `verb` is kept `string` rather than a `'abort' | 'fail'` literal
 *  union for the same forward-compat reason `TraceVerbKind` is read broadly elsewhere in this
 *  file — a future verb kind must still degrade, not crash the join. */
export interface IndexVerbEmission {
  readonly verb: string;
  readonly desc: string | null;
  readonly site: string;
}

export interface IndexStage {
  readonly wireSite?: string;
  readonly handler?: IndexHandler;
  readonly branches?: readonly (readonly IndexStage[])[];
  /** Detached (untracked) fork branches — a `.spawn(x)` / `fork([], [x])` stage
   * (schemaVersion 5). A walk over `branches` must also cover this, or the
   * detached subtree's wire sites / handlers silently vanish from the join. */
  readonly untrackedBranches?: readonly (readonly IndexStage[])[];
  /** `null` = scanned by a pre-v14 index ("not scanned"); absent degrades the same way. Both
   *  collapse to "no verb chips for this stage" in `buildIndexJoin`. */
  readonly verbEmissions?: readonly IndexVerbEmission[] | null;
}

export interface IndexDriveSite {
  readonly mode: string;
  readonly owner?: string;
  readonly site: string;
}

export interface IndexEndpoint {
  readonly key: string;
  readonly stages?: readonly IndexStage[];
  readonly drivenBy?: readonly IndexDriveSite[];
}

export interface IndexSymbolSite {
  readonly site: string;
}

export interface IndexSymbol {
  readonly id: string;
  readonly declaration?: IndexSymbolSite;
  readonly implementation?: IndexSymbolSite;
}

/** One `gates[]` entry (kernel-introspect schema v11): the static-scan facts the runtime wiring
 *  document deliberately lacks — where the `declareGate(...)` call lives and which named handler
 *  it binds. Same join role `IndexStage.handler`/`wireSite` play for stage source links. */
export interface IndexGate {
  readonly id: string;
  readonly declarationSite?: string;
  readonly handler?: IndexHandler | null;
  /** Same shape/degrade contract as `IndexStage.verbEmissions` — a gate's own reachable
   *  `abort`/`fail` verbs (schema v14). */
  readonly verbEmissions?: readonly IndexVerbEmission[] | null;
}

export interface IndexDoc {
  readonly parts?: readonly IndexPart[];
  readonly endpoints?: readonly IndexEndpoint[];
  readonly symbols?: readonly IndexSymbol[];
  /** `null` = scanned by a pre-gate scanner (before index schema v11) — same null-vs-[] convention
   *  as the index's own sections; both degrade to "no gate source links" here. */
  readonly gates?: readonly IndexGate[] | null;
}

/** The join `buildIndexJoin` produces — see `docs/wire-links-positional-join-on-node-id-grammar.md`
 *  and `docs/part-kind-coloring-is-an-index-join.md` for why each of these exists. */
export interface IndexJoin {
  /** handler functionName -> part kind. */
  readonly kinds: ReadonlyMap<string, string>;
  /** handler functionName -> repo-relative "file:line". */
  readonly sites: ReadonlyMap<string, string>;
  /** canvas node id (same grammar as `buildChain` mints) -> wiring call's own "file:line". */
  readonly wireSites: ReadonlyMap<string, string>;
  /** endpoint key -> the index's own endpoint entry. */
  readonly endpoints: ReadonlyMap<string, IndexEndpoint>;
  /** symbolId -> the index's symbols[] entry. */
  readonly symbols: ReadonlyMap<string, IndexSymbol>;
  /** gateId -> the index's gates[] entry (declarationSite / named handler source links). */
  readonly gates: ReadonlyMap<string, IndexGate>;
  /** canvas node id (same grammar `wireSites` joins on) -> that stage's `verbEmissions` list —
   *  the abort/fail-chip data join. Only non-empty lists are keyed (a stage with none is simply
   *  absent, not present with `[]`). A gate's own `verbEmissions` travels on its `IndexGate` entry
   *  in `gates` above instead — no separate map needed there. */
  readonly verbEmissions: ReadonlyMap<string, readonly IndexVerbEmission[]>;
}

/** The shape `/panel-config.json` may hand the panel — every field optional/best-effort, same
 *  silent-degrade contract as the original boot(). */
export interface PanelConfig {
  readonly partColors?: Readonly<Record<string, string>>;
  readonly repoRoot?: string;
  readonly editors?: readonly Partial<EditorDef>[];
  readonly defaultEditor?: string;
  /**
   * The bridge's effective `--trace-cap` (mirrors its own `DEFAULT_TRACE_CAP`), injected as a
   * runtime fact the same way `repoRoot` is — see `servePanelConfig` in `src/server.ts`. Absent
   * (bridge launched without `--trace-cap`, or panel served standalone/offline) → the panel falls
   * back to its own built-in default (`panel-src/lib/trace.ts`'s `TRACE_CAP`).
   */
  readonly traceCap?: number;
}
