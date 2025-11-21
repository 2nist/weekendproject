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
  ...props
}: BeatCardProps) => {
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        beatCardVariants({ function: func || 'default', selected }),
        // Dynamic Rhythm Borders
        isKick &&
          'border-b-[6px] border-b-music-kick shadow-[0_8px_16px_hsl(var(--music-kick)/0.3)]',
        isSnare &&
          'border-t-[6px] border-t-music-snare shadow-[0_-8px_16px_hsl(var(--music-snare)/0.3)]',
        className,
      )}
      {...props}
    >
      <span className="absolute top-1 left-1 text-xs font-mono opacity-50">
        {typeof beatIndex === 'number' ? beatIndex + 1 : ''}
      </span>

      {chord ? (
        <span className="text-base font-bold tracking-tighter">{chord}</span>
      ) : (
        <span className="text-xl opacity-10">−</span>
      )}

      {roman && (
        <span className="absolute bottom-1 right-1 text-xs font-bold px-1 py-0.5 bg-black/40 rounded-full backdrop-blur-sm">
          {roman}
        </span>
      )}
      {/* Drum indicators */}
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
