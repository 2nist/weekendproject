import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// 1. Define the Base Styles & Variants
const beatCardVariants = cva(
  'relative h-32 w-24 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95',
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
      <span className="absolute top-2 left-2 text-[10px] font-mono opacity-50">
        {typeof beatIndex === 'number' ? beatIndex + 1 : ''}
      </span>

      {chord ? (
        <span className="text-2xl font-black tracking-tighter">{chord}</span>
      ) : (
        <span className="text-3xl opacity-10">−</span>
      )}

      {roman && (
        <span className="absolute bottom-2 right-2 text-[10px] font-bold px-2 py-0.5 bg-black/40 rounded-full backdrop-blur-sm">
          {roman}
        </span>
      )}
    </button>
  );
};
BeatCard.displayName = 'BeatCard';
