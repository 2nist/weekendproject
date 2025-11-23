import React from 'react';

/**
 * Level B: DNA Inspector (Granular)
 * Displays full schema data for selected section
 */
export default function SectionDetailPanel({ section, onClose }) {
  if (!section) {
    return (
      <div className="p-5 text-muted-foreground">
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
    <div className="p-5 max-h-[80vh] overflow-y-auto text-foreground bg-background">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-foreground">
          {section_label?.charAt(0).toUpperCase() + section_label?.slice(1)} - {section_id}
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1 border border-border rounded-md cursor-pointer bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Close
          </button>
        )}
      </div>

      {/* Harmonic Progression */}
      <div className="mb-8">
        <h3 className="mb-4 pb-1 border-b-2 border-border text-foreground font-semibold">
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
                <div className="text-sm text-muted-foreground">
                  {functional?.roman_numeral}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {functional?.function}
                </div>
                {justification?.correction_applied && (
                  <div className="absolute top-1 right-1 text-[10px] bg-yellow-600 text-white px-1.5 py-0.5 rounded">
                    Corrected
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  {chordItem.duration_beats} beats
                </div>
                <div className="text-xs text-muted-foreground">
                  Confidence: {Math.round(chordItem.probability_score * 100)}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Theory Justifications */}
        {harmonic_dna?.progression?.some((c) => c.theory_justification?.correction_applied) && (
          <div className="mt-5 p-4 bg-muted border border-border rounded-lg">
            <h4 className="mb-3 text-foreground font-semibold">Theory Corrections</h4>
            {harmonic_dna.progression
              .filter((c) => c.theory_justification?.correction_applied)
              .map((chordItem, idx) => (
                <div key={idx} className="mb-3 text-sm text-card-foreground">
                  <strong className="text-foreground">
                    {chordItem.theory_justification.original_chord} →{' '}
                    {chordItem.theory_justification.corrected_chord}
                  </strong>
                  <div className="text-muted-foreground mt-1">
                    {chordItem.theory_justification.reasoning}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Rules: {chordItem.theory_justification.rules_applied.join(', ')}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Rhythmic DNA */}
      <div className="mb-8">
        <h3 className="mb-4 pb-1 border-b-2 border-border text-foreground font-semibold">
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
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', marginTop: '5px' }}>
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
      <div className="mb-5">
        <h3 className="mb-3 pb-1 border-b-2 border-border text-foreground font-semibold">
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
        <div className="mb-5">
          <h3 className="mb-3 pb-1 border-b-2 border-border text-foreground font-semibold">
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
            <div className="mt-4 p-3 bg-muted border border-border rounded-md">
              <div className="font-bold text-foreground">
                Semantic Label: {section.semantic_signature.semantic_label.label}{' '}
                ({Math.round((section.semantic_signature.semantic_label.confidence || 0) * 100)}%)
              </div>
              <div className="text-xs text-muted-foreground mt-1">
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
    <div className="p-3 border border-border rounded-md bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-base mt-1 text-card-foreground">{value ?? '—'}</div>
    </div>
  );
}

