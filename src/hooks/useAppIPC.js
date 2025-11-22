import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
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

async function invoke(channel, data) {
  if (window?.ipc?.invoke) {
    return window.ipc.invoke(channel, data);
  }
  return Promise.resolve(undefined);
}

/**
 * useAppIPC - Ref-based hook to prevent infinite re-initialization
 * 
 * Supports two usage patterns:
 * 1. Handler-based (new): useAppIPC({ onStatus, onBlockUpdate })
 * 2. Return-based (backward compatible): useAppIPC() returns { blocks, status, ... }
 */
export default function useAppIPC(handlers = null) {
  // Ref to hold latest handlers - this never changes, so main effect stays stable
  const latestHandlersRef = useRef(handlers || {});
  
  // Update ref whenever handlers change (runs every render, but doesn't trigger main effect)
  useEffect(() => {
    latestHandlersRef.current = handlers || {};
  }, [handlers]);

  // For backward compatibility: if no handlers provided, use context-based state
  const { blocks: contextBlocks, setBlocks: contextSetBlocks } = useBlocks();
  const [status, setStatus] = useState({ bpm: null, connected: false });
  const [blocks, setBlocksState] = useState(contextBlocks || []);

  // Main Effect: Runs EXACTLY ONCE on mount (empty dependency array [])
  useEffect(() => {
    if (!window?.ipc?.on) {
      console.warn('[useAppIPC] window.ipc not available');
      return;
    }

    // Listen for backend logs and forward to DevTools console
    const handleDebugLog = (message) => {
      if (typeof message === 'string') {
        console.log('%c[BACKEND]', 'color: #00ff00; font-weight: bold', message);
      } else {
        console.log('%c[BACKEND]', 'color: #00ff00; font-weight: bold', JSON.stringify(message));
      }
    };

    // Status update handler - uses latestHandlersRef.current to always call latest handler
    const handleStatus = (data) => {
      if (!data) return;
      
      const handlers = latestHandlersRef.current;
      
      // If handler-based pattern, call onStatus
      if (handlers.onStatus) {
        handlers.onStatus(data);
      } else {
        // Backward compatible: update state
        setStatus((s) => {
          const bpmChanged = data.bpm !== undefined && data.bpm !== s.bpm;
          const connectedChanged = data.connected !== undefined && data.connected !== s.connected;
          const otherChanged = Object.keys(data).some(key => key !== 'bpm' && key !== 'connected' && data[key] !== s[key]);
          
          if (!bpmChanged && !connectedChanged && !otherChanged) {
            return s; // No change, return same object to prevent re-render
          }
          
          return { ...s, ...data };
        });
      }
    };

    // Connection handler
    const handleConn = (flag) => {
      const handlers = latestHandlersRef.current;
      
      if (handlers.onStatus) {
        handlers.onStatus({ connected: Boolean(flag) });
      } else {
        // Backward compatible: update state
        setStatus((s) => {
          const connected = Boolean(flag);
          if (s.connected === connected) {
            return s; // No change, return same object
          }
          return { ...s, connected };
        });
      }
    };

    // Blocks update handler
    const handleBlockUpdate = (newBlocks) => {
      const handlers = latestHandlersRef.current;
      
      // If handler-based pattern, call onBlockUpdate
      if (handlers.onBlockUpdate) {
        handlers.onBlockUpdate(newBlocks);
      } else {
        // Backward compatible: update state and context
        setBlocksState(newBlocks || []);
        if (contextSetBlocks) {
          contextSetBlocks(newBlocks || []);
        }
      }
    };

    // Subscribe to IPC channels
    const unsubscribeLogs = window.ipc.on('DEBUG:LOG', handleDebugLog);
    const unsubStatus = window.ipc.on('UI:STATUS_UPDATE', handleStatus);
    const unsubConn = window.ipc.on('UI:CONNECTED', handleConn);
    const unsubBlocks = window.ipc.on('UI:BLOCKS_UPDATE', handleBlockUpdate);

    // NOTE: UI:REQUEST_INITIAL is handled by BlocksContext to prevent duplicate requests
    // We only request status here, not blocks

    // Request initial status ONCE on mount
    try {
      window.ipc.send('UI:REQUEST_STATUS');
      if (!window.__statusRequested) {
        console.log('[useAppIPC] Requested initial status (ONCE on mount)');
        window.__statusRequested = true;
      }
    } catch (e) {
      console.warn('[useAppIPC] Failed to request initial status:', e);
    }

    // Cleanup: unsubscribe on unmount
    return () => {
      try {
        unsubscribeLogs && unsubscribeLogs();
      } catch (e) {}
      try {
        unsubStatus && unsubStatus();
      } catch (e) {}
      try {
        unsubConn && unsubConn();
      } catch (e) {}
      try {
        unsubBlocks && unsubBlocks();
      } catch (e) {}
    };
  }, []); // EMPTY dependency array - runs EXACTLY ONCE on mount

  // Memoized callbacks for backward compatibility
  const sendMacro = useCallback((macroName, payload = {}) => {
    return sendCommand('NETWORK:SEND_MACRO', { macro: macroName, payload });
  }, []);

  const requestRefresh = useCallback(() => {
    return sendCommand('UI:REQUEST_REFRESH');
  }, []);

  const loadArrangements = useCallback(() => {
    return invoke('DB:LOAD_ARRANGEMENT');
  }, []);

  // If handlers provided, return minimal API (handler-based pattern)
  if (handlers) {
    return {
      sendCommand,
      sendMacro,
      requestRefresh,
      loadArrangements,
      invoke,
    };
  }

  // Backward compatible: return full API with state
  return {
    blocks: blocks.length > 0 ? blocks : contextBlocks || [],
    setBlocks: (newBlocks) => {
      setBlocksState(newBlocks);
      if (contextSetBlocks) {
        contextSetBlocks(newBlocks);
      }
    },
    status,
    connected: Boolean(status.connected),
    sendMacro,
    requestRefresh,
    sendCommand,
    invoke,
    loadArrangements,
  };
}

// Export useStatus for backward compatibility
export function useStatus() {
  const [status, setStatus] = useState({ bpm: null, connected: false });
  
  useEffect(() => {
    if (!window?.ipc?.on) return undefined;

    const handleStatus = (data) => {
      if (!data) return;
      setStatus((s) => {
        const bpmChanged = data.bpm !== undefined && data.bpm !== s.bpm;
        const connectedChanged = data.connected !== undefined && data.connected !== s.connected;
        const otherChanged = Object.keys(data).some(key => key !== 'bpm' && key !== 'connected' && data[key] !== s[key]);
        
        if (!bpmChanged && !connectedChanged && !otherChanged) {
          return s;
        }
        
        return { ...s, ...data };
      });
    };

    const handleConn = (flag) => {
      setStatus((s) => {
        const connected = Boolean(flag);
        if (s.connected === connected) {
          return s;
        }
        return { ...s, connected };
      });
    };

    const unsubStatus = window.ipc.on('UI:STATUS_UPDATE', handleStatus);
    const unsubConn = window.ipc.on('UI:CONNECTED', handleConn);

    try {
      window.ipc.send('UI:REQUEST_STATUS');
      if (!window.__statusRequested) {
        console.log('[useStatus] Requested initial status');
        window.__statusRequested = true;
      }
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
  }, []);

  return status;
}
