import React from 'react';
import useAppIPC from '../hooks/useAppIPC';
import logger from '@/lib/logger';
import SeamlessLoader from '../plugins/SeamlessLoader';
import ContextualBlockStatus from '../plugins/ContextualBlockStatus';
import ArrangementBlock from '../components/ArrangementBlock';

function GridCell({ block, index, onSelect, onDragStart, onDrop, onDragOver, selected }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onClick={() => onSelect(block?.id)}
      className={`min-h-[64px] p-3 rounded-md border flex items-center justify-center select-none cursor-grab ${
        selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 bg-white'
      }`}
    >
      {block ? (
        <div className="text-center">
          <div className="font-semibold">{block.label}</div>
          <div className="text-xs text-gray-500">{block.id}</div>
        </div>
      ) : (
        <div className="text-gray-300">Empty</div>
      )}
    </div>
  );
}

export default function ArchitectView() {
  const { blocks: remoteBlocks, setBlocks, sendCommand } = useAppIPC();
  const [loadedBlocks, setLoadedBlocks] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [dragIndex, setDragIndex] = React.useState(null);

  const cols = 4;
  const rows = 3;
  const cellCount = cols * rows;

  const blocks = React.useMemo(() => {
    if (remoteBlocks && remoteBlocks.length) {
      const arr = new Array(cellCount).fill(null);
      for (let i = 0; i < Math.min(remoteBlocks.length, cellCount); i++) arr[i] = remoteBlocks[i];
      return arr;
    }
    return new Array(cellCount).fill(null).map((_, i) => ({
      id: `ph-${i + 1}`,
      label: `Block ${i + 1}`,
      state: 'idle',
    }));
  }, [remoteBlocks]);

  // Load arrangement data on mount
  React.useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const result = await sendCommand('DB:LOAD_ARRANGEMENT');
        // result may be the array or an object containing `blocks`
        const arr = Array.isArray(result) ? result : (result?.blocks ?? []);
        if (!mounted) return;
        setLoadedBlocks(arr);
        try {
          // also update global hook blocks if setter available
          setBlocks && setBlocks(arr);
        } catch (e) {}
      } catch (err) {
        // ignore load errors for now
        logger.error('Failed to load arrangement', err);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [sendCommand, setBlocks]);

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

    try {
      if (remoteBlocks && remoteBlocks.length) {
        const mapped = next.filter(Boolean).slice(0, remoteBlocks.length);
        setBlocks(mapped);
      }
    } catch (err) {
      // ignore
    }

    setDragIndex(null);
  }

  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Arrangement Grid</h2>

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
        >
          {(loadedBlocks && loadedBlocks.length ? loadedBlocks : blocks).map((b, i) => (
            <div
              key={b ? b.id : `cell-${i}`}
              draggable
              onDragStart={(e) => onDragStart(e, i)}
              onDrop={(e) => onDrop(e, i)}
              onDragOver={(e) => onDragOver(e, i)}
              onClick={() => onSelect(b?.id)}
              className={`min-h-[64px] p-2`}
            >
              {b ? (
                <ArrangementBlock
                  block={{
                    name: b.name ?? b.label ?? `Block ${i + 1}`,
                    length: b.length ?? b.bars ?? b.barLength ?? 4,
                    color: b.color ?? 'bg-blue-400',
                  }}
                  className={selectedId === b.id ? 'ring-2 ring-blue-300' : ''}
                />
              ) : (
                <div className="text-gray-300">Empty</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <aside className="space-y-3">
        <SeamlessLoader />
        <ContextualBlockStatus selectedId={selectedId} />
      </aside>
    </div>
  );
}
