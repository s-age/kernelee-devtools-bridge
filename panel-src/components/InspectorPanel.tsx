import type { CSSProperties, RefObject } from 'react';
import type { EditorDef, IndexEndpoint, IndexSymbol, InspectorPosition, StageDescriptor, WiringEndpoint } from '../types.js';
import { EndpointInspector } from './EndpointInspector.js';
import { StageInspector } from './StageInspector.js';
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
  readonly indexEndpointByKey: ReadonlyMap<string, IndexEndpoint>;
  readonly indexSymbolById: ReadonlyMap<string, IndexSymbol>;
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
  indexEndpointByKey,
  indexSymbolById,
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
        {selectedEntryEndpoint ? (
          <EndpointInspector endpoint={selectedEntryEndpoint} indexEndpointByKey={indexEndpointByKey} editorUrl={editorUrl} editorLabel={editorLabel} />
        ) : selectedStage ? (
          <StageInspector
            stage={selectedStage}
            selectedStagePath={selectedStagePath}
            indexSymbolById={indexSymbolById}
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
