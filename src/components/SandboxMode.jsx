import React, { useState, useEffect } from 'react';
import ArrangementBlock from './ArrangementBlock';
import SectionSculptor from './SectionSculptor';
import { MusicTheoryToolkit } from './sandbox/MusicTheoryToolkit';
import { LyricDraftPanel } from './lyrics/LyricDraftPanel';
import { draftTextToLyricLines } from '@/utils/lyrics';

/**
 * Blank Sandbox Mode - Generative Composition
 * Users define constraints and generate song structures
 */
export default function SandboxMode({
  onGenerate,
  generatedBlocks,
  onUpdateBlock,
  setGlobalBlocks,
  onSwitchToGrid,
}) {
  const [constraints, setConstraints] = useState({
    genre: 'pop',
    form: 'verse-chorus',
    key: 'C',
    mode: 'major',
    tempo: 120,
    harmonicComplexity: 50,
    rhythmicDensity: 50,
    sections: 4,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [progressionInput, setProgressionInput] = useState('');
  const [lyricDraft, setLyricDraft] = useState('');

  // Keep selected block in sync with latest generated data
  useEffect(() => {
    if (!selectedBlock || !generatedBlocks) return;
    const latest = generatedBlocks.find((b) => b.id === selectedBlock.id);
    if (latest && latest !== selectedBlock) {
      setSelectedBlock(latest);
      setProgressionInput(blockProgressionToString(latest));
    }
  }, [generatedBlocks, selectedBlock?.id]);

  const genres = ['pop', 'jazz', 'jazz_traditional', 'neo_soul', 'rock', 'folk', 'electronic'];
  const forms = [
    { value: 'verse-chorus', label: 'Verse-Chorus' },
    { value: 'aaba', label: 'AABA (Jazz Standard)' },
    { value: 'through-composed', label: 'Through-Composed' },
    { value: 'strophic', label: 'Strophic (Verse Only)' },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      if (onGenerate) {
        await onGenerate(constraints);
      }
    } catch (error) {
      console.error('Error generating structure:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConstraintChange = (key, value) => {
    setConstraints((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleBlockUpdate = (blockId, updates) => {
    if (onUpdateBlock) {
      onUpdateBlock(blockId, updates);
    }
    if (typeof setGlobalBlocks === 'function') {
      const updatedBlocks = (generatedBlocks || []).map((block) => {
        if (!block) return block;
        return block.id === blockId ? { ...block, ...updates } : block;
      });
      setGlobalBlocks(updatedBlocks);
    }
    if (selectedBlock && selectedBlock.id === blockId) {
      setSelectedBlock((prev) => ({ ...prev, ...updates }));
    }
  };

  const handleProgressionChange = (value) => {
    setProgressionInput(value);
    const parsed = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const progression = parsed.map((roman, idx) => ({
      chord: {
        root: roman,
        quality: 'unknown',
      },
      duration_beats: 4,
      position_in_bar: 1,
      probability_score: 0.7,
      functional_analysis: {
        roman_numeral: roman,
        function: 'ambiguous',
        cadence_point: idx === parsed.length - 1 ? 'authentic' : 'none',
      },
    }));

    handleBlockUpdate(selectedBlock.id, {
      harmonic_dna: {
        ...(selectedBlock?.harmonic_dna || {}),
        progression,
      },
    });
  };

  useEffect(() => {
    if (selectedBlock) {
      setProgressionInput(blockProgressionToString(selectedBlock));
      setLyricDraft(extractLyricText(selectedBlock));
    } else {
      setLyricDraft('');
    }
  }, [selectedBlock]);

  const appendSuggestedProgression = (romans) => {
    if (!selectedBlock) return;
    const addition = romans.join(', ');
    const nextValue = progressionInput?.trim()
      ? `${progressionInput.trim()}, ${addition}`
      : addition;
    handleProgressionChange(nextValue);
  };

  const handleLyricChange = (value) => {
    setLyricDraft(value);
    if (!selectedBlock) return;

    const lines = draftTextToLyricLines(value);
    handleBlockUpdate(selectedBlock.id, {
      lyric_text: value,
      lyrics: lines,
    });
  };

  return (
    <div className="flex gap-4 p-4 h-screen">
      {/* Left: Constraint Panel */}
      <aside className="w-72 overflow-y-auto border border-border rounded-lg p-5">
        <h2 className="mt-0 mb-5 text-xl font-semibold text-foreground">Blank Canvas</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Define constraints and generate a song structure from scratch.
        </p>

        <div className="flex flex-col gap-5">
          {/* Genre Selection */}
          <div>
            <label className="block mb-2 font-medium text-foreground">Genre</label>
            <select
              value={constraints.genre}
              onChange={(e) => handleConstraintChange('genre', e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            >
              {genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre.charAt(0).toUpperCase() + genre.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Form Selection */}
          <div>
            <label className="block mb-2 font-medium text-foreground">Song Form</label>
            <select
              value={constraints.form}
              onChange={(e) => handleConstraintChange('form', e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            >
              {forms.map((form) => (
                <option key={form.value} value={form.value}>
                  {form.label}
                </option>
              ))}
            </select>
          </div>

          {/* Key Selection */}
          <div>
            <label className="block mb-2 font-medium text-foreground">Key</label>
            <div className="flex gap-2">
              <select
                value={constraints.key}
                onChange={(e) => handleConstraintChange('key', e.target.value)}
                className="flex-1 px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              >
                {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
              <select
                value={constraints.mode}
                onChange={(e) => handleConstraintChange('mode', e.target.value)}
                className="flex-1 px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              >
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="dorian">Dorian</option>
                <option value="mixolydian">Mixolydian</option>
                <option value="lydian">Lydian</option>
              </select>
            </div>
          </div>

          {/* Tempo */}
          <div>
            <label className="block mb-2 font-medium text-foreground">
              Tempo: {constraints.tempo} BPM
            </label>
            <input
              type="range"
              min="60"
              max="180"
              value={constraints.tempo}
              onChange={(e) => handleConstraintChange('tempo', Number.parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>

          {/* Harmonic Complexity */}
          <div>
            <label className="block mb-2 font-medium text-foreground">
              Harmonic Complexity: {constraints.harmonicComplexity}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={constraints.harmonicComplexity}
              onChange={(e) =>
                handleConstraintChange('harmonicComplexity', Number.parseInt(e.target.value, 10))
              }
              className="w-full"
            />
            <div className="text-xs text-muted-foreground mt-1">
              {constraints.harmonicComplexity < 30 && 'Simple (triads)'}
              {constraints.harmonicComplexity >= 30 &&
                constraints.harmonicComplexity < 70 &&
                'Moderate (7ths, 9ths)'}
              {constraints.harmonicComplexity >= 70 && 'Complex (11ths, 13ths, altered)'}
            </div>
          </div>

          {/* Rhythmic Density */}
          <div>
            <label className="block mb-2 font-medium text-foreground">
              Rhythmic Density: {constraints.rhythmicDensity}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={constraints.rhythmicDensity}
              onChange={(e) =>
                handleConstraintChange('rhythmicDensity', Number.parseInt(e.target.value, 10))
              }
              className="w-full"
            />
            <div className="text-xs text-muted-foreground mt-1">
              {constraints.rhythmicDensity < 30 && 'Sparse'}
              {constraints.rhythmicDensity >= 30 && constraints.rhythmicDensity < 70 && 'Moderate'}
              {constraints.rhythmicDensity >= 70 && 'Dense'}
            </div>
          </div>

          {/* Number of Sections */}
          <div>
            <label className="block mb-2 font-medium text-foreground">
              Sections: {constraints.sections}
            </label>
            <input
              type="range"
              min="2"
              max="12"
              value={constraints.sections}
              onChange={(e) =>
                handleConstraintChange('sections', Number.parseInt(e.target.value, 10))
              }
              className="w-full"
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-3 px-4 rounded-md font-semibold text-base cursor-pointer mt-2.5 ${
              isGenerating
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {isGenerating ? 'Generating...' : 'Generate Structure'}
          </button>
        </div>
        <MusicTheoryToolkit
          keyCenter={constraints.key}
          mode={constraints.mode}
          onAppendProgression={appendSuggestedProgression}
        />
      </aside>

      {/* Center: Generated Structure */}
      <main className="flex-1 overflow-y-auto border border-border rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="m-0 text-lg font-semibold text-foreground">Generated Structure</h3>
          {generatedBlocks && generatedBlocks.length > 0 && onSwitchToGrid && (
            <button
              onClick={onSwitchToGrid}
              className="px-4 py-2 border border-border rounded cursor-pointer bg-purple-600 text-white font-medium text-sm hover:bg-purple-700"
            >
              View in Grid
            </button>
          )}
        </div>

        {generatedBlocks && generatedBlocks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {generatedBlocks.map((block, idx) => (
              <div
                key={block.id || idx}
                onClick={() => setSelectedBlock(block)}
                className={`border rounded cursor-pointer p-2 ${
                  selectedBlock?.id === block.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 bg-white'
                }`}
              >
                <ArrangementBlock block={block} onClick={() => {}} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-96 text-muted-foreground text-center">
            <div>
              <div className="text-6xl mb-4">♪</div>
              <div className="text-lg">No structure generated yet</div>
              <div className="text-sm mt-2">
                Configure constraints and click "Generate Structure"
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Right: Probability Dashboard / Sculpting Panel */}
      {selectedBlock && (
        <aside className="w-80 overflow-y-auto border border-border rounded-lg p-5 flex flex-col gap-4 bg-card">
          <div className="flex justify-between items-center">
            <h4 className="m-0 text-lg font-semibold text-foreground">Sculpt Section</h4>
            <button
              onClick={() => setSelectedBlock(null)}
              className="px-2 py-1 border border-border rounded cursor-pointer text-sm hover:bg-accent"
            >
              Close
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block mb-1.5 font-medium text-foreground">Section Label</label>
              <input
                type="text"
                value={selectedBlock.label || selectedBlock.section_label || ''}
                onChange={(event) =>
                  handleBlockUpdate(selectedBlock.id, {
                    label: event.target.value,
                    name: event.target.value,
                    section_label: event.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block mb-1.5 font-medium text-foreground">Variant</label>
              <input
                type="number"
                min="1"
                value={selectedBlock.section_variant || 1}
                onChange={(event) =>
                  handleBlockUpdate(selectedBlock.id, {
                    section_variant: Number.parseInt(event.target.value, 10) || 1,
                  })
                }
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block mb-1.5 font-medium text-foreground">Length (bars)</label>
              <input
                type="number"
                min="1"
                value={selectedBlock.bars || selectedBlock.length || 4}
                onChange={(event) => {
                  const nextValue = Number.parseInt(event.target.value, 10) || 4;
                  handleBlockUpdate(selectedBlock.id, {
                    bars: nextValue,
                    length: nextValue,
                  });
                }}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block mb-1.5 font-medium text-foreground">
                Chord Progression (comma separated)
              </label>
              <textarea
                value={progressionInput}
                onChange={(event) => handleProgressionChange(event.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <LyricDraftPanel
            label={`Lyric Sketch · ${selectedBlock.label || selectedBlock.section_label || 'Section'}`}
            text={lyricDraft}
            onChange={handleLyricChange}
          />

          <SectionSculptor
            section={selectedBlock}
            fileHash={globalThis.__lastAnalysisHash || globalThis.__currentFileHash || null}
            onUpdate={(update) => {
              handleBlockUpdate(selectedBlock.id, update);
            }}
          />
        </aside>
      )}
    </div>
  );
}

function blockProgressionToString(block) {
  const chords = block?.harmonic_dna?.progression || [];
  if (!chords.length) return '';
  return chords
    .map((entry) => entry.functional_analysis?.roman_numeral || entry.chord?.root || 'I')
    .join(', ');
}

function extractLyricText(block) {
  if (!block) return '';
  if (typeof block.lyric_text === 'string') {
    return block.lyric_text;
  }
  const existing = block.lyrics || [];
  if (!existing.length) return '';
  return existing.map((line) => line.text).join('\n');
}
