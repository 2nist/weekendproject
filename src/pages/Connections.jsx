import React from 'react';
import useAppIPC from '../hooks/useAppIPC';

export default function Connections() {
  const { connected, status, requestRefresh } = useAppIPC();

  return (
    <div style={{ padding: 16 }}>
      <h2>Connections</h2>
      <div style={{ marginBottom: 12 }}>
        <strong>Connected:</strong> {String(connected)}
      </div>
      <div style={{ marginBottom: 12 }}>
        <strong>System:</strong> {status.system ?? '—'}
      </div>
      <div>
        <button onClick={requestRefresh} style={{ padding: '6px 10px' }}>
          Refresh
        </button>
      </div>
    </div>
  );
}
