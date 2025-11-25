import React, { useState, useEffect } from 'react';
import { getNoveltyStatsForSection, getKeyChangeForSection } from '@/utils/novelty';
import { Button } from '@/components/ui/button';
import { X, Trash2, Copy, Scissors } from 'lucide-react';

// Legacy type alias for backward compatibility
export type SelectedObject =
  | { type: 'beat'; data: any }
  | { type: 'measure'; data: any }
  | { type: 'section'; data: any }
  | null;

interface ContextualInspectorProps {
  selected: SelectedObject;
  onClose: () => void;
  onUpdateBeat?: (
    beatId: string,
    updates: { chord?: string; function?: string; hasKick?: boolean; hasSnare?: boolean },
  ) => void;
  onUpdateSection?: (sectionId: string, updates: { label?: string; color?: string }) => void;
  onDeleteSection?: (sectionId: string) => void;
  onDuplicateSection?: (sectionId: string) => void;
  onSplitSection?: (sectionId: string) => void;
  onChordChange?: (chord: string | null) => void;
  sections?: any[];
  noveltyCurve?: number[];
  noveltyMethod?: 'mad' | 'percentile';
  noveltyParam?: number;
}

export const ContextualInspector: React.FC<ContextualInspectorProps> = ({
  selected,
  onClose,
  onUpdateBeat,
  onUpdateSection,
  onDeleteSection,
  onDuplicateSection,
  onSplitSection,
  onChordChange,
  sections = [],
  noveltyCurve = [],
  noveltyMethod = 'mad',
  noveltyParam = 1.5,
}) => {
  const [chordValue, setChordValue] = useState('');
  const [functionValue, setFunctionValue] = useState('');
  const [hasKick, setHasKick] = useState(false);
  const [hasSnare, setHasSnare] = useState(false);
  const [sectionLabel, setSectionLabel] = useState('');
  const [sectionColor, setSectionColor] = useState('gray');

  // Summary fields
  const [noveltySummary, setNoveltySummary] = useState<any>(null);
  const [keySummary, setKeySummary] = useState<any>(null);

  // Update local state when selection changes
  useEffect(() => {
    if (selected?.type === 'beat') {
      const beat = selected.data;
      const chord = beat.chordLabel || '';
      setChordValue(chord);
      setFunctionValue(beat.functionLabel || '');
      setHasKick(beat.drums?.hasKick || false);
      setHasSnare(beat.drums?.hasSnare || false);
      // Notify parent of chord change for paint mode
      if (onChordChange) {
        onChordChange(chord || null);
      }
    } else if (selected?.type === 'section') {
      const section = selected.data;
      setSectionLabel(section.section_label || section.label || '');
      setSectionColor(section.color || 'gray');
      if (sections && noveltyCurve && sections.length) {
        const idx = sections.findIndex((s) => s.section_id === (section.section_id || section.id));
        const stats = getNoveltyStatsForSection(
          section,
          noveltyCurve,
          0.1,
          noveltyMethod,
          noveltyParam,
        );
        const keyChange = getKeyChangeForSection(sections, idx);
        setNoveltySummary(stats);
        setKeySummary(keyChange);
      }
    }
  }, [selected, onChordChange]);

  const handleBeatSave = () => {
    if (selected?.type === 'beat' && onUpdateBeat) {
      onUpdateBeat(selected.data.id, {
        chord: chordValue,
        function: functionValue,
        hasKick,
        hasSnare,
      });
    }
  };

  const handleSectionSave = () => {
    if (selected?.type === 'section' && onUpdateSection) {
      onUpdateSection(selected.data.section_id || selected.data.id, {
        label: sectionLabel,
        color: sectionColor,
      });
    }
  };

  if (!selected) {
    return (
      <div className="w-80 border-l border-slate-800 bg-slate-900/50 flex items-center justify-center">
        <div className="text-center text-slate-500 p-8">
          <p className="text-sm">Select a beat, measure, or section to edit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-slate-800 bg-slate-900/50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">
          {selected.type === 'beat' && 'Beat Properties'}
          {selected.type === 'measure' && 'Measure Properties'}
          {selected.type === 'section' && 'Section Properties'}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {selected.type === 'beat' && (
          <>
            <div className="space-y-2">
              <label
                htmlFor="chord-input"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Chord
              </label>
              <input
                id="chord-input"
                type="text"
                value={chordValue}
                onChange={(e) => {
                  const newChord = e.target.value;
                  setChordValue(newChord);
                  // Update paint chord in real-time as user types
                  if (onChordChange) {
                    onChordChange(newChord || null);
                  }
                }}
                onBlur={handleBeatSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBeatSave();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="C, Cmaj7, etc."
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="function-select"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Function
              </label>
              <select
                id="function-select"
                value={functionValue}
                onChange={(e) => {
                  const value = e.target.value;
                  setFunctionValue(value);
                  if (onUpdateBeat && selected.type === 'beat') {
                    onUpdateBeat(selected.data.id, { function: value });
                  }
                }}
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select function</option>
                <option value="tonic">Tonic</option>
                <option value="subdominant">Subdominant</option>
                <option value="dominant">Dominant</option>
                <option value="diminished">Diminished</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300 mb-1">Drums</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasKick}
                    onChange={(e) => {
                      setHasKick(e.target.checked);
                      if (onUpdateBeat && selected.type === 'beat') {
                        onUpdateBeat(selected.data.id, { hasKick: e.target.checked });
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-300">Kick</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasSnare}
                    onChange={(e) => {
                      setHasSnare(e.target.checked);
                      if (onUpdateBeat && selected.type === 'beat') {
                        onUpdateBeat(selected.data.id, { hasSnare: e.target.checked });
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-300">Snare</span>
                </label>
              </div>
            </div>

            {selected.data.timestamp !== undefined && (
              <div className="pt-4 border-t border-slate-800">
                <div className="text-xs text-slate-500">
                  <div>Timestamp: {selected.data.timestamp.toFixed(2)}s</div>
                  {selected.data.beatIndex !== undefined && (
                    <div>Beat: {selected.data.beatIndex + 1}</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {selected.type === 'measure' && (
          <div className="space-y-4">
            <div className="text-sm text-slate-400">
              <div>Bar Number: {selected.data.index || selected.data.barNumber}</div>
              <div>Beats: {selected.data.beats?.length || 0}</div>
            </div>
            <p className="text-xs text-slate-500">Measure editing coming soon...</p>
          </div>
        )}

        {selected.type === 'section' && (
          <>
            <div className="space-y-2">
              <label
                htmlFor="section-label"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Label
              </label>
              <input
                id="section-label"
                type="text"
                value={sectionLabel}
                onChange={(e) => setSectionLabel(e.target.value)}
                onBlur={handleSectionSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSectionSave();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Verse, Chorus, etc."
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="section-color"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Color
              </label>
              <select
                id="section-color"
                value={sectionColor}
                onChange={(e) => {
                  const value = e.target.value;
                  setSectionColor(value);
                  if (onUpdateSection && selected.type === 'section') {
                    onUpdateSection(selected.data.section_id || selected.data.id, { color: value });
                  }
                }}
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="blue">Blue</option>
                <option value="indigo">Indigo</option>
                <option value="green">Green</option>
                <option value="purple">Purple</option>
                <option value="yellow">Yellow</option>
                <option value="red">Red</option>
                <option value="orange">Orange</option>
                <option value="pink">Pink</option>
                <option value="gray">Gray</option>
              </select>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Actions</label>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onSplitSection && selected.type === 'section') {
                      onSplitSection(selected.data.section_id || selected.data.id);
                    }
                  }}
                  className="w-full justify-start bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                >
                  <Scissors className="w-4 h-4 mr-2" />
                  Split Here
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onDuplicateSection && selected.type === 'section') {
                      onDuplicateSection(selected.data.section_id || selected.data.id);
                    }
                  }}
                  className="w-full justify-start bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onDeleteSection && selected.type === 'section') {
                      onDeleteSection(selected.data.section_id || selected.data.id);
                    }
                  }}
                  className="w-full justify-start bg-red-900/20 border-red-800 text-red-400 hover:bg-red-900/30"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>

            {selected.data.time_range && (
              <div className="pt-4 border-t border-slate-800">
                <div className="text-xs text-slate-500">
                  <div>Start: {selected.data.time_range.start_time?.toFixed(2)}s</div>
                  <div>End: {selected.data.time_range.end_time?.toFixed(2)}s</div>
                  <div>Measures: {selected.data.measures?.length || 0}</div>
                </div>
              </div>
            )}
            {/* Summary block: novelty & key-change */}
            <div className="mt-3 p-3 bg-slate-800 border border-slate-700 rounded">
              <div className="flex justify-between items-center mb-2">
                <div className="text-xs text-slate-400">Summary</div>
                <div className="text-xs text-slate-500">Insights</div>
              </div>
              {noveltySummary ? (
                <div className="text-sm text-slate-200 mb-1">
                  <strong>Novelty Peak:</strong> {noveltySummary.peakValue.toFixed(3)} @{' '}
                  {noveltySummary.peakTime.toFixed(2)}s
                </div>
              ) : (
                <div className="text-sm text-slate-500 mb-1">Novelty: N/A</div>
              )}
              {/* Sparkline of section novelty */}
              {noveltySummary?.withinRange && noveltySummary.withinRange.length > 0 && (
                <div className="pt-2">
                  <svg viewBox="0 0 160 32" preserveAspectRatio="none" className="w-full h-8">
                    <polyline
                      fill="none"
                      stroke="#60a5fa"
                      strokeWidth="1.5"
                      points={noveltySummary.withinRange
                        .map((v: number, i: number) => {
                          const x = (i / (noveltySummary.withinRange.length - 1)) * 160;
                          const max = Math.max(...noveltySummary.withinRange, 1);
                          const y = 32 - (v / max) * 28 - 2;
                          return `${x.toFixed(2)},${y.toFixed(2)}`;
                        })
                        .join(' ')}
                    />
                  </svg>
                </div>
              )}
              {noveltySummary?.significantPeaks && noveltySummary.significantPeaks.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-slate-400 mb-2">Significant peaks</div>
                  <div className="flex flex-col gap-2">
                    {noveltySummary.significantPeaks.map((p: any, idx: number) => (
                      <div key={`sig-${idx}`} className="flex items-center justify-between gap-2">
                        <div className="text-sm text-slate-200">
                          {p.time.toFixed(2)}s ({p.value.toFixed(3)})
                        </div>
                        <div>
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (onSplitSection && selected?.type === 'section') {
                                onSplitSection(selected.data.section_id || selected.data.id);
                              }
                              try {
                                if (window?.electronAPI?.invoke) {
                                  await window.electronAPI.invoke('ARCHITECT:FORCE_SPLIT', {
                                    frame: p.frame,
                                  });
                                }
                              } catch (e) {
                                console.warn('Split invoke failed', e);
                              }
                            }}
                          >
                            Suggest Split
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {keySummary && keySummary.changes && keySummary.changes.length > 0 ? (
                <div className="text-sm text-slate-200">
                  Key Changes:
                  <ul className="list-disc ml-4 mt-2">
                    {keySummary.changes.map((c: string, i: number) => (
                      <li key={`kc-${i}`}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Key: no detected change</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
