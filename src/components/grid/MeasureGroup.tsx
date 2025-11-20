import React from 'react';
import { Measure, BeatNode } from '../../utils/musicTimeTransform';
import { BeatCard } from './BeatCard';

interface MeasureGroupProps {
  measure: Measure;
  onBeatClick?: (beat: BeatNode) => void;
  onBeatDoubleClick?: (beat: BeatNode) => void;
}

export const MeasureGroup: React.FC<MeasureGroupProps> = ({ 
  measure, 
  onBeatClick, 
  onBeatDoubleClick 
}) => {
  return (
    <div className="flex flex-col gap-1 relative">
      {/* Bar Number Header */}
      <div className="text-xs text-gray-500 font-mono pl-1">
        BAR {measure.index}
      </div>
      
      {/* The Group of 4 Cards */}
      <div className="flex gap-2 bg-gray-900 p-2 rounded-xl border border-gray-800">
        {measure.beats.map((beat, i) => {
          // Determine harmonic function variant
          let harmonicVariant: any = "rest";
          if (beat.chordLabel) {
            const label = String(beat.functionLabel || "");
            if (/\bI\b|tonic/i.test(label)) harmonicVariant = "tonic";
            else if (/\bV\b/.test(label)) harmonicVariant = "dominant";
            else if (/\bIV\b|\bII\b|subdominant/i.test(label)) harmonicVariant = "subdominant";
            else if (/vii|°|dim/i.test(label)) harmonicVariant = "diminished";
            else harmonicVariant = "default";
          }
          const isKick = beat.beatIndex === 0 && beat.isAttack;
          const isSnare = (beat.beatIndex === 1 || beat.beatIndex === 3) && beat.isAttack;
          return (
            <BeatCard
              key={beat.id}
              chordLabel={beat.chordLabel}
              romanNumeral={beat.functionLabel}
              function={harmonicVariant}
              selected={beat.isSelected}
              isKick={isKick}
              isSnare={isSnare}
              aria-label={`${beat.beatIndex + 1}`}
              onClick={() => onBeatClick?.(beat)}
              onDoubleClick={() => onBeatDoubleClick?.(beat)}
            />
          );
        })}
      </div>
    </div>
  );
};

