/**
 * React error boundary — catches render errors in child components so a crash
 * in one pane (graph, editor, AI panel) does not tear down the entire shell.
 *
 * Renders a pane-status message with the error details and a retry button.
 * The probeShell call logs the crash to the shell's probe stream.
 */
import React from "react";
import { probeShell } from "./shellLog";

interface Props {
  /** Short label for the pane being guarded (e.g. "graph", "editor"). */
  name: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    probeShell("shell.error.boundary", {
      pane: this.props.name,
      error: error.message,
      stack: info.componentStack?.slice(0, 800) ?? null,
    });
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="pane-status pane-status-failed" style={{ padding: "12px 14px" }}>
          <div style={{ marginBottom: 6 }}>
            <strong>{this.props.name}</strong> crashed: {this.state.error.message}
          </div>
          <button type="button" onClick={this.handleRetry}
            style={{ fontSize: "11px", padding: "3px 10px", cursor: "pointer" }}>
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
