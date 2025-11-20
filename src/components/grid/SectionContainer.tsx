import React, { useState } from 'react';
import {
  Section,
  BeatNode,
  ProgressionGroup,
} from '../../utils/musicTimeTransform';
import { Measure as MeasureComponent } from './Measure';
import { BeatCard } from './BeatCard';
import { ProgressionBracket } from './ProgressionBracket';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

interface SectionContainerProps {
  section: Section;
  progressions?: ProgressionGroup[];
  onBeatClick?: (beat: BeatNode) => void;
  onBeatDoubleClick?: (beat: BeatNode) => void;
  onSectionEdit?: (section: Section) => void;
  onSectionClone?: (section: Section) => void;
  onProgressionEdit?: (progression: ProgressionGroup) => void;
}

const colorMap: Record<string, string> = {
  blue: 'border-blue-500 bg-blue-500/10',
  indigo: 'border-indigo-500 bg-indigo-500/10',
  green: 'border-green-500 bg-green-500/10',
  purple: 'border-purple-500 bg-purple-500/10',
  yellow: 'border-yellow-500 bg-yellow-500/10',
  red: 'border-red-500 bg-red-500/10',
  orange: 'border-orange-500 bg-orange-500/10',
  pink: 'border-pink-500 bg-pink-500/10',
  gray: 'border-gray-500 bg-gray-500/10',
};

const sectionVariants = cva(
  'relative p-6 rounded-3xl border-2 border-dashed transition-all',
  {
    variants: {
      type: {
        verse: 'border-blue-900/30 bg-blue-950/5',
        chorus: 'border-purple-900/30 bg-purple-950/5',
        bridge: 'border-orange-900/30 bg-orange-950/5',
        default: 'border-slate-800 bg-slate-950/30',
      },
    },
    defaultVariants: { type: 'default' },
  },
);

export const SectionContainer: React.FC<SectionContainerProps> = ({
  section,
  progressions = [],
  onBeatClick,
  onBeatDoubleClick,
  onSectionEdit,
  onSectionClone,
  onProgressionEdit,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const sectionColor = section.color || 'gray';
  const borderColor = colorMap[sectionColor] || colorMap.gray;
  const labelLower = (section.label || '').toLowerCase();
  let sectionType: 'verse' | 'chorus' | 'bridge' | 'default' = 'default';
  if (labelLower.includes('chorus')) sectionType = 'chorus';
  else if (labelLower.includes('bridge')) sectionType = 'bridge';
  else if (labelLower.includes('verse')) sectionType = 'verse';

  const sectionProgressions = progressions.filter(
    (p) =>
      p.startMeasure >= section.measures[0]?.index &&
      p.endMeasure <= section.measures[section.measures.length - 1]?.index,
  );

  const handleHeaderClick = () => {
    setIsExpanded(!isExpanded);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSectionEdit?.(section);
  };

  const handleClone = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSectionClone?.(section);
  };

  // Calculate measure width (approximate: 4 beats * 80px + gaps)
  const measureWidth = 4 * 80 + 3 * 8 + 16; // 4 cards + 3 gaps + padding

  return (
    <div
      className={cn(
        sectionVariants({ type: sectionType }),
        borderColor,
        'p-4 mb-6',
      )}
    >
      {/* Section Header */}
      <button
        type="button"
        className="flex items-center justify-between mb-4 cursor-pointer hover:bg-gray-800/50 p-2 rounded transition-colors"
        onClick={handleHeaderClick}
        aria-label={`Toggle ${section.label}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white uppercase tracking-wider">
            {section.label}
          </span>
          <span className="text-sm text-gray-400">
            ({section.measures.length}{' '}
            {section.measures.length === 1 ? 'Bar' : 'Bars'})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleEdit}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
            title="Edit section"
            aria-label="Edit section"
            type="button"
          >
            ✏️ Edit
          </button>
          <button
            onClick={handleClone}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
            title="Clone section"
            aria-label="Clone section"
            type="button"
          >
            📋 Clone
          </button>
          <span className="text-gray-500">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {/* Measures Grid */}
      {isExpanded && (
        <div className="relative">
          {/* Progression Brackets */}
          {sectionProgressions.map((progression) => (
            <ProgressionBracket
              key={progression.id}
              progression={progression}
              measureWidth={measureWidth}
              onEdit={onProgressionEdit}
            />
          ))}

          {/* Measures */}
          <div className="flex flex-wrap gap-4 pt-6">
            {section.measures.map((measure) => (
              <MeasureComponent
                key={measure.index}
                barNumber={measure.index}
                onEdit={() => console.log('Edit Bar', measure.index)}
              >
                {measure.beats.map((beat) => {
                  let harmonicVariant: any = 'rest';
                  if (beat.chordLabel) {
                    const label = String(beat.functionLabel || '');
                    if (/\bI\b|tonic/i.test(label)) harmonicVariant = 'tonic';
                    else if (/\bV\b/.test(label)) harmonicVariant = 'dominant';
                    else if (/\bIV\b|\bII\b|subdominant/i.test(label))
                      harmonicVariant = 'subdominant';
                    else if (/vii|°|dim/i.test(label))
                      harmonicVariant = 'diminished';
                    else harmonicVariant = 'default';
                  }
                  const isKick = beat.beatIndex === 0 && beat.isAttack;
                  const isSnare =
                    (beat.beatIndex === 1 || beat.beatIndex === 3) &&
                    beat.isAttack;
                  return (
                    <BeatCard
                      key={beat.id}
                      chord={beat.chordLabel}
                      roman={beat.functionLabel}
                      function={harmonicVariant}
                      selected={beat.isSelected}
                      isKick={isKick}
                      isSnare={isSnare}
                      beatIndex={beat.beatIndex}
                      onEdit={() => onBeatClick?.(beat as any)}
                    />
                  );
                })}
              </MeasureComponent>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
