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
import logger from './lib/logger';

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
      logger.info('[main.jsx] Theme loaded and applied');
    } else {
      // Apply defaults if no saved theme
      applyTheme(DEFAULT_THEME);
      logger.info('[main.jsx] Using default theme');
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
logger.debug(`[main.jsx] File executed (count: ${executionCount})`);

// If we're executing too many times, something is forcing reloads
if (executionCount > 2) {
  logger.error(`[main.jsx] RELOAD LOOP DETECTED - This file has executed ${executionCount} times!`);
  logger.error('[main.jsx] Check for:');
  logger.error('[main.jsx]   1. Database files being watched by Vite');
  logger.error('[main.jsx]   2. Syntax errors causing HMR fallback');
  logger.error('[main.jsx]   3. Files changing in library/analysis folders');
  logger.debug('[main.jsx] Stack trace:');
}

const RootWrapper = React.Fragment;

// HMR diagnostics and safe accept
if (import.meta.hot) {
  logger.debug('[main.jsx] HMR enabled');
  import.meta.hot.on('vite:beforeUpdate', (payload) => {
    logger.warn('[HMR] Update triggered by:', payload);
  });
  import.meta.hot.on('vite:error', (payload) => {
    logger.error('[HMR] Error:', payload);
  });
  import.meta.hot.accept((newModule) => {
    logger.debug('[HMR] Module accepted, performing hot update');
  });
}

// Load and apply saved theme on app startup (after DOM is ready)
// (already handled above)

// Only render once - prevent multiple React roots
// But allow re-rendering during HMR
const shouldRender = !globalThis.__reactRootCreated || import.meta.hot;

if (shouldRender) {
  globalThis.__reactRootCreated = true;

  // Add navigation debugging
  if (typeof window !== 'undefined') {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      logger.debug('[main.jsx] history.pushState:', args[2]);
      logger.debug('[main.jsx] pushState stack:');
      return originalPushState.apply(this, args);
    };

    history.replaceState = function (...args) {
      logger.debug('[main.jsx] history.replaceState:', args[2]);
      return originalReplaceState.apply(this, args);
    };

    window.addEventListener('hashchange', (e) => {
      logger.debug('[main.jsx] hashchange:', e.oldURL, '=>', e.newURL);
    });

    window.addEventListener('popstate', (e) => {
      logger.debug('[main.jsx] popstate:', location.href, 'state:', e.state);
    });

    // Detect any window.location changes
    let lastLocation = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastLocation) {
        logger.debug('[main.jsx] LOCATION CHANGED:', lastLocation, '=>', window.location.href);
        logger.debug('[main.jsx] Location change stack:');
        lastLocation = window.location.href;
      }
    }, 100);
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  globalThis.__reactRoot = root;

  const renderApp = (AppComponent = App) => {
    root.render(
      <RootWrapper>
        <ErrorBoundary>
          {/* Wrap App in HashRouter here so it never re-renders */}
          <HashRouter>
            {/* Provide Blocks, Editor, and Layout contexts at the root to avoid re-mounts during HMR */}
            <BlocksProvider>
              <EditorProvider>
                <LayoutProvider>
                  <AppComponent />
                </LayoutProvider>
              </EditorProvider>
            </BlocksProvider>
          </HashRouter>
        </ErrorBoundary>
      </RootWrapper>,
    );
  };

  renderApp();
  logger.info('[main.jsx] App bootstrapped');

  // HMR support
  if (import.meta.hot) {
    import.meta.hot.accept('./App.jsx', (newApp) => {
      logger.info('[HMR] App module updated, re-rendering with providers...');
      const AppComponent = newApp?.default || newApp || App;
      renderApp(AppComponent);
    });
  }
} else {
  logger.warn('[main.jsx] React root already created, skipping render to prevent duplicate roots');
}
