import { useCallback, useRef, useState } from 'react';
import type { BridgeTraceEntry, TabId } from '../types.js';
import { trimTraceEntries } from '../lib/trace.js';

/**
 * The trace timeline's rAF-coalesced, hidden-tab-skipping ingestion pipeline. The mutable ring
 * buffer + "what's dirty" flags live in refs (updated synchronously on every WS message);
 * only the rAF-coalesced *flush* copies them
 * into React state, and that flush is skipped entirely while the trace tab isn't visible — so a
 * busy app pays zero `buildForest`/render cost for messages arriving while the wiring tab is
 * showing. `setActiveTabHint` must be called synchronously from the tab-click handler (not via a
 * `useEffect` on an `activeTab` prop) so the very same click that reveals the tab can also
 * trigger the catch-up flush without racing React's own commit timing.
 */
export function useTracePipeline() {
  const [traceEntries, setTraceEntries] = useState<readonly BridgeTraceEntry[]>([]);
  const [usingSampleTrace, setUsingSampleTrace] = useState(true);
  const [selectedTraceEntry, setSelectedTraceEntryState] = useState<BridgeTraceEntry | null>(null);
  const [collapsedSpanIds, setCollapsedSpanIds] = useState<ReadonlySet<string>>(() => new Set());

  const bufferRef = useRef<BridgeTraceEntry[]>([]);
  const selectedRef = useRef<BridgeTraceEntry | null>(null);
  const usingSampleRef = useRef(true);
  const timelineDirtyRef = useRef(false);
  const inspectorDirtyRef = useRef(false);
  const scheduledRef = useRef(false);
  const activeTabRef = useRef<TabId>('wiring');

  const flush = useCallback(() => {
    scheduledRef.current = false;
    if (activeTabRef.current !== 'trace') return; // stays dirty; flushed on tab switch instead
    if (timelineDirtyRef.current) {
      timelineDirtyRef.current = false;
      setTraceEntries([...bufferRef.current]);
      setUsingSampleTrace(usingSampleRef.current);
    }
    if (inspectorDirtyRef.current) {
      inspectorDirtyRef.current = false;
      setSelectedTraceEntryState(selectedRef.current);
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    requestAnimationFrame(flush);
  }, [flush]);

  const pushTraceEntry = useCallback(
    (entry: BridgeTraceEntry) => {
      bufferRef.current = trimTraceEntries([...bufferRef.current, entry]) as BridgeTraceEntry[];
      if (selectedRef.current && !bufferRef.current.includes(selectedRef.current)) {
        selectedRef.current = null;
        inspectorDirtyRef.current = true; // selection was evicted — only case a new entry affects the inspector
      }
      usingSampleRef.current = false;
      timelineDirtyRef.current = true;
      scheduleFlush();
    },
    [scheduleFlush],
  );

  /** Boot's initial `/sample-trace.json` load — applied unconditionally (not gated by tab
   *  visibility), regardless of which tab happens to be active at that point. */
  const loadSampleTrace = useCallback((entries: readonly BridgeTraceEntry[]) => {
    bufferRef.current = [...entries];
    usingSampleRef.current = true;
    setTraceEntries(entries);
    setUsingSampleTrace(true);
  }, []);

  const loadSampleTraceFailed = useCallback(() => {
    bufferRef.current = [];
    usingSampleRef.current = false;
    setTraceEntries([]);
    setUsingSampleTrace(false);
  }, []);

  const selectTraceEntry = useCallback((entry: BridgeTraceEntry | null) => {
    selectedRef.current = entry;
    setSelectedTraceEntryState(entry);
  }, []);

  const clearTrace = useCallback(() => {
    bufferRef.current = [];
    selectedRef.current = null;
    usingSampleRef.current = false;
    timelineDirtyRef.current = false;
    inspectorDirtyRef.current = false;
    setTraceEntries([]);
    setSelectedTraceEntryState(null);
    setUsingSampleTrace(false);
  }, []);

  const toggleSpanCollapse = useCallback((spanId: string) => {
    setCollapsedSpanIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  }, []);

  /** Call synchronously from the tab-switch handler, alongside (not instead of) the caller's own
   *  `setActiveTab` state update. */
  const setActiveTabHint = useCallback(
    (tab: TabId) => {
      activeTabRef.current = tab;
      if (tab === 'trace' && (timelineDirtyRef.current || inspectorDirtyRef.current)) {
        flush();
      }
    },
    [flush],
  );

  return {
    traceEntries,
    usingSampleTrace,
    selectedTraceEntry,
    collapsedSpanIds,
    pushTraceEntry,
    loadSampleTrace,
    loadSampleTraceFailed,
    selectTraceEntry,
    clearTrace,
    toggleSpanCollapse,
    setActiveTabHint,
  };
}
