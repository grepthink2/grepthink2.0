import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Changing this value clears a caught error; pass the route path to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors, including a lazy page chunk that fails to load after
 * a deploy, so one broken screen shows a recoverable message instead of
 * blanking the whole app.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="error-boundary"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          minHeight: '40vh',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <h2 style={{ margin: 0 }}>Something went wrong</h2>
        <p style={{ margin: 0 }}>This screen hit an unexpected error. Try again, or reload the page.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={this.reset}>
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
