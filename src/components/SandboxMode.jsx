import React, { useState, useEffect } from 'react';
import ArrangementBlock from './ArrangementBlock';
import SectionSculptor from './SectionSculptor';

/**
 * Blank Sandbox Mode - Generative Composition
 * Users define constraints and generate song structures
 */
export default function SandboxMode({
  onGenerate,
  generatedBlocks,
  onUpdateBlock,
  setGlobalBlocks,
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
    }
  }, [selectedBlock]);

  return (
    <div style={{ display: 'flex', gap: 16, padding: 16, height: '100vh' }}>
      {/* Left: Constraint Panel */}
      <aside style={{ width: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Blank Canvas</h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
          Define constraints and generate a song structure from scratch.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Genre Selection */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Genre
            </label>
            <select
              value={constraints.genre}
              onChange={(e) => handleConstraintChange('genre', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
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
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Song Form
            </label>
            <select
              value={constraints.form}
              onChange={(e) => handleConstraintChange('form', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
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
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Key
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={constraints.key}
                onChange={(e) => handleConstraintChange('key', e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
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
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
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
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Tempo: {constraints.tempo} BPM
            </label>
            <input
              type="range"
              min="60"
              max="180"
              value={constraints.tempo}
              onChange={(e) => handleConstraintChange('tempo', parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Harmonic Complexity */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Harmonic Complexity: {constraints.harmonicComplexity}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={constraints.harmonicComplexity}
              onChange={(e) => handleConstraintChange('harmonicComplexity', parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {constraints.harmonicComplexity < 30 && 'Simple (triads)'}
              {constraints.harmonicComplexity >= 30 && constraints.harmonicComplexity < 70 && 'Moderate (7ths, 9ths)'}
              {constraints.harmonicComplexity >= 70 && 'Complex (11ths, 13ths, altered)'}
            </div>
          </div>

          {/* Rhythmic Density */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Rhythmic Density: {constraints.rhythmicDensity}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={constraints.rhythmicDensity}
              onChange={(e) => handleConstraintChange('rhythmicDensity', parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {constraints.rhythmicDensity < 30 && 'Sparse'}
              {constraints.rhythmicDensity >= 30 && constraints.rhythmicDensity < 70 && 'Moderate'}
              {constraints.rhythmicDensity >= 70 && 'Dense'}
            </div>
          </div>

          {/* Number of Sections */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
              Sections: {constraints.sections}
            </label>
            <input
              type="range"
              min="2"
              max="12"
              value={constraints.sections}
              onChange={(e) => handleConstraintChange('sections', parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: isGenerating ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              marginTop: '10px',
            }}
          >
            {isGenerating ? 'Generating...' : 'Generate Structure'}
          </button>
        </div>
      </aside>

      {/* Center: Generated Structure */}
      <main style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ marginTop: 0 }}>Generated Structure</h3>
        
        {generatedBlocks && generatedBlocks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {generatedBlocks.map((block, idx) => (
              <div
                key={block.id || idx}
                onClick={() => setSelectedBlock(block)}
                style={{
                  border: selectedBlock?.id === block.id ? '2px solid #2563eb' : '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: '8px',
                  backgroundColor: selectedBlock?.id === block.id ? '#eff6ff' : 'white',
                }}
              >
                <ArrangementBlock block={block} onClick={() => {}} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '400px',
            color: '#9ca3af',
            fontSize: '18px',
            textAlign: 'center',
          }}>
            <div>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎵</div>
              <div>No structure generated yet</div>
              <div style={{ fontSize: '14px', marginTop: '8px' }}>
                Configure constraints and click "Generate Structure"
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Right: Probability Dashboard / Sculpting Panel */}
      {selectedBlock && (
        <aside
          style={{
            width: '320px',
            overflowY: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h4 style={{ margin: 0 }}>Sculpt Section</h4>
            <button
              onClick={() => setSelectedBlock(null)}
              style={{
                padding: '4px 8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Close
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: "500" }}>
                Section Label
              </label>
              <input
                type="text"
                value={selectedBlock.label || selectedBlock.section_label || ""}
                onChange={(event) =>
                  handleBlockUpdate(selectedBlock.id, {
                    label: event.target.value,
                    name: event.target.value,
                    section_label: event.target.value,
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: "500" }}>
                Variant
              </label>
              <input
                type="number"
                min="1"
                value={selectedBlock.section_variant || 1}
                onChange={(event) =>
                  handleBlockUpdate(selectedBlock.id, {
                    section_variant: parseInt(event.target.value, 10) || 1,
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: "500" }}>
                Length (bars)
              </label>
              <input
                type="number"
                min="1"
                value={selectedBlock.bars || selectedBlock.length || 4}
                onChange={(event) => {
                  const nextValue = parseInt(event.target.value, 10) || 4;
                  handleBlockUpdate(selectedBlock.id, {
                    bars: nextValue,
                    length: nextValue,
                  });
                }}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: "500" }}>
                Chord Progression (comma separated)
              </label>
              <textarea
                value={progressionInput}
                onChange={(event) => handleProgressionChange(event.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontFamily: "monospace",
                }}
              />
            </div>
          </div>

          <SectionSculptor
            section={selectedBlock}
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

