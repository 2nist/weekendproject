import React from 'react';
import useAppIPC, { useStatus } from '../hooks/useAppIPC';

export default function ContextualBlockStatus({
  selectedId = null,
  className = '',
}) {
  const { blocks } = useAppIPC();
  const status = useStatus();

  const selected = blocks.find((b) => b.id === selectedId) || null;

  // Determine active block by checking explicit ids / indices first.
  let activeBlock = null;

  const activeBlockId =
    status?.activeBlockId ||
    status?.currentBlockId ||
    status?.playingBlockId ||
    null;

  if (activeBlockId && blocks && blocks.length) {
    activeBlock = blocks.find((b) => b.id === activeBlockId) || null;
  }

  // If status provides a playing index, try that next
  if (
    !activeBlock &&
    typeof status?.playingIndex === 'number' &&
    blocks &&
    blocks.length
  ) {
    const idx = Math.max(0, Math.min(blocks.length - 1, status.playingIndex));
    activeBlock = blocks[idx] || null;
  }

  // Fallback heuristic: if we're playing and have a bpm, pick a block by a simple hash
  if (
    !activeBlock &&
    status?.isPlaying &&
    status?.bpm &&
    blocks &&
    blocks.length
  ) {
    const index = Math.floor(Math.abs(Math.round(status.bpm))) % blocks.length;
    activeBlock = blocks[index] || null;
  }

  return (
    <div className={`bg-white border rounded-md p-3 ${className}`}>
      <h4 className="text-sm font-semibold mb-2">Contextual Block Status</h4>

      {selected ? (
        <div className="text-sm">
          <div className="mb-1">
            <strong>ID:</strong> {selected.id}
          </div>
          <div className="mb-1">
            <strong>Label:</strong> {selected.label}
          </div>
          <div className="mb-1">
            <strong>State:</strong> {selected.state ?? 'unknown'}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">No block selected</div>
      )}

      <hr className="my-3" />

      <div className="text-sm text-gray-700 space-y-1">
        <div>
          <strong>BPM:</strong> {status.bpm ?? '—'}
        </div>
        <div>
          <strong>Connected:</strong> {String(!!status.connected)}
        </div>
        <div className="mt-2">
          <strong>Now Playing:</strong>{' '}
          <span className="font-medium">
            {activeBlock ? (activeBlock.name ?? activeBlock.label) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
