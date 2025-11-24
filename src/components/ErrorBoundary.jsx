import React from 'react';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      retryCount: 0,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    const { retryCount } = this.state;
    if (retryCount < 3) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: retryCount + 1,
      });
    } else {
      // After 3 retries, force reload
      window.location.reload();
    }
  };

  handleReport = () => {
    const { error, errorInfo } = this.state;
    const report = {
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    };

    // Copy to clipboard for user to report
    navigator.clipboard
      .writeText(JSON.stringify(report, null, 2))
      .then(() => alert('Error details copied to clipboard. Please report this to the developers.'))
      .catch(() => alert('Failed to copy error details. Please screenshot this page.'));
  };

  render() {
    if (this.state.hasError) {
      const { error, retryCount } = this.state;
      const isRetryable = retryCount < 3;

      return (
        <div className="h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <AlertTriangle className="h-16 w-16 text-destructive" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
              <p className="text-muted-foreground">
                {error?.message || 'An unexpected error occurred'}
              </p>
            </div>

            <div className="space-y-3">
              {isRetryable ? (
                <button
                  onClick={this.handleRetry}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again {retryCount > 0 && `(${retryCount}/3)`}
                </button>
              ) : (
                <button
                  onClick={() => window.location.reload()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Page
                </button>
              )}

              <button
                onClick={this.handleReport}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors"
              >
                <Bug className="h-4 w-4" />
                Report Issue
              </button>
            </div>

            <details className="text-left">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                Technical Details
              </summary>
              <div className="mt-3 p-3 bg-muted rounded-md">
                <div className="text-xs font-mono text-muted-foreground space-y-2">
                  <div>
                    <strong>Error:</strong> {error?.name || 'Unknown'}
                  </div>
                  <div>
                    <strong>Message:</strong> {error?.message || 'No message'}
                  </div>
                  <div>
                    <strong>Component:</strong> {this.props.componentName || 'Unknown'}
                  </div>
                  <div>
                    <strong>Time:</strong> {new Date().toLocaleString()}
                  </div>
                </div>
                {process.env.NODE_ENV === 'development' && (
                  <pre className="mt-3 text-xs overflow-auto max-h-32 bg-background p-2 rounded border">
                    {error?.stack || 'No stack trace available'}
                  </pre>
                )}
              </div>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
