import React from 'react';
import { Settings2 } from 'lucide-react';

export interface MeasureProps {
  barNumber: number;
  numerator: number; // Time signature numerator (e.g., 4 for 4/4, 3 for 3/4)
  children: React.ReactNode;
  onEdit?: () => void;
}

export const Measure = ({
  barNumber,
  numerator,
  children,
  onEdit,
}: MeasureProps) => {
  return (
    <div className="flex flex-col gap-2 group">
      <div className="flex justify-between items-center px-1">
        <span className="text-xs font-mono text-slate-500 group-hover:text-slate-300 transition-colors">
          BAR {barNumber}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-800 rounded transition-all"
          aria-label={`Edit bar ${barNumber}`}
          type="button"
        >
          <Settings2 className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {/* CSS Grid layout for strict rhythmic alignment */}
      <div
        className="p-1 bg-slate-900/80 rounded-2xl border border-slate-800/50 group-hover:border-slate-700 transition-colors"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${numerator}, minmax(3.5rem, 1fr))`,
          gap: '0.25rem', // gap-1 equivalent
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default Measure;
