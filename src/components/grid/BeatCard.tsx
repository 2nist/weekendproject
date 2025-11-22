import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// 1. Define the Base Styles & Variants
const beatCardVariants = cva(
  'relative h-10 w-8 rounded-md border-2 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95',
  {
    variants: {
      function: {
        rest: 'bg-slate-900/50 border-slate-800 text-slate-600',
        tonic: 'bg-music-tonic border-music-tonic text-white',
        dominant: 'bg-music-dominant border-music-dominant text-white',
        subdominant: 'bg-music-subdominant border-music-subdominant text-white',
        diminished: 'bg-music-diminished border-music-diminished text-white',
        default: 'bg-slate-800 border-slate-700 text-slate-300',
      },
      selected: {
        true: 'ring-2 ring-ring ring-offset-2 ring-offset-background z-10',
        false: '',
      },
    },
    defaultVariants: {
      function: 'default',
      selected: false,
    },
  },
);

// 2. Define Props
export interface BeatCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof beatCardVariants> {
  chord?: string | null;
  roman?: string | null;
  isKick?: boolean;
  isSnare?: boolean;
  beatIndex?: number;
  onEdit?: () => void;
  isPlaying?: boolean;
  timestamp?: number;
  paintMode?: boolean;
  paintChord?: string | null;
  isDragging?: boolean;
  onPaint?: () => void;
  beat?: any;
  showConfidence?: boolean; // Toggle for confidence heatmap
  confidence?: number; // 0-1 confidence score
  hasConflict?: boolean; // True if engines disagreed
  isAttack?: boolean; // True if chord starts here (new chord)
  isSustain?: boolean; // True if chord continues from previous beat
}

// 3. The Component
export const BeatCard = ({
  className,
  function: func,
  selected,
  chord,
  roman,
  isKick,
  isSnare,
  beatIndex,
  onEdit,
  isPlaying = false,
  timestamp,
  paintMode = false,
  paintChord = null,
  isDragging = false,
  onPaint,
  beat,
  showConfidence = false,
  confidence,
  hasConflict = false,
  isAttack = false,
  isSustain = false,
  ...props
}: BeatCardProps) => {
  // Handle paint mode - trigger paint on mouse enter while dragging
  const handleMouseEnter = (e: React.MouseEvent) => {
    if (paintMode && isDragging && paintChord && onPaint) {
      onPaint();
    }
    // Call original onMouseEnter if provided
    if (props.onMouseEnter) {
      props.onMouseEnter(e);
    }
  };

  // Prevent click when painting
  const handleClick = (e: React.MouseEvent) => {
    if (paintMode && isDragging) {
      e.preventDefault();
      return;
    }
    if (onEdit) {
      onEdit();
    }
  };

  // Calculate opacity based on confidence when showConfidence is enabled
  const getConfidenceOpacity = () => {
    if (!showConfidence || confidence === undefined) return 1;
    if (confidence > 0.9) return 1; // High confidence: fully opaque
    if (confidence < 0.5) return 0.3; // Low confidence: ghosted
    // Medium confidence: interpolate between 0.3 and 1
    return 0.3 + (confidence - 0.5) * (1 - 0.3) / (0.9 - 0.5);
  };

  const confidenceOpacity = getConfidenceOpacity();
  const confidencePercent = confidence !== undefined ? Math.round(confidence * 100) : null;

  // Build tooltip text
  const tooltipText = (() => {
    if (paintMode && paintChord) return `Paint: ${paintChord}`;
    if (showConfidence && confidence !== undefined) {
      return `Confidence: ${confidencePercent}%${hasConflict ? ' (Engine Conflict!)' : ''}`;
    }
    return undefined;
  })();

  // Clean up chord label: remove 'major' suffix for brevity
  const cleanChordLabel = chord ? chord.replace(/major/gi, '').trim() : null;

  // Determine visual state: Attack, Sustain, or Rest
  const isRest = !chord && !isAttack && !isSustain;

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      className={cn(
        beatCardVariants({ function: func || 'default', selected }),
        // Dynamic Rhythm Borders - works on both attack and sustain
        isKick &&
          'border-b-[6px] border-b-music-kick shadow-[0_8px_16px_hsl(var(--music-kick)/0.3)]',
        isSnare &&
          'border-t-[6px] border-t-music-snare shadow-[0_-8px_16px_hsl(var(--music-snare)/0.3)]',
        // Sustain state: dimmed and recessed
        isSustain && 'opacity-40 brightness-75 scale-95',
        // Active playback highlight
        isPlaying &&
          'ring-2 ring-music-kick ring-offset-2 ring-offset-slate-950 shadow-[0_0_20px_hsl(var(--music-kick)/0.6)] scale-105 z-20',
        // Paint mode cursor
        paintMode && paintChord && 'cursor-crosshair',
        // Paint mode hover effect
        paintMode && paintChord && isDragging && 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-950',
        // Conflict warning border (red)
        showConfidence && hasConflict && 'ring-2 ring-red-500 ring-offset-1 ring-offset-slate-950',
        className,
      )}
      style={{
        opacity: showConfidence ? confidenceOpacity : (isSustain ? 0.4 : undefined),
        transition: showConfidence || isSustain ? 'opacity 0.2s ease-in-out' : undefined,
      } as React.CSSProperties}
      title={tooltipText}
      {...props}
    >
      <span className="absolute top-1 left-1 text-xs font-mono opacity-50">
        {typeof beatIndex === 'number' ? beatIndex + 1 : ''}
      </span>

      {/* Conditional Rendering based on state */}
      {isAttack && cleanChordLabel ? (
        // Attack: Full card with bold chord label
        <span className="text-base font-bold tracking-tighter">{cleanChordLabel}</span>
      ) : isSustain ? (
        // Sustain: Dimmed card with horizontal hold line
        <div className="w-full flex items-center justify-center">
          <div className="h-0.5 w-3/4 bg-current opacity-60" />
        </div>
      ) : isRest ? (
        // Rest: Small dot or rest symbol
        <span className="text-xl opacity-20">•</span>
      ) : (
        // Fallback: Empty state
        <span className="text-xl opacity-10">−</span>
      )}

      {/* Roman numeral - only show on attack */}
      {roman && isAttack && (
        <span className="absolute bottom-1 right-1 text-xs font-bold px-1 py-0.5 bg-black/40 rounded-full backdrop-blur-sm">
          {roman}
        </span>
      )}
      {/* Drum indicators - work on both attack and sustain */}
      {isKick && (
        <span className="absolute bottom-1 left-1 w-1 h-1 rounded-full bg-music-kick shadow-[0_1px_3px_hsl(var(--music-kick)/0.4)]" />
      )}
      {isSnare && (
        <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-music-snare shadow-[0_1px_3px_hsl(var(--music-snare)/0.4)]" />
      )}
    </button>
  );
};
BeatCard.displayName = 'BeatCard';


