import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Architect from './pages/ArchitectView';
import ArchitectNew from './pages/Architect';
import Connections from './pages/Connections';
import Mapper from './pages/Mapper';
import LibraryView from './views/LibraryView';
import AnalysisJobManager from './components/AnalysisJobManager';
import Toolbar from './components/Toolbar';
import ThemeEditor from './components/settings/ThemeEditor';
import SettingsView from './views/SettingsView';
import SandboxView from './views/SandboxView';
import AnalysisTuner from './components/tools/AnalysisTuner';
import { BlocksProvider } from './contexts/BlocksContext';
import { EditorProvider } from './contexts/EditorContext';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sandboxContext, setSandboxContext] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [showAnalysisTuner, setShowAnalysisTuner] = React.useState(false);
  
  // Memoize navigate function to prevent unnecessary re-renders
  const stableNavigate = React.useCallback((path) => {
    navigate(path);
  }, [navigate]);
  
  // Helper to check if a route is active (memoized)
  const isActiveRoute = React.useCallback((path) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '/architect';
    return location.pathname === path;
  }, [location.pathname]);

  React.useEffect(() => {
    // Catch any unhandled errors
    const errorHandler = (event) => {
      console.error('Global error:', event.error);
      setError(event.error?.message || 'An error occurred');
    };
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  // Listen for OPEN_SANDBOX events to navigate from other parts of the UI
  React.useEffect(() => {
    const onOpenSandbox = async (e) => {
      const detail = e?.detail || {};
      console.log('[App] OPEN_SANDBOX event received:', detail);
      
      // If analysisId present, fetch analysis by id
      if (detail.analysisId) {
        try {
          const ipcAPI = window?.electronAPI?.invoke || window?.ipc?.invoke;
          if (ipcAPI) {
            const res = await ipcAPI('ANALYSIS:GET_BY_ID', detail.analysisId);
            if (res?.success && res.analysis) {
              console.log('[App] Loaded analysis by ID:', res.analysis);
              setSandboxContext(res.analysis);
              navigate('/sandbox');
              return;
            }
          }
        } catch (err) {
          console.error('[App] Failed to fetch analysis by ID for sandbox:', err);
        }
      }
      
      // If fileHash present but no full analysis, try to fetch it
      if (detail.fileHash && !detail.linear_analysis) {
        try {
          const ipcAPI = window?.electronAPI?.invoke || window?.ipc?.invoke;
          if (ipcAPI) {
            const res = await ipcAPI('ANALYSIS:GET_RESULT', detail.fileHash);
            if (res?.success && res.analysis) {
              console.log('[App] Loaded analysis by fileHash:', res.analysis);
              setSandboxContext(res.analysis);
              navigate('/sandbox');
              return;
            } else if (res?.analysis) {
              console.log('[App] Loaded analysis by fileHash (no success flag):', res.analysis);
              setSandboxContext(res.analysis);
              navigate('/sandbox');
              return;
            }
          }
        } catch (err) {
          console.error('[App] Failed to fetch analysis by fileHash for sandbox:', err);
        }
      }
      
      // Fallback: set context with whatever detail we have (useAnalysisSandbox will try to fetch)
      console.log('[App] Setting sandbox context with detail (will fetch in hook):', detail);
      setSandboxContext(detail || null);
      navigate('/sandbox');
    };
    window.addEventListener('OPEN_SANDBOX', onOpenSandbox);
    return () => window.removeEventListener('OPEN_SANDBOX', onOpenSandbox);
  }, [navigate]);

  if (error) {
    return (
      <div className="p-4 text-destructive">
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  return (
    <BlocksProvider>
    <div className="h-screen flex flex-col font-sans antialiased">
      <header className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex gap-2 items-center">
          <strong className="font-semibold text-foreground">
            Interface Architect
          </strong>
          <nav className="flex ml-3 gap-0">
            <button
              onClick={() => stableNavigate('/')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                location.pathname === '/' || location.pathname === '/architect'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Architect
            </button>
            <button
              onClick={() => stableNavigate('/connections')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                location.pathname === '/connections'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Connections
            </button>
            <button
              onClick={() => stableNavigate('/mapper')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                location.pathname === '/mapper'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Mapper
            </button>
            <button
              onClick={() => stableNavigate('/analysis')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                location.pathname === '/analysis'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Analysis
            </button>
            <button
              onClick={() => stableNavigate('/settings')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                location.pathname === '/settings'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Settings
            </button>
            <button
              onClick={() => stableNavigate('/library')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                location.pathname === '/library'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Library
            </button>
            <button
              onClick={() => stableNavigate('/sandbox')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                location.pathname === '/sandbox'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Sandbox
            </button>
            <button
              onClick={() => setShowAnalysisTuner((s) => !s)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                showAnalysisTuner
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Analysis Lab
            </button>
          </nav>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {showAnalysisTuner && (
          <div className="fixed z-50 top-16 right-8 bg-slate-900 p-3 rounded shadow-lg border border-slate-800 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] overflow-y-auto">
            <AnalysisTuner 
              fileHash={window.__lastAnalysisHash || globalThis.__currentFileHash || sandboxContext?.fileHash || null} 
              onUpdate={() => {
                // Trigger reload of analysis data after tuner changes
                const hash = window.__lastAnalysisHash || globalThis.__currentFileHash;
                if (hash && window.electronAPI) {
                  window.electronAPI.invoke('ANALYSIS:LOAD_TO_ARCHITECT', hash)
                    .then((res) => {
                      if (res.success && res.blocks) {
                        console.log('Analysis reloaded after tuner update:', res.blocks.length, 'blocks');
                      }
                    })
                    .catch(console.error);
                }
              }} 
            />
          </div>
        )}
        {/* Routes - no HashRouter here, it's in main.jsx */}
        <Routes>
          <Route path="/" element={<ArchitectNew />} />
          <Route path="/architect" element={<ArchitectNew />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/mapper" element={<Mapper />} />
          <Route path="/analysis" element={<AnalysisJobManager />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/library" element={<LibraryView />} />
          <Route 
            path="/sandbox" 
            element={
              <EditorProvider initialData={sandboxContext || null}>
                <SandboxView data={sandboxContext || {}} />
              </EditorProvider>
            } 
          />
        </Routes>
      </div>

      <footer className="border-t border-border p-2.5">
        <div className="max-w-5xl mx-auto flex justify-center">
          <Toolbar openSandbox={() => stableNavigate('/sandbox')} openSettings={() => stableNavigate('/settings')} />
        </div>
      </footer>
    </div>
    </BlocksProvider>
  );
}

export default App;
