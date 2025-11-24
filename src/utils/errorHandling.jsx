import React from 'react';
import logger from '@/lib/logger';
import { AlertCircle, CheckCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Error Handling Utilities
 * Provides consistent error handling patterns across the application
 */

export class AppError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', userMessage = null, recoverable = true) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage || this.getDefaultUserMessage(code);
    this.recoverable = recoverable;
  }

  getDefaultUserMessage(code) {
    const messages = {
      FILE_NOT_FOUND: 'The requested file could not be found.',
      NETWORK_ERROR: 'Unable to connect to the server. Please check your internet connection.',
      PERMISSION_DENIED: 'You do not have permission to perform this action.',
      INVALID_INPUT: 'The provided input is not valid.',
      ANALYSIS_FAILED: 'Failed to analyze the audio file. Please try a different file.',
      UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
    };
    return messages[code] || messages.UNKNOWN_ERROR;
  }
}

export const handleAsyncError = (error, context = '') => {
  logger.error(`[${context}] Error:`, error);

  // Convert to AppError if not already
  if (!(error instanceof AppError)) {
    if (error.code === 'ENOENT') {
      return new AppError(error.message, 'FILE_NOT_FOUND', null, true);
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new AppError(error.message, 'NETWORK_ERROR', null, true);
    }
    return new AppError(error.message || String(error), 'UNKNOWN_ERROR', null, true);
  }

  return error;
};

export const showErrorToast = (error, onRetry = null) => {
  // This would integrate with a toast system
  // For now, we'll use logger and alert as fallback
  logger.error('Error:', error);

  const message = error.userMessage || error.message;
  if (error.recoverable && onRetry) {
    if (confirm(`${message}\n\nWould you like to try again?`)) {
      onRetry();
    }
  } else {
    alert(message);
  }
};

/**
 * Loading States Components
 */

export const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />;
};

export const LoadingOverlay = ({ message = 'Loading...', children }) => (
  <div className="relative">
    {children}
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="text-center space-y-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  </div>
);

export const ProgressBar = ({ progress, className = '', showPercentage = true }) => (
  <div className={`w-full bg-muted rounded-full h-2 ${className}`}>
    <div
      className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
    />
    {showPercentage && (
      <div className="text-xs text-muted-foreground mt-1 text-center">{Math.round(progress)}%</div>
    )}
  </div>
);

export const StatusIndicator = ({ status, message }) => {
  const configs = {
    loading: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50' },
    success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
    error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50' },
    warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50' },
  };

  const config = configs[status] || configs.info;
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md ${config.bg}`}>
      <Icon className={`h-4 w-4 ${config.color}`} />
      <span className="text-sm">{message}</span>
    </div>
  );
};

/**
 * Async Operation Hook
 * Provides consistent loading, error, and retry handling for async operations
 */
export const useAsyncOperation = (operation, options = {}) => {
  const { onSuccess, onError, retryCount = 3, retryDelay = 1000 } = options;

  const [state, setState] = React.useState({
    loading: false,
    error: null,
    data: null,
    retryAttempts: 0,
  });

  const execute = React.useCallback(
    async (...args) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      let attempts = 0;
      while (attempts <= retryCount) {
        try {
          const result = await operation(...args);
          setState({
            loading: false,
            error: null,
            data: result,
            retryAttempts: attempts,
          });
          onSuccess?.(result);
          return result;
        } catch (error) {
          const appError = handleAsyncError(error, 'useAsyncOperation');

          if (attempts < retryCount && appError.recoverable) {
            attempts++;
            logger.debug(`Retrying operation (attempt ${attempts}/${retryCount})...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay * attempts));
            continue;
          }

          setState({
            loading: false,
            error: appError,
            data: null,
            retryAttempts: attempts,
          });
          onError?.(appError);
          throw appError;
        }
      }
    },
    [operation, retryCount, retryDelay, onSuccess, onError],
  );

  const retry = React.useCallback(() => {
    if (state.error?.recoverable) {
      execute();
    }
  }, [state.error, execute]);

  return {
    ...state,
    execute,
    retry,
    canRetry: state.error?.recoverable && state.retryAttempts < retryCount,
  };
};
