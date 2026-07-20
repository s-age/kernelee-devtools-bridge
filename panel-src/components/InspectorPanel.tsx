import type { CSSProperties, RefObject } from 'react';
import type {
  EditorDef,
  IndexEndpoint,
  IndexGate,
  IndexSymbol,
  IndexVerbEmission,
  InspectorPosition,
  StageDescriptor,
  WiringEndpoint,
  WiringGuardEntry,
} from '../types.js';
import type { SelectedGate } from '../lib/graph.js';
import { EndpointInspector } from './EndpointInspector.js';
import { StageInspector } from './StageInspector.js';
import { GateInspector } from './GateInspector.js';
import * as sharedStyles from '../styles/shared.css.js';
import * as styles from '../styles/InspectorPanel.css.js';
import * as bodyStyles from '../styles/InspectorBody.css.js';

export interface InspectorPanelProps {
  readonly asideRef: RefObject<HTMLElement | null>;
  readonly style: CSSProperties | undefined;
  readonly editors: readonly EditorDef[];
  readonly selectedEditorId: string;
  readonly onEditorChange: (id: string) => void;
  readonly inspectorPosition: InspectorPosition;
  readonly onSetInspectorPosition: (position: InspectorPosition) => void;
  readonly selectedStage: StageDescriptor | null;
  readonly selectedStagePath: string | null;
  readonly selectedEntryEndpoint: WiringEndpoint | null;
  readonly selectedGate: SelectedGate | null;
  readonly guardsByTarget: ReadonlyMap<string, WiringGuardEntry>;
  readonly indexEndpointByKey: ReadonlyMap<string, IndexEndpoint>;
  readonly indexSymbolById: ReadonlyMap<string, IndexSymbol>;
  /** gateId -> the introspect index's gates[] entry (`IndexJoin.gates`) — the gate inspector's
   *  source-link join (declared / handler body), degrading away on a miss like every index join. */
  readonly indexGateById: ReadonlyMap<string, IndexGate>;
  /** canvas node id -> that stage's `verbEmissions` (`IndexJoin.verbEmissions`) — the stage
   *  inspector's abort/fail-emissions list (`StageInspector`). A gate's own emissions travel on
   *  `indexGateById`'s entry instead — no separate lookup needed for `GateInspector`. */
  readonly verbEmissionsByNodeId: ReadonlyMap<string, readonly IndexVerbEmission[]>;
  readonly handlerSiteByName: ReadonlyMap<string, string>;
  readonly wireSiteByPath: ReadonlyMap<string, string>;
  readonly editorUrl: (site: string) => string | null;
  readonly endpointKeys: ReadonlySet<string>;
  readonly onJumpToEndpoint: (key: string) => void;
}

/** The wiring view's detail panel: persistent chrome (Editor select + dock-side buttons) outside
 *  the part that changes on every selection — see
 *  `docs/inspector-chrome-lives-outside-the-wiped-body.md` for why that split matters. */
export function InspectorPanel({
  asideRef,
  style,
  editors,
  selectedEditorId,
  onEditorChange,
  inspectorPosition,
  onSetInspectorPosition,
  selectedStage,
  selectedStagePath,
  selectedEntryEndpoint,
  selectedGate,
  guardsByTarget,
  indexEndpointByKey,
  indexSymbolById,
  indexGateById,
  verbEmissionsByNodeId,
  handlerSiteByName,
  wireSiteByPath,
  editorUrl,
  endpointKeys,
  onJumpToEndpoint,
}: InspectorPanelProps) {
  const editorLabel = (editors.find((e) => e.id === selectedEditorId) ?? editors[0])?.label ?? '';

  return (
    <aside ref={asideRef as RefObject<HTMLElement>} className={`${styles.inspectorBase} ${styles.withHeader}`} style={style}>
      <div className={styles.header}>
        <label className={styles.headerLabel}>
          Editor:
          <select value={selectedEditorId} onChange={(event) => onEditorChange(event.target.value)}>
            {editors.map((editor) => (
              <option key={editor.id} value={editor.id}>
                {editor.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`${sharedStyles.dockBtn}${inspectorPosition === 'right' ? ` ${sharedStyles.dockBtnActive}` : ''}`}
          title="Dock details to the right"
          onClick={() => onSetInspectorPosition('right')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <rect x="9.5" y="4" width="3.2" height="8" rx="0.8" fill="currentColor" />
          </svg>
        </button>
        <button
          className={`${sharedStyles.dockBtn}${inspectorPosition === 'bottom' ? ` ${sharedStyles.dockBtnActive}` : ''}`}
          title="Dock details to the bottom"
          onClick={() => onSetInspectorPosition('bottom')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <rect x="3.3" y="9" width="9.4" height="3.2" rx="0.8" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>
        {selectedGate ? (
          <GateInspector
            gate={selectedGate}
            index={guardsByTarget.get(selectedGate.targetId)?.gateIds.indexOf(selectedGate.gateId) ?? 0}
            total={guardsByTarget.get(selectedGate.targetId)?.gateIds.length ?? 1}
            indexGate={indexGateById.get(selectedGate.gateId)}
            editorUrl={editorUrl}
            editorLabel={editorLabel}
          />
        ) : selectedEntryEndpoint ? (
          <EndpointInspector endpoint={selectedEntryEndpoint} indexEndpointByKey={indexEndpointByKey} editorUrl={editorUrl} editorLabel={editorLabel} />
        ) : selectedStage ? (
          <StageInspector
            stage={selectedStage}
            selectedStagePath={selectedStagePath}
            indexSymbolById={indexSymbolById}
            verbEmissionsByNodeId={verbEmissionsByNodeId}
            handlerSiteByName={handlerSiteByName}
            wireSiteByPath={wireSiteByPath}
            editorUrl={editorUrl}
            editorLabel={editorLabel}
            endpointKeys={endpointKeys}
            onJumpToEndpoint={onJumpToEndpoint}
          />
        ) : (
          <p className={bodyStyles.muted}>Click a stage to see its details.</p>
        )}
      </div>
    </aside>
  );
}
