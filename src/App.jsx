import React from 'react';
import Architect from './pages/ArchitectView';
import ArchitectNew from './pages/Architect';
import Connections from './pages/Connections';
import Mapper from './pages/Mapper';
import AnalysisJobManager from './components/AnalysisJobManager';
import Toolbar from './components/Toolbar';

function App() {
  const [activeTab, setActiveTab] = React.useState('Architect');
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    // Catch any unhandled errors
    const errorHandler = (event) => {
      console.error('Global error:', event.error);
      setError(event.error?.message || 'An error occurred');
    };
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

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
    <div className="h-screen flex flex-col font-sans antialiased">
      <header className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex gap-2 items-center">
          <strong className="font-semibold text-foreground">Interface Architect</strong>
          <nav className="flex ml-3 gap-0">
            <button
              onClick={() => setActiveTab('Architect')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'Architect'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Architect
            </button>
            <button
              onClick={() => setActiveTab('Connections')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'Connections'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Connections
            </button>
            <button
              onClick={() => setActiveTab('Mapper')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'Mapper'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Mapper
            </button>
            <button
              onClick={() => setActiveTab('Analysis')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'Analysis'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Analysis
            </button>
          </nav>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {activeTab === 'Architect' && <ArchitectNew />}
        {activeTab === 'Connections' && <Connections />}
        {activeTab === 'Mapper' && <Mapper />}
        {activeTab === 'Analysis' && <AnalysisJobManager />}
      </div>

      <footer className="border-t border-border p-2.5">
        <div className="max-w-5xl mx-auto flex justify-center">
          <Toolbar />
        </div>
      </footer>
    </div>
  );
}

export default App;
