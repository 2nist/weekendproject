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
        <span className="text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors">
          BAR {barNumber}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-all"
          aria-label={`Edit bar ${barNumber}`}
          type="button"
        >
          <Settings2 className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* CSS Grid layout for strict rhythmic alignment */}
      <div
        className="p-1 bg-muted/30 rounded-2xl border border-border group-hover:border-border transition-colors"
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
