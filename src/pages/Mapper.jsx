import React, { useEffect, useState } from 'react';
import useAppIPC from '../hooks/useAppIPC';

export default function Mapper() {
  const { blocks } = useAppIPC();
  const [lastAbstracted, setLastAbstracted] = useState(null);

  useEffect(() => {
    const handler = (event, payload) => {
      // payload expected to be either a string or an object { abstract: 'APC64_PAD_A1' }
      const value =
        payload && typeof payload === 'object'
          ? payload.abstract || null
          : payload || null;
      setLastAbstracted(value);
    };

    if (window.electronAPI && typeof window.electronAPI.on === 'function') {
      window.electronAPI.on('DEBUG:MIDI_ABSTRACTED', handler);
    } else if (window.ipc && typeof window.ipc.on === 'function') {
      window.ipc.on('DEBUG:MIDI_ABSTRACTED', handler);
    }

    return () => {
      if (
        window.electronAPI &&
        typeof window.electronAPI.removeListener === 'function'
      ) {
        window.electronAPI.removeListener('DEBUG:MIDI_ABSTRACTED', handler);
      } else if (
        window.ipc &&
        typeof window.ipc.removeListener === 'function'
      ) {
        window.ipc.removeListener('DEBUG:MIDI_ABSTRACTED', handler);
      }
    };
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2>Mapper</h2>
      <p style={{ marginTop: 0 }}>Visual mapping workspace (placeholder).</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
          <h4>Source Blocks</h4>
          <ul>
            {(blocks && blocks.length
              ? blocks
              : [{ id: 'none', label: 'No blocks' }]
            ).map((b) => (
              <li key={b.id}>
                {b.label || b.name || 'Unnamed'}{' '}
                <small style={{ color: '#666' }}>({b.id})</small>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
          <h4>Target</h4>
          <div style={{ color: '#666' }}>
            Create mappings by dragging in the real app.
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          border: '1px dashed #ddd',
          borderRadius: 8,
        }}
      >
        <h4>DEBUG: MIDI Abstracted</h4>
        <div style={{ color: '#222' }}>
          Last abstract constant: <strong>{lastAbstracted ?? '—'}</strong>
        </div>
        <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
          Listening for IPC channel <code>DEBUG:MIDI_ABSTRACTED</code>
        </div>
      </div>
    </div>
  );
}
