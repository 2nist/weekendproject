import React from 'react';
import { cn } from '@/lib/utils';

export const ProgressionOverlay = ({ label, widthInMeasures, color = 'text-indigo-400 border-indigo-500/50', onEdit }: { label: string; widthInMeasures?: number; color?: string; onEdit?: () => void }) => {
  const widthClass = `w-[calc(100%*${widthInMeasures})]`;
  return (
    <button
      type="button"
      aria-label={`Edit progression ${label}`}
      onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
      className={cn(`absolute -top-8 left-0 h-8 z-10 flex items-end justify-center group cursor-context-menu ${widthClass}`)}
    >
      <div className={cn('absolute inset-x-2 bottom-0 h-3 border-t-2 border-l-2 border-r-2 rounded-t-lg pointer-events-none', color)} />
      <span className={cn('relative -top-2 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-slate-950 border rounded-full shadow-sm transition-transform group-hover:-translate-y-1', color)}>{label}</span>
    </button>
  );
};

export default ProgressionOverlay;
