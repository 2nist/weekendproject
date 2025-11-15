import React from 'react';
import Architect from './pages/ArchitectView';
import Connections from './pages/Connections';
import Mapper from './pages/Mapper';
import Toolbar from './components/Toolbar';

function TabButton({ id, active, onClick, children }) {
  return (
    <button
      onClick={() => onClick(id)}
      aria-selected={active}
      role="tab"
      style={{
        padding: '8px 12px',
        border: 'none',
        borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function App() {
  const [activeTab, setActiveTab] = React.useState('Architect');

  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: 12,
          borderBottom: '1px solid #eee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong>Interface Architect</strong>
          <nav
            role="tablist"
            aria-label="Main tabs"
            style={{ display: 'flex', marginLeft: 12 }}
          >
            <TabButton
              id="Architect"
              active={activeTab === 'Architect'}
              onClick={setActiveTab}
            >
              Architect
            </TabButton>
            <TabButton
              id="Connections"
              active={activeTab === 'Connections'}
              onClick={setActiveTab}
            >
              Connections
            </TabButton>
            <TabButton
              id="Mapper"
              active={activeTab === 'Mapper'}
              onClick={setActiveTab}
            >
              Mapper
            </TabButton>
          </nav>
        </div>
      </header>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'Architect' && <Architect />}
        {activeTab === 'Connections' && <Connections />}
        {activeTab === 'Mapper' && <Mapper />}
      </div>

      <footer style={{ borderTop: '1px solid #eee', padding: 10 }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Toolbar />
        </div>
      </footer>
    </div>
  );
}

export default App;
