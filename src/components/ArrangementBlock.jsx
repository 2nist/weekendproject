import React from 'react';

export default function ArrangementBlock({ block = {}, className = '' }) {
  const { name = 'Untitled', length = 4, color = 'bg-blue-400' } = block;

  const widthPct = Math.min(100, (Number(length) || 0) * 5);

  return (
    <div className={`p-3 rounded-md border bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-gray-500">{length} bars</div>
      </div>

      <div className="mt-2 h-2 bg-gray-100 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
