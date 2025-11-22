import React from 'react';

/**
 * Level A: Arrangement Map (Macro)
 * Enhanced block component displaying section analysis results
 */
export default function ArrangementBlock({ block = {}, className = '', onClick }) {
  const {
    name = 'Untitled',
    length = 4,
    color = 'bg-blue-400',
    section_label,
    section_variant,
    harmonic_dna,
    rhythmic_dna,
    probability_score,
  } = block;

  const widthPct = Math.min(100, (Number(length) || 0) * 5);

  // Get section color based on type
  const getSectionColor = (label) => {
    const colors = {
      intro: 'bg-purple-400',
      verse: 'bg-blue-400',
      chorus: 'bg-green-400',
      bridge: 'bg-yellow-400',
      outro: 'bg-gray-400',
    };
    return colors[label?.toLowerCase()] || 'bg-blue-400';
  };

  const sectionColor = getSectionColor(section_label);

  // Extract progression preview
  const progressionPreview =
    harmonic_dna?.progression
      ?.slice(0, 4)
      .map((chord) => chord.functional_analysis?.roman_numeral || chord.chord?.root || '?')
      .join('-') || '';

  // Extract key and mode
  const keyCenter = harmonic_dna?.key_center || '';
  const mode = harmonic_dna?.mode || '';
  const keyDisplay = keyCenter ? `${keyCenter} ${mode}` : '';

  // Time signature
  const timeSig = rhythmic_dna?.time_signature
    ? `${rhythmic_dna.time_signature.numerator}/${rhythmic_dna.time_signature.denominator}`
    : '4/4';

  return (
    <div
      className={`p-3 rounded-md border border-border bg-card text-card-foreground shadow-sm cursor-pointer hover:shadow-md transition-shadow ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-foreground">
            {section_label
              ? `${section_label.charAt(0).toUpperCase() + section_label.slice(1)} ${section_variant || ''}`.trim()
              : name}
          </div>
          {progressionPreview && (
            <div className="text-xs text-muted-foreground mt-1">{progressionPreview}</div>
          )}
        </div>
        <div className="text-xs text-muted-foreground text-right">
          <div>{length} bars</div>
          {keyDisplay && <div>{keyDisplay}</div>}
          <div>{timeSig}</div>
        </div>
      </div>

      <div className="mt-2 h-2 bg-muted rounded overflow-hidden">
        <div
          className={`h-full ${sectionColor || color}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>

      {probability_score !== undefined && (
        <div className="mt-1 text-xs text-muted-foreground">
          Confidence: {Math.round(probability_score * 100)}%
        </div>
      )}
    </div>
  );
}
