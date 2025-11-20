import React from 'react';
import { Settings2 } from 'lucide-react';

export const Measure = ({
  barNumber,
  children,
  onEdit,
}: {
  barNumber: number;
  children: React.ReactNode;
  onEdit?: () => void;
}) => {
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

      <div className="flex gap-2 p-2 bg-slate-950/50 rounded-2xl border border-slate-800/50 group-hover:border-slate-700 transition-colors">
        {children}
      </div>
    </div>
  );
};

export default Measure;
