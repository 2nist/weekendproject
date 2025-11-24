import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import logger from '@/lib/logger';
import PropTypes from 'prop-types';

const BlocksContext = createContext(null);

// Hook for accessing BlocksContext - exported before the provider for Fast Refresh stability
export function useBlocks() {
  const context = useContext(BlocksContext);
  if (!context) {
    throw new Error('useBlocks must be used within BlocksProvider');
  }
  return context;
}

// Global flag to prevent multiple requests across HMR or re-mounts
if (globalThis.__blocksRequestSent === undefined) {
  globalThis.__blocksRequestSent = false;
}
if (globalThis.__blocksRegistered === undefined) {
  globalThis.__blocksRegistered = false;
}

export function BlocksProvider({ children }) {
  const [blocks, setLocalBlocks] = useState(() => globalThis.__lastBlocks || []);
  const hasRequestedRef = useRef(false);
  const lastBlocksHash = useRef(null);

  useEffect(() => {
    if (!globalThis.__blocksMountCount) globalThis.__blocksMountCount = 0;
    globalThis.__blocksMountCount++;
    logger.debug(
      '[BlocksProvider] Mounting - subscribing to blocks updates (SINGLETON) - count:',
      globalThis.__blocksMountCount,
    );

    const handleIncomingBlocks = (data) => {
      const blocksArray = Array.isArray(data) ? data : [];
      logger.debug('[BlocksProvider] UI:BLOCKS_UPDATE received:', blocksArray.length, 'blocks');
      try {
        const hash = JSON.stringify(blocksArray);
        if (lastBlocksHash.current === hash) {
          logger.debug('[BlocksProvider] Received identical blocks; skipping update');
        } else {
          setLocalBlocks(blocksArray);
          lastBlocksHash.current = hash;
        }
      } catch (err) {
        logger.error('[BlocksProvider] Error hashing blocks for comparison:', err);
        setLocalBlocks(blocksArray);
      }
      globalThis.__lastBlocks = blocksArray;
      // Mark that we have received blocks, so other mounts don't re-request
      globalThis.__blocksRequestSent = true;
    };

    // No local unsubscribe - global unsub is stored in globalThis.__blocksUnsub for persistence
    if (globalThis?.ipc?.on && !globalThis.__blocksRegistered) {
      // Register global IPC handler and store unsubscribe function globally to avoid re-registers on HMR remounts
      globalThis.__blocksUnsub = globalThis.ipc.on('UI:BLOCKS_UPDATE', handleIncomingBlocks);
      globalThis.__blocksRegistered = true;

      // Request initial blocks ONCE for the entire app (survives StrictMode and HMR remounts)
      if (!globalThis.__blocksRequestSent && !hasRequestedRef.current) {
        try {
          globalThis.ipc.send('UI:REQUEST_INITIAL');
          logger.debug('[BlocksProvider] Requested initial blocks from backend (ONCE)');
          globalThis.__blocksRequestSent = true;
          hasRequestedRef.current = true;
        } catch (error) {
          logger.error('[BlocksProvider] Error requesting initial blocks:', error);
        }
      } else {
        logger.debug('[BlocksProvider] Skipping initial request; already sent');
      }
    }

    const browserHandler = (event) => handleIncomingBlocks(event.detail);
    globalThis.addEventListener('UI:BLOCKS_UPDATE', browserHandler);

    if (!globalThis?.ipc?.on && globalThis.__lastBlocks) {
      handleIncomingBlocks(globalThis.__lastBlocks);
    }

    return () => {
      globalThis.__blocksMountCount = Math.max(0, (globalThis.__blocksMountCount || 1) - 1);
      logger.debug(
        '[BlocksProvider] Unmounting - cleaning up subscriptions - remaining:',
        globalThis.__blocksMountCount,
      );
      try {
        // Do not unsubscribe the global IPC handler - it should persist across HMR remounts
        // Only cleanup browser handler for this instance below
      } catch (e) {
        logger.error('[BlocksProvider] Error unsubscribing blocks:', e);
      }
      globalThis.removeEventListener('UI:BLOCKS_UPDATE', browserHandler);
    };
  }, []); // Empty deps - only run once per mount

  const setBlocks = React.useCallback((value) => {
    setLocalBlocks((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      globalThis.__lastBlocks = next;
      if (globalThis?.electronAPI?.invoke) {
        globalThis.electronAPI.invoke('ARCHITECT:UPDATE_BLOCKS', next).catch((error) => {
          logger.error('Error syncing blocks with backend:', error);
        });
      }
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ blocks, setBlocks }), [blocks, setBlocks]);

  return <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>;
}

BlocksProvider.propTypes = {
  children: PropTypes.node,
};
