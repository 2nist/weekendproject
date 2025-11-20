import React from 'react';

/**
 * Level B: DNA Inspector (Granular)
 * Displays full schema data for selected section
 */
export default function SectionDetailPanel({ section, onClose }) {
  if (!section) {
    return (
      <div style={{ padding: '20px', color: '#666' }}>
        Select a section to view details
      </div>
    );
  }

  const { harmonic_dna, rhythmic_dna, section_label, section_id } = section;

  // Get functional color for chord
  const getFunctionalColor = (functionType) => {
    const colors = {
      tonic: '#10b981', // Green
      predominant: '#3b82f6', // Blue
      dominant: '#ef4444', // Red
      mediant: '#f59e0b', // Yellow
      submediant: '#8b5cf6', // Purple
    };
    return colors[functionType] || '#6b7280';
  };

  return (
    <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2>
          {section_label?.charAt(0).toUpperCase() + section_label?.slice(1)} - {section_id}
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        )}
      </div>

      {/* Harmonic Progression */}
      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ marginBottom: '15px', borderBottom: '2px solid #e5e7eb', paddingBottom: '5px' }}>
          Harmonic Progression
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          {harmonic_dna?.progression?.map((chordItem, idx) => {
            const chord = chordItem.chord;
            const functional = chordItem.functional_analysis;
            const justification = chordItem.theory_justification;
            const functionalColor = getFunctionalColor(functional?.function);

            return (
              <div
                key={idx}
                style={{
                  padding: '15px',
                  border: `2px solid ${functionalColor}`,
                  borderRadius: '8px',
                  backgroundColor: `${functionalColor}15`,
                  position: 'relative',
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '5px' }}>
                  {chord.root}
                  {chord.quality}
                  {chord.extensions?.length > 0 && `(${chord.extensions.join(',')})`}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {functional?.roman_numeral}
                </div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                  {functional?.function}
                </div>
                {justification?.correction_applied && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '5px',
                      right: '5px',
                      fontSize: '10px',
                      backgroundColor: '#fbbf24',
                      color: 'white',
                      padding: '2px 5px',
                      borderRadius: '3px',
                    }}
                  >
                    Corrected
                  </div>
                )}
                <div style={{ fontSize: '11px', marginTop: '8px', color: '#666' }}>
                  {chordItem.duration_beats} beats
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  Confidence: {Math.round(chordItem.probability_score * 100)}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Theory Justifications */}
        {harmonic_dna?.progression?.some((c) => c.theory_justification?.correction_applied) && (
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
            <h4 style={{ marginBottom: '10px' }}>Theory Corrections</h4>
            {harmonic_dna.progression
              .filter((c) => c.theory_justification?.correction_applied)
              .map((chordItem, idx) => (
                <div key={idx} style={{ marginBottom: '10px', fontSize: '13px' }}>
                  <strong>
                    {chordItem.theory_justification.original_chord} →{' '}
                    {chordItem.theory_justification.corrected_chord}
                  </strong>
                  <div style={{ color: '#666', marginTop: '3px' }}>
                    {chordItem.theory_justification.reasoning}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '3px' }}>
                    Rules: {chordItem.theory_justification.rules_applied.join(', ')}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Rhythmic DNA */}
      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ marginBottom: '15px', borderBottom: '2px solid #e5e7eb', paddingBottom: '5px' }}>
          Rhythmic DNA
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Time Signature:</strong>{' '}
              {rhythmic_dna?.time_signature?.numerator}/{rhythmic_dna?.time_signature?.denominator}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Pulse Pattern:</strong>{' '}
              {rhythmic_dna?.pulse_pattern?.join('-') || '4-4-4-4'}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Mnemonic:</strong>{' '}
              {rhythmic_dna?.mnemonic_syllables || 'standard 4/4'}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Tempo:</strong> {rhythmic_dna?.macrobeat_structure?.tempo_bpm || 120} BPM
            </div>
          </div>
          <div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Groove:</strong>{' '}
              {rhythmic_dna?.groove_descriptor?.groove_name || 'Standard'}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Feel:</strong>{' '}
              {rhythmic_dna?.macrobeat_structure?.macrobeat_feel || 'even'}
            </div>
            {rhythmic_dna?.pulse_pattern && (
              <div style={{ marginTop: '15px' }}>
                <strong>Visual Pattern:</strong>
                <div style={{ fontFamily: 'monospace', fontSize: '18px', marginTop: '5px' }}>
                  {rhythmic_dna.pulse_pattern.map((num, idx) => (
                    <span key={idx} style={{ marginRight: '5px' }}>
                      {Array(num).fill('•').join('')}
                      {idx < rhythmic_dna.pulse_pattern.length - 1 && ' '}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Key and Mode */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ marginBottom: '10px', borderBottom: '2px solid #e5e7eb', paddingBottom: '5px' }}>
          Harmonic Context
        </h3>
        <div>
          <strong>Key Center:</strong> {harmonic_dna?.key_center || 'Unknown'}
        </div>
        <div>
          <strong>Mode:</strong> {harmonic_dna?.mode || 'ionian'}
        </div>
        <div>
          <strong>Harmonic Rhythm:</strong> {harmonic_dna?.harmonic_rhythm || 'Unknown'}
        </div>
        {harmonic_dna?.characteristic_moves?.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <strong>Characteristic Moves:</strong>
            <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
              {harmonic_dna.characteristic_moves.map((move, idx) => (
                <li key={idx}>{move}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {section.semantic_signature && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '10px', borderBottom: '2px solid #e5e7eb', paddingBottom: '5px' }}>
            Semantic Signature
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
            <SignatureStat label="Repetition Score" value={section.semantic_signature.repetition_score?.toFixed(2)} />
            <SignatureStat label="Avg RMS" value={section.semantic_signature.avg_rms?.toFixed(3)} />
            <SignatureStat label="Vocal Ratio" value={`${Math.round((section.semantic_signature.vocal_ratio || 0) * 100)}%`} />
            <SignatureStat label="Harmonic Stability" value={section.semantic_signature.harmonic_stability?.toFixed(2)} />
            <SignatureStat label="Position" value={`${Math.round((section.semantic_signature.position_ratio || 0) * 100)}%`} />
            <SignatureStat label="Duration" value={`${section.semantic_signature.duration_seconds?.toFixed(1) || 0}s`} />
          </div>
          {section.semantic_signature.semantic_label && (
            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f3f4f6', borderRadius: '6px' }}>
              <div style={{ fontWeight: 'bold' }}>
                Semantic Label: {section.semantic_signature.semantic_label.label}{' '}
                ({Math.round((section.semantic_signature.semantic_label.confidence || 0) * 100)}%)
              </div>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                {section.semantic_signature.semantic_label.reason}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SignatureStat({ label, value }) {
  return (
    <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
      <div style={{ fontWeight: 'bold', fontSize: '16px', marginTop: '4px' }}>{value ?? '—'}</div>
    </div>
  );
}

