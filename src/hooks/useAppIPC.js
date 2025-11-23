import { useEffect, useState, useCallback } from 'react';
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
      console.log('[useStatus] Requested initial status');
    } catch (e) {
      console.warn('[useStatus] Failed to request initial status:', e);
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
