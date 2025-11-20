import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// 1. Define the Base Styles & Variants
const beatCardVariants = cva(
  "relative h-24 w-20 rounded-lg border-2 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer select-none",
  {
    variants: {
      function: {
        rest: "bg-card border-border text-muted-foreground opacity-50 scale-95",
        tonic: "bg-music-tonic border-music-tonic text-white hover:brightness-110",
        dominant: "bg-music-dominant border-music-dominant text-white hover:brightness-110",
        subdominant: "bg-music-subdominant border-music-subdominant text-white hover:brightness-110",
        diminished: "bg-music-diminished border-music-diminished text-white hover:brightness-110",
        default: "bg-accent border-accent text-accent-foreground",
      },
      selected: {
        true: "ring-2 ring-ring ring-offset-2 ring-offset-background z-10",
        false: "",
      },
    },
    defaultVariants: {
      function: "default",
      selected: false,
    },
  },
);

// 2. Define Props
export interface BeatCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof beatCardVariants> {
  chordLabel?: string | null;
  romanNumeral?: string | null;
  isKick?: boolean;
  isSnare?: boolean;
}

// 3. The Component
export const BeatCard = React.forwardRef<HTMLDivElement, BeatCardProps>(
  (
    {
      className,
      function: harmonicFunction,
      selected,
      chordLabel,
      romanNumeral,
      isKick,
      isSnare,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          beatCardVariants({ function: harmonicFunction || "default", selected }),
          // Rhythmic overrides
          isKick && "border-b-4 border-b-music-kick shadow-[0_4px_12px_theme(colors.music.kick.glow)]",
          isSnare && "border-t-4 border-t-music-snare shadow-[0_-4px_12px_theme(colors.music.snare.glow)]",
          isKick && isSnare && "animate-pulse-subtle",
          className,
        )}
        {...props}
      >
        <span className="absolute top-1 left-1 text-[10px] font-mono opacity-60">
          {props["aria-label"]}
        </span>

        {chordLabel && (
          <span className="text-xl font-bold tracking-tighter">{chordLabel}</span>
        )}

        {romanNumeral && (
          <span className="absolute bottom-1 right-1 text-[9px] font-bold px-1 bg-black/30 rounded">
            {romanNumeral}
          </span>
        )}
      </div>
    );
  },
);
BeatCard.displayName = "BeatCard";

