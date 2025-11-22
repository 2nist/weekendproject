import React, { useState, useMemo } from 'react';
import type { Section, BeatNode, ProgressionGroup } from '../../types/audio';
import { transformAnalysisToGrid, detectProgressionGroups } from '../../utils/musicTimeTransform';
import { SectionContainer } from './SectionContainer';

interface HarmonicGridProps {
  linearAnalysis: any;
  structuralMap?: any;
  onBeatClick?: (beat: BeatNode) => void;
  onBeatEdit?: (beat: BeatNode, newChord: string) => void;
  onSectionEdit?: (section: Section) => void;
  onSectionClone?: (section: Section) => void;
  onProgressionEdit?: (progression: ProgressionGroup) => void;
}

export const HarmonicGrid: React.FC<HarmonicGridProps> = ({
  linearAnalysis,
  structuralMap,
  onBeatClick,
  onBeatEdit,
  onSectionEdit,
  onSectionClone,
  onProgressionEdit,
}) => {
  const [selectedBeats, setSelectedBeats] = useState<Set<string>>(new Set());
  const [editingBeat, setEditingBeat] = useState<BeatNode | null>(null);
  const [chordInput, setChordInput] = useState<string>('');
  const [chordOverrides, setChordOverrides] = useState<Record<string, string>>({});

  // Transform analysis data to grid structure
  const sections = useMemo(() => {
    if (!linearAnalysis) return [];
    return transformAnalysisToGrid(linearAnalysis, structuralMap);
  }, [linearAnalysis, structuralMap]);

  // Detect progression groups across all sections
  const allProgressions = useMemo(() => {
    const allMeasures = sections.flatMap(s => s.measures);
    return detectProgressionGroups(allMeasures);
  }, [sections]);

  // Apply chord overrides for display without mutating source analysis
  const sectionsWithOverrides = useMemo(() => {
    if (!sections.length) return sections;
    return sections.map(section => ({
      ...section,
      measures: section.measures.map(m => ({
        ...m,
        beats: m.beats.map(b => ({
          ...b,
          chordLabel: chordOverrides[b.id] || b.chordLabel,
        }))
      }))
    }));
  }, [sections, chordOverrides]);

  const handleBeatClick = (beat: BeatNode) => {
    if (beat.isSelected) {
      setSelectedBeats(prev => {
        const next = new Set(prev);
        next.delete(beat.id);
        return next;
      });
    } else {
      setSelectedBeats(prev => new Set([...prev, beat.id]));
    }
    onBeatClick?.(beat);
  };

  const handleBeatDoubleClick = (beat: BeatNode) => {
    setEditingBeat(beat);
    setChordInput(chordOverrides[beat.id] || beat.chordLabel || '');
    console.log('Edit beat:', beat);
  };

  const handleSectionEdit = (section: Section) => {
    // In a real implementation, this would open a section editor modal
    console.log('Edit section:', section);
    onSectionEdit?.(section);
  };

  const handleSectionClone = (section: Section) => {
    console.log('Clone section:', section);
    onSectionClone?.(section);
  };

  const handleProgressionEdit = (progression: ProgressionGroup) => {
    // In a real implementation, this would open a progression editor
    console.log('Edit progression:', progression);
    onProgressionEdit?.(progression);
  };

  if (!linearAnalysis) {
    return (
      <div className="p-8 text-center text-muted-foreground border-dashed border-border rounded-lg">
        No analysis data available. Please run an analysis first.
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border-dashed border-border rounded-lg">
        No sections detected in the analysis.
      </div>
    );
  }

  return (
    <div className="w-full p-6 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-2">Harmonic Grid</h2>
          <p className="text-muted-foreground text-sm">
            Click beats to select, double-click to edit. Drag sections to reorder.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sectionsWithOverrides.map((section) => (
            <SectionContainer
              key={section.id}
              section={section}
              progressions={allProgressions}
              onBeatClick={handleBeatClick}
              onBeatDoubleClick={handleBeatDoubleClick}
              onSectionEdit={handleSectionEdit}
              onSectionClone={handleSectionClone}
              onProgressionEdit={handleProgressionEdit}
            />
          ))}
        </div>

        {/* Edit Modal (placeholder - implement as needed) */}
        {editingBeat && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full shadow-lg">
              <h3 className="text-xl font-bold text-foreground mb-3">Edit Beat</h3>
              <p className="text-muted-foreground mb-4 text-sm">
                Beat {editingBeat.beatIndex + 1} at {editingBeat.timestamp.toFixed(2)}s
              </p>
              <label className="block mb-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Chord Label</span>
                <input
                  autoFocus
                  value={chordInput}
                  onChange={(e) => setChordInput(e.target.value)}
                  placeholder="e.g. Cmaj7 or I"
                  className="mt-1 w-full px-3 py-2 rounded bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditingBeat(null)}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (editingBeat) {
                      const newChord = chordInput.trim();
                      if (newChord) {
                        setChordOverrides(prev => ({ ...prev, [editingBeat.id]: newChord }));
                        onBeatEdit?.(editingBeat, newChord);
                      }
                    }
                    setEditingBeat(null);
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm font-semibold"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};



