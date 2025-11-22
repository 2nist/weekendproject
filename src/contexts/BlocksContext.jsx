import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

const BlocksContext = createContext(null);

const REQUEST_COOLDOWN_MS = 2000; // Minimum time between requests

// Module-level singleton to prevent multiple requests across ALL instances
// This persists even if the component unmounts/remounts
let globalRequestMade = false;
let globalLastRequestTime = 0;

export function BlocksProvider({ children }) {
  const [blocks, setBlocksState] = useState(() => {
    try {
      return (typeof window !== 'undefined' && window.__lastBlocks) || [];
    } catch (e) {
      return [];
    }
  });
  const hasRequestedRef = useRef(false);
  const effectHasRunRef = useRef(false);
  const isUpdatingFromBackendRef = useRef(false); // Flag to prevent feedback loop
  const lastSyncedBlocksRef = useRef(null); // Track last synced value (as JSON string) to prevent duplicate syncs

  useEffect(() => {
    // CRITICAL: This effect must run EXACTLY ONCE per app lifetime
    // Use multiple guards to prevent re-execution (including React StrictMode double-mount)
    if (effectHasRunRef.current) {
      console.warn('[BlocksProvider] ⚠️ Effect attempted to run again - returning early');
      return;
    }
    effectHasRunRef.current = true;
    
    console.log('[BlocksProvider] 🔵 Mounting - subscribing to blocks updates (SINGLETON)');

    const handleIncomingBlocks = (data) => {
      try {
        const blocksArray = Array.isArray(data) ? data : [];
        const newStr = JSON.stringify(blocksArray);
        
        // Set flag IMMEDIATELY to prevent feedback loop - this update came from backend
        isUpdatingFromBackendRef.current = true;
        
        // Update the last synced ref so we don't sync this value back
        lastSyncedBlocksRef.current = newStr;
        
        // Only update if blocks actually changed (deep comparison)
        setBlocksState((prev) => {
          try {
            const prevStr = JSON.stringify(prev);
            if (prevStr !== newStr) {
              console.log('[BlocksProvider] UI:BLOCKS_UPDATE received:', blocksArray.length, 'blocks');
              if (typeof window !== 'undefined') {
                window.__lastBlocks = blocksArray;
              }
              // Reset flag after state update is queued (use requestAnimationFrame for better timing)
              requestAnimationFrame(() => {
                setTimeout(() => {
                  isUpdatingFromBackendRef.current = false;
                }, 50); // Longer delay to ensure setBlocks callback has run
              });
              return blocksArray;
            }
            // Reset flag even if no change
            requestAnimationFrame(() => {
              setTimeout(() => {
                isUpdatingFromBackendRef.current = false;
              }, 50);
            });
            // Return same reference if no change to prevent re-renders
            return prev;
          } catch (e) {
            console.error('[BlocksProvider] Error comparing blocks:', e);
            isUpdatingFromBackendRef.current = false;
            return prev;
          }
        });
      } catch (e) {
        console.error('[BlocksProvider] Error handling blocks update:', e);
        isUpdatingFromBackendRef.current = false;
      }
    };

    let unsubBlocks = null;
    try {
      if (typeof window !== 'undefined' && window?.ipc?.on) {
        unsubBlocks = window.ipc.on('UI:BLOCKS_UPDATE', handleIncomingBlocks);
        
        // Request initial blocks ONCE for the entire app (survives StrictMode remounts and hot reloads)
        const now = Date.now();
        const timeSinceLastRequest = now - globalLastRequestTime;
        const shouldRequest = !globalRequestMade && 
                             !hasRequestedRef.current && 
                             timeSinceLastRequest >= REQUEST_COOLDOWN_MS;
        
        if (shouldRequest) {
          try {
            // Set flags BEFORE sending to prevent race conditions
            globalRequestMade = true;
            globalLastRequestTime = now;
            hasRequestedRef.current = true;
            
            window.ipc.send('UI:REQUEST_INITIAL');
            console.log('[BlocksProvider] 📡 Requested initial blocks from backend (ONCE - module singleton)');
          } catch (error) {
            console.error('[BlocksProvider] Error requesting initial blocks:', error);
            // Reset flags on error so we can retry
            globalRequestMade = false;
            hasRequestedRef.current = false;
          }
        } else {
          // Log why we're skipping (for debugging)
          if (globalRequestMade) {
            console.log('[BlocksProvider] ⏭️ Skipping request: already made globally');
          } else if (hasRequestedRef.current) {
            console.log('[BlocksProvider] ⏭️ Skipping request: already requested in this instance');
          } else if (timeSinceLastRequest < REQUEST_COOLDOWN_MS) {
            console.log('[BlocksProvider] ⏭️ Skipping request: cooldown active', Math.round((REQUEST_COOLDOWN_MS - timeSinceLastRequest) / 1000), 's remaining');
          }
        }
      }

      const browserHandler = (event) => {
        try {
          handleIncomingBlocks(event.detail);
        } catch (e) {
          console.error('[BlocksProvider] Error in browser handler:', e);
        }
      };
      
      if (typeof window !== 'undefined') {
        window.addEventListener('UI:BLOCKS_UPDATE', browserHandler);

        if (!window?.ipc?.on && window.__lastBlocks) {
          handleIncomingBlocks(window.__lastBlocks);
        }
      }

      return () => {
        try {
          if (unsubBlocks) {
            unsubBlocks();
          }
          if (typeof window !== 'undefined') {
            window.removeEventListener('UI:BLOCKS_UPDATE', browserHandler);
          }
        } catch (e) {
          console.error('[BlocksProvider] Error in cleanup:', e);
        }
      };
    } catch (e) {
      console.error('[BlocksProvider] Error setting up IPC:', e);
      return () => {};
    }
  }, []); // Empty deps - only run once per mount

  const setBlocks = React.useCallback((value) => {
    setBlocksState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      if (typeof window !== 'undefined') {
        window.__lastBlocks = next;
        
        // CRITICAL: Only sync to backend if:
        // 1. This is NOT a backend update (flag check)
        // 2. The value actually changed (prevent duplicate syncs)
        // 3. The new value is different from what we last synced
        const nextStr = JSON.stringify(next);
        const prevStr = JSON.stringify(prev);
        const shouldSync = !isUpdatingFromBackendRef.current && 
                          prevStr !== nextStr && 
                          lastSyncedBlocksRef.current !== nextStr &&
                          window?.electronAPI?.invoke;
        
        if (shouldSync) {
          // Update last synced ref BEFORE calling to prevent race conditions
          lastSyncedBlocksRef.current = nextStr;
          window.electronAPI.invoke('ARCHITECT:UPDATE_BLOCKS', next).catch((error) => {
            console.error('Error syncing blocks with backend:', error);
            // Reset on error so we can retry
            lastSyncedBlocksRef.current = null;
          });
        }
      }
      return next;
    });
  }, []);

  return (
    <BlocksContext.Provider value={{ blocks, setBlocks }}>
      {children}
    </BlocksContext.Provider>
  );
}

export function useBlocks() {
  const context = useContext(BlocksContext);
  if (!context) {
    throw new Error('useBlocks must be used within BlocksProvider');
  }
  return context;
}
