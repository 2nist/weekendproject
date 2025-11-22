import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Section Sculptor panel (formerly ProbabilityDashboard sliders)
 * Allows fine-grained adjustments to a selected section
 */
export default function SectionSculptor({ section, onUpdate, fileHash }) {
  const [harmonicComplexity, setHarmonicComplexity] = useState(50);
  const [rhythmicDensity, setRhythmicDensity] = useState(50);
  const [grooveSwing, setGrooveSwing] = useState(0);
  const [tension, setTension] = useState(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const debounceTimerRef = useRef(null);
  const currentParamsRef = useRef({});

  useEffect(() => {
    if (section) {
      // Hydrate sliders from section metadata if available
      const harmonicDNA = section.harmonic_dna || {};
      const rhythmicDNA = section.rhythmic_dna || {};
      
      if (harmonicDNA.complexity !== undefined) {
        setHarmonicComplexity(harmonicDNA.complexity);
      }
      if (rhythmicDNA.density !== undefined) {
        setRhythmicDensity(rhythmicDNA.density);
      }
      if (rhythmicDNA.groove_swing !== undefined) {
        setGrooveSwing(rhythmicDNA.groove_swing);
      }
      if (harmonicDNA.tension !== undefined) {
        setTension(harmonicDNA.tension);
      }
    }
  }, [section]);

  // Apply sculpting parameters in real-time
  const applySculpting = useCallback(async (params, commit = false) => {
    if (!section || !fileHash) return;
    
    // Get current fileHash if not provided
    const hash = fileHash || 
                 window.__lastAnalysisHash || 
                 globalThis.__currentFileHash || 
                 null;
    
    if (!hash) {
      console.warn('[SectionSculptor] No fileHash available');
      return;
    }

    setIsProcessing(true);
    try {
      // Merge with previous parameters
      const mergedParams = { ...currentParamsRef.current, ...params };
      currentParamsRef.current = mergedParams;

      if (window.electronAPI && window.electronAPI.invoke) {
        const result = await window.electronAPI.invoke('ANALYSIS:SCULPT_SECTION', {
          fileHash: hash,
          sectionId: section.id || section.section_id,
          parameters: mergedParams,
          commit,
        });

        if (result?.success) {
          console.log('[SectionSculptor] Parameters applied successfully');
          if (onUpdate) {
            onUpdate({ ...params, applied: true });
          }
        } else {
          console.error('[SectionSculptor] Failed to apply:', result?.error);
        }
      } else {
        // Fallback: just call onUpdate
        if (onUpdate) {
          onUpdate(params);
        }
      }
    } catch (err) {
      console.error('[SectionSculptor] Error applying parameters:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [section, fileHash, onUpdate]);

  // Debounced real-time updates
  const handleRangeChange = (setter, descriptor) => (event) => {
    const value = parseInt(event.target.value, 10);
    setter(value);
    
    const paramUpdate = descriptor(value);
    
    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Debounce: apply after 300ms of no changes
    debounceTimerRef.current = setTimeout(() => {
      applySculpting(paramUpdate, false); // Preview mode
    }, 300);
    
    // Also call original onUpdate for immediate UI feedback
    if (onUpdate) {
      onUpdate(paramUpdate);
    }
  };

  const handleCommit = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    applySculpting(currentParamsRef.current, true); // Commit mode
  }, [applySculpting]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

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
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
          <strong>Note:</strong> These sliders modify the section based on genre profiles and theory
          rules. Changes are applied in real-time (preview mode).
        </div>
        <button
          onClick={handleCommit}
          disabled={isProcessing}
          style={{
            padding: '8px 16px',
            backgroundColor: isProcessing ? '#ccc' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            width: '100%',
          }}
        >
          {isProcessing ? 'Applying...' : 'Commit Changes'}
        </button>
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
