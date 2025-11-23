import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { BlocksProvider } from './contexts/BlocksContext';
import { EditorProvider } from './contexts/EditorContext';
import { LayoutProvider } from './contexts/LayoutContext';
import { HashRouter } from 'react-router-dom'; // Import this
import ErrorBoundary from './components/ErrorBoundary';
import { loadTheme, applyTheme, DEFAULT_THEME } from './lib/themeUtils';
import './index.css';

// Load and apply saved theme on app startup (after DOM is ready)
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  const applyThemeOnStartup = async () => {
    // Try to load from database first (async), then fallback to localStorage
    const { loadThemeAsync } = await import('./lib/themeUtils');
    const savedTheme = await loadThemeAsync();
    
    if (savedTheme) {
      // Merge with defaults to ensure all variables are set
      const theme = { ...DEFAULT_THEME, ...savedTheme };
      applyTheme(theme);
      console.log('[main.jsx] Theme loaded and applied');
    } else {
      // Apply defaults if no saved theme
      applyTheme(DEFAULT_THEME);
      console.log('[main.jsx] Using default theme');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyThemeOnStartup);
  } else {
    // DOM is already ready
    applyThemeOnStartup();
  }
}

// Track how many times this file executes
if (!globalThis.__mainJsxExecutionCount) {
  globalThis.__mainJsxExecutionCount = 0;
}
globalThis.__mainJsxExecutionCount++;

const executionCount = globalThis.__mainJsxExecutionCount;
console.log(`[main.jsx] File executed (count: ${executionCount})`);

// If we're executing too many times, something is forcing reloads
if (executionCount > 2) {
  console.error(`[main.jsx] RELOAD LOOP DETECTED - This file has executed ${executionCount} times!`);
  console.error('[main.jsx] Check for:');
  console.error('[main.jsx]   1. Database files being watched by Vite');
  console.error('[main.jsx]   2. Syntax errors causing HMR fallback');
  console.error('[main.jsx]   3. Files changing in library/analysis folders');
  console.trace('[main.jsx] Stack trace:');
}

const RootWrapper = React.Fragment;

// HMR diagnostics and safe accept
if (import.meta.hot) {
  console.log('[main.jsx] HMR enabled');
  import.meta.hot.on('vite:beforeUpdate', (payload) => {
    console.warn('[HMR] Update triggered by:', payload);
  });
  import.meta.hot.on('vite:error', (payload) => {
    console.error('[HMR] Error:', payload);
  });
  import.meta.hot.accept((newModule) => {
    console.log('[HMR] Module accepted, performing hot update');
  });
}

// Load and apply saved theme on app startup (after DOM is ready)
// (already handled above)

// Only render once - prevent multiple React roots
if (!globalThis.__reactRootCreated) {
  globalThis.__reactRootCreated = true;

  // Add navigation debugging
  if (typeof window !== 'undefined') {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      console.log('[main.jsx] history.pushState:', args[2]);
      console.trace('[main.jsx] pushState stack:');
      return originalPushState.apply(this, args);
    };
    
    history.replaceState = function(...args) {
      console.log('[main.jsx] history.replaceState:', args[2]);
      return originalReplaceState.apply(this, args);
    };
    
    window.addEventListener('hashchange', (e) => {
      console.log('[main.jsx] hashchange:', e.oldURL, '=>', e.newURL);
    });
    
    window.addEventListener('popstate', (e) => {
      console.log('[main.jsx] popstate:', location.href, 'state:', e.state);
    });
    
    // Detect any window.location changes
    let lastLocation = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastLocation) {
        console.log('[main.jsx] LOCATION CHANGED:', lastLocation, '=>', window.location.href);
        console.trace('[main.jsx] Location change stack:');
        lastLocation = window.location.href;
      }
    }, 100);
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <RootWrapper>
      <ErrorBoundary>
        {/* Wrap App in HashRouter here so it never re-renders */}
        <HashRouter>
          {/* Provide Blocks, Editor, and Layout contexts at the root to avoid re-mounts during HMR */}
          <BlocksProvider>
            <EditorProvider>
              <LayoutProvider>
                <App />
              </LayoutProvider>
            </EditorProvider>
          </BlocksProvider>
        </HashRouter>
      </ErrorBoundary>
    </RootWrapper>
  );
  console.log('[main.jsx] App bootstrapped');
} else {
  console.warn('[main.jsx] React root already created, skipping render to prevent duplicate roots');
}
