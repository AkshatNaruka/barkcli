import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-6 text-center">
          <div className="w-10 h-10 rounded-full bg-danger/10 border border-danger/20 flex items-center justify-center text-danger mb-3">
            <Icon name="x" size={18} />
          </div>
          <h2 className="text-sm font-semibold text-text mb-1">
            {this.props.fallbackTitle || "Something went wrong in this view"}
          </h2>
          <p className="text-xs text-muted max-w-md mb-4 font-mono">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="bark-button text-xs px-3 py-1.5"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => { window.location.hash = "#/chat"; }}
              className="bark-primary text-xs px-3 py-1.5"
            >
              Back to Threads
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
