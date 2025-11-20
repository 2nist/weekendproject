import React from 'react';
import useAppIPC from '../hooks/useAppIPC';
import SeamlessLoader from '../plugins/SeamlessLoader';
import ContextualBlockStatus from '../plugins/ContextualBlockStatus';
import ArrangementBlock from '../components/ArrangementBlock';
import SectionDetailPanel from '../components/SectionDetailPanel';
import SectionSculptor from '../components/SectionSculptor';
import SandboxMode from '../components/SandboxMode';

export default function Architect() {
  const { blocks: remoteBlocks, setBlocks } = useAppIPC();
  // local selection & drag state
  const [selectedId, setSelectedId] = React.useState(null);
  const [selectedSection, setSelectedSection] = React.useState(null);
  const [dragIndex, setDragIndex] = React.useState(null);
  const [viewMode, setViewMode] = React.useState('arrangement'); // arrangement, detail, sandbox
  const [sandboxBlocks, setSandboxBlocks] = React.useState([]);

  // produce a fixed-size grid (rows x cols)
  const cols = 4;
  const rows = 3;
  const cellCount = cols * rows;

  const blocks = React.useMemo(() => {
    console.log('Architect: remoteBlocks changed:', remoteBlocks);
    if (remoteBlocks && remoteBlocks.length) {
      console.log(`Architect: Filling ${remoteBlocks.length} blocks into ${cellCount} cells`);
      // fill into cells, leave empty slots
      const arr = new Array(cellCount).fill(null);
      for (let i = 0; i < Math.min(remoteBlocks.length, cellCount); i++) {
        arr[i] = remoteBlocks[i];
      }
      return arr;
    }

    console.log('Architect: No remote blocks, using placeholders');
    // fallback placeholder content
    return new Array(cellCount).fill(null).map((_, i) => ({
      id: `placeholder-${i + 1}`,
      label: `Block ${i + 1}`,
      state: 'idle',
    }));
  }, [remoteBlocks, cellCount]);

  function onSelect(id) {
    setSelectedId((s) => (s === id ? null : id));
    // Find the selected section data
    const selected = blocks.find((b) => b && b.id === id);
    if (selected && (selected.harmonic_dna || selected.section_label)) {
      setSelectedSection(selected);
      setViewMode('detail');
    } else {
      setSelectedSection(null);
    }
  }

  function onDragStart(e, index) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e, index) {
    e.preventDefault();
    const from = dragIndex;
    const to = index;
    if (from == null || to == null || from === to) return setDragIndex(null);

    const next = [...blocks];
    const tmp = next[from];
    next[from] = next[to];
    next[to] = tmp;

    // If remoteBlocks exists, try to map result back to remote shape
    try {
      // Map placeholder objects back to remoteBlocks if available
      if (remoteBlocks && remoteBlocks.length) {
        const mapped = next.filter(Boolean).slice(0, remoteBlocks.length);
        setBlocks(mapped);
      }
    } catch (err) {
      // ignore; keep local visual swap for placeholders
    }

    setDragIndex(null);
  }

  // Three-level zoom interface
  if (viewMode === 'detail' && selectedSection) {
    return (
      <div style={{ display: 'flex', gap: 16, padding: 16, height: '100vh' }}>
        {/* Level A: Arrangement Map (left sidebar) */}
        <aside style={{ width: '250px', overflowY: 'auto' }}>
          <h3 style={{ marginBottom: '10px' }}>Arrangement Map</h3>
          <button
            onClick={() => setViewMode('arrangement')}
            style={{
              marginBottom: '15px',
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            ← Back to Grid
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {blocks
              .filter(Boolean)
              .map((b) => (
                <ArrangementBlock
                  key={b.id}
                  block={b}
                  onClick={() => onSelect(b.id)}
                  className={
                    selectedId === b.id ? 'ring-2 ring-blue-500' : ''
                  }
                />
              ))}
          </div>
        </aside>

        {/* Level B: DNA Inspector (center) */}
        <main style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px' }}>
          <SectionDetailPanel
            section={selectedSection}
            onClose={() => {
              setViewMode('arrangement');
              setSelectedSection(null);
            }}
          />
        </main>

        {/* Level C: Probability Dashboard (right sidebar) */}
        <aside style={{ width: '320px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px' }}>
          <SectionSculptor
            section={selectedSection}
            onUpdate={(update) => {
              console.log('Section update:', update);
              // TODO: Apply updates to section
            }}
          />
        </aside>
      </div>
    );
  }

  // Sandbox Mode
  if (viewMode === 'sandbox') {
    return (
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ marginTop: 0 }}>Blank Canvas (Sandbox Mode)</h2>
          <button
            onClick={() => setViewMode('arrangement')}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ← Back to Arrangement
          </button>
        </div>
        <SandboxMode
          onGenerate={async (constraints) => {
            try {
              if (window.electronAPI && window.electronAPI.invoke) {
                const result = await window.electronAPI.invoke('SANDBOX:GENERATE', constraints);
                if (result?.success) {
                  setSandboxBlocks(result.blocks || []);
                  setBlocks(result.blocks || []);
                }
              }
            } catch (error) {
              console.error('Error generating structure:', error);
            }
          }}
          generatedBlocks={sandboxBlocks}
          onUpdateBlock={(blockId, update) => {
            setSandboxBlocks((prev) =>
              prev.map((b) => (b.id === blockId ? { ...b, ...update } : b))
            );
            setBlocks((prev = []) =>
              prev.map((b) => (b && b.id === blockId ? { ...b, ...update } : b))
            );
          }}
          setGlobalBlocks={setBlocks}
        />
      </div>
    );
  }

  // Default: Level A view (Arrangement Grid)
  return (
    <div style={{ display: 'flex', gap: 16, padding: 16 }}>
      <main style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ marginTop: 0 }}>Arrangement Grid (Level A)</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => setViewMode('sandbox')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Blank Canvas
            </button>
            <button
              onClick={() => {
                console.log('Manual refresh: Requesting blocks from backend');
                if (window.ipc && window.ipc.send) {
                  window.ipc.send('UI:REQUEST_INITIAL');
                }
              }}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Refresh Blocks
            </button>
            <div style={{ fontSize: '12px', color: '#666' }}>
              {remoteBlocks && remoteBlocks.length > 0 
                ? `${remoteBlocks.length} blocks loaded` 
                : 'No blocks loaded'}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
          }}
        >
          {blocks.map((b, i) => (
            <div
              key={b ? b.id : `cell-${i}`}
              draggable
              onDragStart={(e) => onDragStart(e, i)}
              onDrop={(e) => onDrop(e, i)}
              onDragOver={(e) => onDragOver(e, i)}
              onClick={() => onSelect(b?.id)}
              style={{
                userSelect: 'none',
                border: selectedId && b && b.id === selectedId ? '2px solid #2563eb' : '1px solid #ddd',
                borderRadius: 6,
                cursor: 'grab',
              }}
            >
              {b ? (
                <ArrangementBlock
                  block={b}
                  onClick={() => {}}
                  className=""
                />
              ) : (
                <div
                  style={{
                    padding: 10,
                    background: '#fafafa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 64,
                    color: '#bbb',
                  }}
                >
                  Empty
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      <aside
        style={{
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <SeamlessLoader />
        <ContextualBlockStatus selectedId={selectedId} />
      </aside>
    </div>
  );
}
