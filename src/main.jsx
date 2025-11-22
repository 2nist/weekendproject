import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { HashRouter } from 'react-router-dom'; // 🔴 Import this
import ErrorBoundary from './components/ErrorBoundary';
import { loadTheme, applyTheme, DEFAULT_THEME } from './lib/themeUtils';
import './index.css';

// Load and apply saved theme on app startup (after DOM is ready)
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  const applyThemeOnStartup = () => {
    const savedTheme = loadTheme();
    if (savedTheme) {
      // Merge with defaults to ensure all variables are set
      const theme = { ...DEFAULT_THEME, ...savedTheme };
      applyTheme(theme);
    } else {
      // Apply defaults if no saved theme
      applyTheme(DEFAULT_THEME);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyThemeOnStartup);
  } else {
    // DOM is already ready
    applyThemeOnStartup();
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* 🔴 Wrap App in HashRouter here so it never re-renders */}
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
