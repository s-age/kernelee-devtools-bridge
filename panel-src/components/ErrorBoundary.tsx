import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Last line of defense against a render-time throw the panel's own guards (`parseBridgeMessage`
 * at the WS boundary, the server's `isBridgeMessage` before that) don't cover — a deep per-field
 * malformation inside an otherwise envelope-valid catalog (e.g. an `endpoints[]` entry missing a
 * key some inner component reads unguarded). Deliberately minimal: an error message plus a Reload
 * button, not a diagnostic UI — this only exists so a render throw shows a message instead of
 * unmounting the whole tree to a blank page.
 *
 * Catches render/lifecycle errors only (React's `componentDidCatch` contract) — it does NOT catch
 * throws inside event handlers or async callbacks (the WS `message` listener, `fetch` callbacks in
 * `App`'s boot effect). Those are `parseBridgeMessage`'s job; the two are a deliberate two-part
 * defense, not redundant with each other. No test coverage: this package has no render-test
 * harness (jsdom/testing-library) and adding one for a single fallback path was judged more
 * infrastructure than the fallback is worth — verified by manual drive instead (see
 * `docs/bridge-drops-nonconforming-messages.md`).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[kernelee-devtools-bridge] panel crashed:', error, info.componentStack);
  }

  public override render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'flex-start',
          maxWidth: '640px',
          margin: '48px auto',
          padding: '20px 24px',
          border: '1px solid #c33',
          borderRadius: '6px',
          background: '#2a1414',
          color: '#f5d0d0',
          fontFamily: 'monospace',
        }}
      >
        <strong>kernelee-devtools-bridge: panel crashed</strong>
        <span>{error.message}</span>
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
