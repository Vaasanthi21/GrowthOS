import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-xl mx-auto my-12 bg-red-50 border border-red-200 rounded-xl shadow-lg">
          <h2 className="text-lg font-bold text-red-700">Studio Viewport Crashed</h2>
          <p className="text-sm text-red-600 mt-2 font-semibold">
            {this.state.error?.toString() || "Unknown error"}
          </p>
          <pre className="text-xs font-mono bg-red-100/50 p-4 rounded mt-4 text-red-800 overflow-auto max-h-60">
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded hover:bg-red-700 transition-colors"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
