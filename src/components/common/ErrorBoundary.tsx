import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
    
    // You could also log to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return this.props.fallback || (
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}