'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary for the authenticated app shell.
 * Catches unhandled render errors so users see a recovery UI
 * instead of a blank screen.
 *
 * Place this as high as possible in the tree, but inside
 * client-side providers (auth, sidebar context, etc.).
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in all envs; Sentry picks this up automatically
    // via its Next.js integration if configured.
    console.error('[AppErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center"
          style={{ background: 'var(--color-bg-page)', color: 'var(--color-text-primary)' }}
        >
          <div
            className="rounded-full p-4"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Something went wrong
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              An unexpected error occurred. Try refreshing or click below to recover.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: 'var(--color-accent)',
                color: '#ffffff',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-primary)',
              }}
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
