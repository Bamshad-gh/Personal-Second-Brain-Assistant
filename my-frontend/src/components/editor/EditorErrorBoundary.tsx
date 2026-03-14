/**
 * components/editor/EditorErrorBoundary.tsx
 *
 * What:  A React class-based error boundary that catches any crash inside the
 *        TipTap editor (extension errors, JSON parse failures, SSR mismatches)
 *        and shows a safe recovery UI instead of a white blank screen.
 *
 * Usage:
 *   <EditorErrorBoundary>
 *     <Editor ... />
 *   </EditorErrorBoundary>
 *
 * WHERE TO ADD CRASH REPORTING:
 *   componentDidCatch() below — send error + componentStack to Sentry/LogRocket
 */

'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  hasError: boolean;
  error:    Error | null;
}

export class EditorErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // WHERE TO ADD: send to Sentry / LogRocket / Datadog here
    console.error('[EditorErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <p className="text-3xl">⚠️</p>
          <p className="text-neutral-300 font-medium">Editor crashed</p>
          <p className="text-sm text-neutral-500 max-w-xs">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="mt-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
