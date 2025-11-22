import React from 'react';
import type { ProgressionGroup } from '../../types/audio';

interface ProgressionBracketProps {
  progression: ProgressionGroup;
  measureWidth: number; // Width of a single measure in pixels
  onEdit?: (progression: ProgressionGroup) => void;
}

export const ProgressionBracket: React.FC<ProgressionBracketProps> = ({ 
  progression, 
  measureWidth,
  onEdit 
}) => {
  const lengthInBars = progression.endMeasure - progression.startMeasure + 1;
  const width = lengthInBars * measureWidth;

  return (
    <div 
      className="absolute -top-6 left-0 h-6 border-t-2 border-l-2 border-r-2 border-indigo-400 rounded-t-lg flex items-center justify-center cursor-context-menu hover:bg-indigo-500/20 transition-colors"
      style={{ width: `${width}px` }}
      onClick={() => onEdit?.(progression)}
      title={`Click to edit ${progression.label}`}
    >
      <span className="bg-gray-950 px-2 text-xs text-indigo-300 font-bold uppercase tracking-widest -mt-3">
        {progression.label}
      </span>
    </div>
  );
};



