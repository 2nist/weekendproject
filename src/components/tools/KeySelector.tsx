import React from 'react';

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function KeySelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <label aria-label="Key selector">
      <select
        aria-label="Key selector"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded bg-slate-800 text-white"
      >
        {KEYS.map((k) => (
          <option value={k} key={k}>
            {k}
          </option>
        ))}
        <option value="">Auto</option>
      </select>
    </label>
  );
}

export default KeySelector;
