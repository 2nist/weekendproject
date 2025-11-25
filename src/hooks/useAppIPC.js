import { useEffect, useState, useCallback } from 'react';
import logger from '@/lib/logger';
import { useBlocks } from '../contexts/BlocksContext';

// Async command sender that never blocks the UI thread.
export async function sendCommand(command, payload = {}) {
  // Prefer the new request-response API exposed by the preload: electronAPI.invoke
  if (window?.electronAPI?.invoke) {
    // invoke returns a Promise which resolves with the main process reply
    return window.electronAPI.invoke(command, payload);
  }

  // Fallback: fire-and-forget send to preserve non-blocking behavior
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        if (window?.ipc?.send) {
          window.ipc.send(command, payload);
        }
      } catch (e) {
        // ignore send errors on renderer side
      }
      resolve(undefined);
    }, 0);
  });
}

// Hook to subscribe to real-time status updates (BPM, connection)
export function useStatus() {
  const [status, setStatus] = useState({ bpm: null, connected: false });

  useEffect(() => {
    if (!window?.ipc?.on) return undefined;

    // Define handlers inline to ensure they're stable
    const handleStatus = (data) => {
      setStatus((s) => ({ ...s, ...(data || {}) }));
    };

    const handleConn = (flag) => {
      setStatus((s) => ({ ...s, connected: Boolean(flag) }));
    };

    const unsubStatus = window.ipc.on('UI:STATUS_UPDATE', handleStatus);
    const unsubConn = window.ipc.on('UI:CONNECTED', handleConn);

    // request initial status ONCE on mount
    try {
      window.ipc.send('UI:REQUEST_STATUS');
      logger.debug('[useStatus] Requested initial status');
    } catch (e) {
      logger.warn('[useStatus] Failed to request initial status:', e);
    }

    return () => {
      try {
        unsubStatus && unsubStatus();
      } catch (e) {}
      try {
        unsubConn && unsubConn();
      } catch (e) {}
    };
  }, []); // Empty dependency array - only run once on mount

  return status;
}

async function invoke(channel, data) {
  if (window?.ipc?.invoke) {
    return window.ipc.invoke(channel, data);
  }
  return Promise.resolve(undefined);
}

// Backwards-compatible hook for components that need blocks + status
export default function useAppIPC() {
  const { blocks, setBlocks } = useBlocks();
  const status = useStatus();

  const sendMacro = useCallback((macroName, payload = {}) => {
    return sendCommand('NETWORK:SEND_MACRO', { macro: macroName, payload });
  }, []);

  const requestRefresh = useCallback(() => {
    return sendCommand('UI:REQUEST_REFRESH');
  }, []);

  const loadArrangements = useCallback(() => {
    return invoke('DB:LOAD_ARRANGEMENT');
  }, []);

  useEffect(() => {
    if (!window?.ipc?.on) return undefined;

    const logWithStyle = (level = 'INFO', entries = []) => {
      const args = Array.isArray(entries) ? entries : [entries];
      const levelUpper = String(level).toUpperCase();
      const hasPythonTag = args.some(
        (entry) =>
          typeof entry === 'string' &&
          entry.toUpperCase().includes('PYTHON'),
      );

      let label = hasPythonTag ? '[PYTHON]' : '[BACKEND]';
      let style = hasPythonTag
        ? 'color: #ffff55; font-weight: bold'
        : 'color: #00ff00; font-weight: bold';
      let consoleMethod = console.log;

      if (levelUpper.includes('ERROR')) {
        label = hasPythonTag ? '[PYTHON ERROR]' : '[BACKEND ERROR]';
        style = 'color: #ff5555; font-weight: bold';
        consoleMethod = console.error;
      }

      try {
        consoleMethod?.(`%c${label}`, style, ...args);
      } catch (err) {
        // Fallback to default logging if styling fails
        consoleMethod?.(label, ...args);
      }
    };

    const unsubscribeMain = window.ipc.on('MAIN:LOG', (payload) => {
      if (!payload) return;
      const { level = 'INFO', args = [] } = payload;
      logWithStyle(level, args);
    });

    const unsubscribeDebug = window.ipc.on('DEBUG:LOG', (message) => {
      const args = Array.isArray(message) ? message : [message];
      logWithStyle('INFO', args);
    });

    return () => {
      try {
        unsubscribeMain && unsubscribeMain();
      } catch (err) {}
      try {
        unsubscribeDebug && unsubscribeDebug();
      } catch (err) {}
    };
  }, []);

  return {
    blocks,
    setBlocks,
    status,
    connected: Boolean(status.connected),
    sendMacro,
    requestRefresh,
    sendCommand,
    useStatus,
    invoke,
    loadArrangements,
  };
}
