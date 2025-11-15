import React from 'react';
import useAppIPC from '../hooks/useAppIPC';
import SeamlessLoader from '../plugins/SeamlessLoader';
import ContextualBlockStatus from '../plugins/ContextualBlockStatus';

function GridBlock({
  block,
  index,
  onSelect,
  onDragStart,
  onDrop,
  onDragOver,
  isSelected,
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onClick={() => onSelect(block?.id)}
      style={{
        userSelect: 'none',
        border: isSelected ? '2px solid #2563eb' : '1px solid #ddd',
        borderRadius: 6,
        padding: 10,
        background: block ? '#fff' : '#fafafa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 64,
        cursor: 'grab',
      }}
    >
      {block ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600 }}>{block.label}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{block.id}</div>
        </div>
      ) : (
        <div style={{ color: '#bbb' }}>Empty</div>
      )}
    </div>
  );
}

export default function Architect() {
  const { blocks: remoteBlocks, setBlocks } = useAppIPC();
  // local selection & drag state
  const [selectedId, setSelectedId] = React.useState(null);
  const [dragIndex, setDragIndex] = React.useState(null);

  // produce a fixed-size grid (rows x cols)
  const cols = 4;
  const rows = 3;
  const cellCount = cols * rows;

  const blocks = React.useMemo(() => {
    if (remoteBlocks && remoteBlocks.length) {
      // fill into cells, leave empty slots
      const arr = new Array(cellCount).fill(null);
      for (let i = 0; i < Math.min(remoteBlocks.length, cellCount); i++)
        arr[i] = remoteBlocks[i];
      return arr;
    }

    // fallback placeholder content
    return new Array(cellCount).fill(null).map((_, i) => ({
      id: `placeholder-${i + 1}`,
      label: `Block ${i + 1}`,
      state: 'idle',
    }));
  }, [remoteBlocks]);

  function onSelect(id) {
    setSelectedId((s) => (s === id ? null : id));
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

  return (
    <div style={{ display: 'flex', gap: 16, padding: 16 }}>
      <main style={{ flex: 1 }}>
        <h2 style={{ marginTop: 0 }}>Arrangement Grid</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
          }}
        >
          {blocks.map((b, i) => (
            <GridBlock
              key={b ? b.id : `cell-${i}`}
              block={b}
              index={i}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              isSelected={Boolean(selectedId && b && b.id === selectedId)}
            />
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
