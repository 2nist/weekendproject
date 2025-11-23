import React, { useState, useEffect, useRef } from 'react';
import type { Section, BeatNode, ProgressionGroup } from '../../types/audio';
import { Measure as MeasureComponent } from './Measure';
import { BeatCard } from './BeatCard';
import { ProgressionBracket } from './ProgressionBracket';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { SmartContextMenu } from '../ui/SmartContextMenu';
import { useEditor } from '../../contexts/EditorContext';

interface SectionContainerProps {
  section?: Section;
  label?: string;
  type?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  progressions?: ProgressionGroup[];
  onBeatClick?: (beat: BeatNode) => void;
  onBeatDoubleClick?: (beat: BeatNode) => void;
  onSectionEdit?: (section: Section) => void;
  onSectionClone?: (section: Section) => void;
  onProgressionEdit?: (progression: ProgressionGroup) => void;
  'data-section-id'?: string;
}

const colorMap: Record<string, string> = {
  blue: 'border-primary bg-primary/10',
  indigo: 'border-primary bg-primary/10',
  green: 'border-music-subdominant bg-music-subdominant/10',
  purple: 'border-music-diminished bg-music-diminished/10',
  yellow: 'border-accent bg-accent/10',
  red: 'border-destructive bg-destructive/10',
  orange: 'border-accent bg-accent/10',
  pink: 'border-accent bg-accent/10',
  gray: 'border-border bg-muted/30',
};

const sectionVariants = cva('relative p-6 rounded-3xl border-2 border-dashed transition-all', {
  variants: {
    type: {
      verse: 'border-primary/30 bg-primary/5',
      chorus: 'border-music-diminished/30 bg-music-diminished/5',
      bridge: 'border-accent/30 bg-accent/5',
      default: 'border-border bg-muted/30',
    },
  },
  defaultVariants: { type: 'default' },
});

export const SectionContainer: React.FC<SectionContainerProps> = ({
  section,
  label,
  type,
  children,
  onClick,
  progressions = [],
  onBeatClick,
  onBeatDoubleClick,
  onSectionEdit,
  onSectionClone,
  onProgressionEdit,
  'data-section-id': dataSectionId,
}) => {
  const { state } = useEditor();
  const [isExpanded, setIsExpanded] = useState(true);

  // Calculate which beat is currently active based on playback time
  const getActiveBeatId = () => {
    if (!state.isPlaying || !section?.measures) return null;

    const currentTime = state.playbackTime;

    // Find the beat that contains the current playback time
    for (const measure of section.measures) {
      for (const beat of measure.beats) {
        const beatStart = beat.timestamp;
        const nextBeat = measure.beats[measure.beats.indexOf(beat) + 1];
        const beatEnd = nextBeat ? nextBeat.timestamp : beatStart + 0.5; // Default 0.5s duration

        if (currentTime >= beatStart && currentTime < beatEnd) {
          return beat.id;
        }
      }
    }

    return null;
  };

  const activeBeatId = getActiveBeatId();

  // Auto-scroll active beat into view
  useEffect(() => {
    if (activeBeatId && state.isPlaying) {
      const activeElement = document.querySelector(`[data-beat-id="${activeBeatId}"]`);
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    }
  }, [activeBeatId, state.isPlaying]);

  // Simple wrapper mode (label/type/children)
  if (label !== undefined || type !== undefined || children !== undefined) {
    const labelLower = (type || label || '').toLowerCase();
    let sectionType: 'verse' | 'chorus' | 'bridge' | 'default' = 'default';
    if (labelLower.includes('chorus')) sectionType = 'chorus';
    else if (labelLower.includes('bridge')) sectionType = 'bridge';
    else if (labelLower.includes('verse')) sectionType = 'verse';

    return (
      <div
        className={cn(
          sectionVariants({ type: sectionType }),
          'p-4 mb-6 cursor-pointer hover:bg-muted/50 transition-colors',
        )}
        onClick={onClick}
        data-section-id={dataSectionId}
      >
        <div className="mb-4">
          <h3 className="text-lg font-bold text-foreground uppercase tracking-wider">{label}</h3>
        </div>
        {children}
      </div>
    );
  }

  // Full section mode (section prop)
  if (!section) return null;

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

  // Calculate measure width based on the number of beats in a measure
  const cardWidthPx = 32; // pixel width of the small beat card
  const gapPx = 8; // gap between cards
  const measurePaddingPx = 16; // container padding
  const beatsPerMeasure = section.measures[0]?.beats?.length || 4;
  const measureWidth =
    beatsPerMeasure * cardWidthPx + Math.max(0, beatsPerMeasure - 1) * gapPx + measurePaddingPx;

  return (
    <div
      className={cn(sectionVariants({ type: sectionType }), borderColor, 'p-4 mb-6')}
      data-section-id={dataSectionId || section?.id}
    >
      {/* Section Header */}
      <SmartContextMenu menuType="section" entityId={section.id} data={section}>
        <button
          type="button"
          className="flex items-center justify-between mb-4 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors w-full"
          onClick={handleHeaderClick}
          aria-label={`Toggle ${section.label}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-foreground uppercase tracking-wider">
              {section.label}
            </span>
            <span className="text-sm text-muted-foreground">
              ({section.measures.length} {section.measures.length === 1 ? 'Bar' : 'Bars'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleEdit}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
              title="Edit section"
              aria-label="Edit section"
              type="button"
            >
              Edit
            </button>
            <button
              onClick={handleClone}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
              title="Clone section"
              aria-label="Clone section"
              type="button"
            >
              Clone
            </button>
            <span className="text-muted-foreground">{isExpanded ? '▼' : '▶'}</span>
          </div>
        </button>
      </SmartContextMenu>

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
          <div className="flex flex-wrap gap-2 pt-4">
            {section.measures.map((measure) => (
              <MeasureComponent
                key={measure.index}
                barNumber={measure.index}
                numerator={measure.timeSignature?.numerator || measure.beats?.length || 4}
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
                    else if (/vii|°|dim/i.test(label)) harmonicVariant = 'diminished';
                    else harmonicVariant = 'default';
                  }
                  const isKick = !!beat.drums?.hasKick;
                  const isSnare = !!beat.drums?.hasSnare;
                  return (
                    <SmartContextMenu key={beat.id} menuType="beat" entityId={beat.id} data={beat}>
                      <BeatCard
                        data-beat-id={beat.id}
                        chord={beat.chordLabel}
                        roman={beat.functionLabel}
                        function={harmonicVariant}
                        selected={beat.isSelected}
                        isKick={isKick}
                        isSnare={isSnare}
                        beatIndex={beat.beatIndex}
                        isAttack={beat.isAttack}
                        isSustain={beat.isSustain}
                        isActive={beat.id === activeBeatId}
                        onEdit={() => onBeatClick?.(beat)}
                      />
                    </SmartContextMenu>
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
