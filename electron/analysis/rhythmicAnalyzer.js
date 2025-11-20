/**
 * Rhythmic DNA Analyzer
 * Analyzes additive rhythms (Apple/Galloping system) and groove patterns
 */

/**
 * Detect pulse pattern from time signature and audio analysis
 * Returns array of 2s and 3s (e.g., [2, 2, 3] for 7/8)
 */
function detectPulsePattern(timeSignature, audioData) {
  const { numerator, denominator } = timeSignature;

  // For simple time signatures, return uniform pattern
  if (numerator % 2 === 0 && denominator === 4) {
    // Even time signatures like 4/4, 6/4
    const beatsPerBar = numerator;
    return Array(beatsPerBar).fill(2); // Binary subdivision
  }

  // For odd time signatures, detect additive rhythm
  if (numerator === 5) {
    // 5/8 or 5/4 - could be [2, 3] or [3, 2]
    // TODO: Analyze audio to determine which
    return [2, 3]; // Default
  }

  if (numerator === 7) {
    // 7/8 - common patterns: [2, 2, 3], [3, 2, 2], [2, 3, 2]
    // TODO: Analyze audio to determine
    return [2, 2, 3]; // Default Balkan pattern
  }

  if (numerator === 9) {
    // 9/8 - could be [2, 2, 2, 3] or [3, 3, 3]
    return [2, 2, 2, 3];
  }

  if (numerator === 11) {
    // 11/16 or 11/8
    return [2, 2, 2, 2, 3];
  }

  // Default: try to break down into 2s and 3s
  return decomposeIntoPulsePattern(numerator);
}

/**
 * Decompose a number into sum of 2s and 3s
 */
function decomposeIntoPulsePattern(total) {
  const pattern = [];
  let remaining = total;

  // Prefer 3s, then 2s
  while (remaining > 0) {
    if (remaining >= 3) {
      pattern.push(3);
      remaining -= 3;
    } else if (remaining >= 2) {
      pattern.push(2);
      remaining -= 2;
    } else {
      pattern.push(1);
      remaining -= 1;
    }
  }

  return pattern;
}

/**
 * Generate mnemonic syllables from pulse pattern
 * "apple" = 2, "galloping" = 3
 */
function generateMnemonicSyllables(pulsePattern) {
  return pulsePattern
    .map((num) => {
      if (num === 2) return 'apple';
      if (num === 3) return 'galloping';
      return `beat${num}`;
    })
    .join(' ');
}

/**
 * Detect groove type from rhythmic pattern
 */
function detectGrooveType(pulsePattern, accentPattern, tempo) {
  // Son Clave: [3, 3, 2, 2, 2] in 16 microbeats
  if (pulsePattern.join('-') === '3-3-2-2-2') {
    return {
      groove_name: 'Son Clave 3-2',
      characteristic_pattern: [
        { onset: 0, accent: 'primary', duration: 3 },
        { onset: 3, accent: 'primary', duration: 3 },
        { onset: 6, accent: 'secondary', duration: 2 },
        { onset: 8, accent: 'secondary', duration: 2 },
        { onset: 10, accent: 'secondary', duration: 2 },
      ],
      accent_pattern_cultural_origin: 'Cuban',
    };
  }

  // Balkan 7/8: [2, 2, 3]
  if (pulsePattern.join('-') === '2-2-3') {
    return {
      groove_name: 'Rachenitsa',
      characteristic_pattern: [
        { onset: 0, accent: 'primary', duration: 2 },
        { onset: 2, accent: 'secondary', duration: 2 },
        { onset: 4, accent: 'secondary', duration: 3 },
      ],
      accent_pattern_cultural_origin: 'Balkan',
    };
  }

  // Neo-Soul shuffle: ternary subdivision with swing
  if (tempo < 100 && accentPattern?.includes('swung')) {
    return {
      groove_name: 'Neo-Soul Shuffle',
      characteristic_pattern: [],
      accent_pattern_cultural_origin: 'African-American',
    };
  }

  // Default
  return {
    groove_name: 'Standard',
    characteristic_pattern: [],
    accent_pattern_cultural_origin: 'Western',
  };
}

/**
 * Calculate cyclic length from pulse pattern
 */
function calculateCyclicLength(pulsePattern, microbeatsPerMacrobeat) {
  return pulsePattern.reduce((sum, num) => sum + num, 0) * microbeatsPerMacrobeat;
}

/**
 * Analyze rhythmic DNA from audio and time signature
 */
function analyzeRhythmicDNA(timeSignature, audioData, tempo) {
  const pulsePattern = detectPulsePattern(timeSignature, audioData);
  const mnemonicSyllables = generateMnemonicSyllables(pulsePattern);
  const grooveDescriptor = detectGrooveType(pulsePattern, null, tempo);

  const rhythmicDNA = {
    time_signature: timeSignature,
    pulse_pattern: pulsePattern,
    mnemonic_syllables: mnemonicSyllables,
    macrobeat_structure: {
      tempo_bpm: tempo,
      macrobeats_per_bar: timeSignature.numerator,
      macrobeat_feel: 'even', // TODO: Detect from audio
      backbeat_pattern: timeSignature.denominator === 4 ? [2, 4] : [],
    },
    microbeat_base: {
      division_type: timeSignature.denominator === 8 ? 'binary' : 'binary',
      microbeats_per_macrobeat: timeSignature.denominator === 8 ? 2 : 4,
      partition: `P=${pulsePattern.join('+')}`,
      swing_ratio: 1.0, // TODO: Detect from audio
    },
    groove_descriptor: grooveDescriptor,
    cyclic_length: calculateCyclicLength(pulsePattern, timeSignature.denominator === 8 ? 2 : 4),
    onset_positions: [], // TODO: Extract from audio
  };

  return rhythmicDNA;
}

module.exports = {
  detectPulsePattern,
  generateMnemonicSyllables,
  detectGrooveType,
  analyzeRhythmicDNA,
};

