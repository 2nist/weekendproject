import React, { useState, useEffect } from 'react';

/**
 * Section Sculptor panel (formerly ProbabilityDashboard sliders)
 * Allows fine-grained adjustments to a selected section
 */
export default function SectionSculptor({ section, onUpdate }) {
  const [harmonicComplexity, setHarmonicComplexity] = useState(50);
  const [rhythmicDensity, setRhythmicDensity] = useState(50);
  const [grooveSwing, setGrooveSwing] = useState(0);
  const [tension, setTension] = useState(50);

  useEffect(() => {
    if (section) {
      // Could hydrate sliders from section metadata in future
    }
  }, [section]);

  const emit = (payload) => {
    if (onUpdate) {
      onUpdate(payload);
    }
  };

  const handleRangeChange = (setter, descriptor) => (event) => {
    const value = parseInt(event.target.value, 10);
    setter(value);
    emit(descriptor(value));
  };

  if (!section) {
    return (
      <div style={{ padding: '20px', color: '#666' }}>
        Select a section to edit with sliders
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '20px' }}>Section Sculptor</h2>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
        Adjust parameters to modify the section. Changes apply in real-time.
      </p>

      <SliderBlock
        label={`Harmonic Complexity: ${harmonicComplexity}%`}
        value={harmonicComplexity}
        onChange={handleRangeChange(setHarmonicComplexity, (value) => ({
          type: 'harmonic_complexity',
          value,
          description: getHarmonicComplexityDescription(value),
        }))}
        description={getHarmonicComplexityDescription(harmonicComplexity)}
      />

      <SliderBlock
        label={`Rhythmic Density: ${rhythmicDensity}%`}
        value={rhythmicDensity}
        onChange={handleRangeChange(setRhythmicDensity, (value) => ({
          type: 'rhythmic_density',
          value,
          description: getRhythmicDensityDescription(value),
        }))}
        description={getRhythmicDensityDescription(rhythmicDensity)}
      />

      <SliderBlock
        label={`Groove / Swing: ${grooveSwing}%`}
        value={grooveSwing}
        onChange={handleRangeChange(setGrooveSwing, (value) => ({
          type: 'groove_swing',
          value,
          description: getGrooveSwingDescription(value),
        }))}
        description={getGrooveSwingDescription(grooveSwing)}
      />

      {section.section_label === 'bridge' && (
        <SliderBlock
          label={`Tension: ${tension}%`}
          value={tension}
          onChange={handleRangeChange(setTension, (value) => ({
            type: 'tension',
            value,
            description: getTensionDescription(value),
          }))}
          description={getTensionDescription(tension)}
          helper="At max: swaps diatonic chords for tritone substitutions and diminished passing chords."
        />
      )}

      <div
        style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#f3f4f6',
          borderRadius: '8px',
        }}
      >
        <div style={{ fontSize: '12px', color: '#666' }}>
          <strong>Note:</strong> These sliders modify the section based on genre profiles and theory
          rules. Changes are applied instantly to the harmonic and rhythmic DNA.
        </div>
      </div>
    </div>
  );
}

function SliderBlock({ label, value, onChange, description, helper }) {
  return (
    <div style={{ marginBottom: '30px' }}>
      <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>{label}</label>
      <input type="range" min="0" max="100" value={value} onChange={onChange} style={{ width: '100%' }} />
      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>{description}</div>
      {helper && (
        <div style={{ fontSize: '11px', color: '#999', marginTop: '5px' }}>
          {helper}
        </div>
      )}
    </div>
  );
}

function getHarmonicComplexityDescription(value) {
  if (value === 0) return 'Triads only (C Major)';
  if (value <= 30) return 'Basic 7ths (C Maj7)';
  if (value <= 60) return 'Extended (C Maj9)';
  if (value <= 85) return 'Complex (C Maj13)';
  return 'Neo-Soul Extensions (C Maj13(#11))';
}

function getRhythmicDensityDescription(value) {
  if (value <= 25) return 'Sparse (quarter notes)';
  if (value <= 50) return 'Moderate (eighth notes)';
  if (value <= 75) return 'Dense (sixteenth notes)';
  return 'Very dense (syncopated)';
}

function getGrooveSwingDescription(value) {
  if (value === 0) return 'Straight (1.0:1)';
  if (value <= 33) return 'Light swing (1.2:1)';
  if (value <= 66) return 'Triplet swing (1.5:1)';
  if (value <= 85) return 'Heavy swing (1.7:1)';
  return 'Extreme swing / Quintuplet (2.0:1)';
}

function getTensionDescription(value) {
  if (value <= 30) return 'Diatonic only';
  if (value <= 60) return 'Some chromaticism';
  if (value <= 85) return 'Tritone substitutions';
  return 'Diminished passing chords, altered dominants';
}

