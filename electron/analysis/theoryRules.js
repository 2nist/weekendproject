/**
 * Theory Rules Engine
 * Implements the 7 correction rules from schema pseudocode
 */

const Tonal = require('tonal');
const { getGenreProfile } = require('./genreProfiles');

/**
 * RULE 1: Bass Note Disambiguation
 * Resolve bass note octave errors and slash chord ambiguities
 */
function applyBassDisambiguation(rawChord, keyContext, correctionContext) {
  const bass = rawChord.bass_note;
  const chordTones = rawChord.chord_tones || [];

  // Check if bass is also a chord tone
  if (chordTones.includes(bass)) {
    // Simple inversion
    return {
      ...rawChord,
      voicing: {
        ...rawChord.voicing,
        type: determineInversionType(bass, rawChord.root),
        bass_note: bass,
      },
    };
  }

  // Potential slash chord - is bass a scale degree?
  if (isScaleDegree(bass, keyContext)) {
    // Check function: Is this a passing tone context?
    if (isPassingBassContext(rawChord, keyContext)) {
      correctionContext.justification.push({
        rule: 'bass_note_disambiguation',
        reasoning: `Bass ${bass} is passing tone under ${rawChord.root} chord`,
      });
      return {
        ...rawChord,
        slash_bass: bass,
      };
    }
  } else {
    // Bass is non-diatonic - likely octave error
    const correctedBass = findNearestChordTone(bass, chordTones);
    correctionContext.justification.push({
      rule: 'bass_note_disambiguation',
      reasoning: `Bass ${bass} corrected to ${correctedBass} (octave error)`,
    });
    return {
      ...rawChord,
      bass_note: correctedBass,
    };
  }

  return rawChord;
}

/**
 * RULE 2: Functional Harmony Correction
 * Predict expected function based on position and section
 */
function getExpectedFunction(position, sectionType, keyContext) {
  if (sectionType === 'chorus') {
    if (position % 4 === 3) {
      // 4th beat of phrase
      return 'DOMINANT';
    } else if (position % 4 === 2) {
      return 'PREDOMINANT';
    } else {
      return 'TONIC';
    }
  } else if (sectionType === 'verse') {
    // Verses often have weaker functional pull
    return 'AMBIGUOUS';
  } else if (sectionType === 'bridge') {
    return 'CHROMATIC'; // Expect borrowed/modal chords
  }

  return 'AMBIGUOUS';
}

/**
 * RULE 3: Cadence Detection & Enforcement
 */
function detectCadenceContext(chords, keyContext) {
  if (chords.length < 2) return 'NONE';

  const lastChord = chords[chords.length - 1];
  const secondLastChord = chords[chords.length - 2];

  // Check for V -> I (authentic cadence)
  if (
    isDominantChord(secondLastChord, keyContext) &&
    isTonicChord(lastChord, keyContext)
  ) {
    return 'AUTHENTIC_EXPECTED';
  }

  // Check for IV -> I (plagal cadence)
  if (
    isPredominantChord(secondLastChord, keyContext) &&
    isTonicChord(lastChord, keyContext)
  ) {
    return 'PLAGAL_EXPECTED';
  }

  return 'NONE';
}

/**
 * RULE 4: Voice Leading Optimization
 * Calculate voice leading cost between chords
 */
function calculateVoiceLeading(prevChord, nextChord) {
  const prevTones = (prevChord.chord_tones || []).map((note) =>
    Tonal.Note.midi(note),
  );
  const nextTones = (nextChord.chord_tones || []).map((note) =>
    Tonal.Note.midi(note),
  );

  if (prevTones.length === 0 || nextTones.length === 0) return 1000;

  // Simple greedy assignment (Hungarian algorithm would be better)
  let cost = 0;
  const used = new Set();

  for (const prevTone of prevTones) {
    let minCost = Infinity;
    let bestMatch = null;

    for (const nextTone of nextTones) {
      if (used.has(nextTone)) continue;

      const interval = Math.abs(nextTone - prevTone);
      let intervalCost = interval;

      // Penalize large leaps
      if (interval <= 2) {
        intervalCost = interval * 1.0; // Step-wise motion
      } else if (interval <= 4) {
        intervalCost = interval * 1.5; // Small leap
      } else if (interval <= 7) {
        intervalCost = interval * 2.5; // Medium leap
      } else {
        intervalCost = interval * 4.0; // Large leap
      }

      if (intervalCost < minCost) {
        minCost = intervalCost;
        bestMatch = nextTone;
      }
    }

    if (bestMatch !== null) {
      cost += minCost;
      used.add(bestMatch);
    }
  }

  return cost;
}

/**
 * RULE 5: Harmonic Rhythm Consistency
 */
function getSectionHarmonicRhythm(sectionType, genreProfile) {
  const defaults = {
    verse: { min_duration: 2.0 }, // 2 beats minimum
    chorus: { min_duration: 1.0 }, // 1 beat minimum (faster changes)
    bridge: { min_duration: 2.0 },
  };

  return defaults[sectionType] || defaults.verse;
}

/**
 * RULE 6: Modal Interchange vs. Error
 */
function isNonDiatonic(chord, keyContext) {
  const key = Tonal.Key.majorKey(keyContext.primary_key || 'C');
  const scaleNotes = key.scale;

  const root = chord.root;
  return !scaleNotes.includes(root);
}

/**
 * RULE 7: Genre-Specific Extensions
 */
function addExtensionsForGenre(chord, genreProfile, keyContext) {
  const extensions = genreProfile.extension_probability || {};

  // Check if genre requires extensions
  if (extensions.maj7 > 0.5 && chord.quality === 'major' && !chord.extensions) {
    return {
      ...chord,
      quality: 'major7',
    };
  }

  if (extensions.min7 > 0.5 && chord.quality === 'minor' && !chord.extensions) {
    return {
      ...chord,
      quality: 'minor7',
    };
  }

  return chord;
}

// Helper functions

function determineInversionType(bass, root) {
  // Simplified - would need full chord analysis
  if (bass === root) return 'root_position';
  return 'first_inversion';
}

function isScaleDegree(note, keyContext) {
  const key = Tonal.Key.majorKey(keyContext.primary_key || 'C');
  return key.scale.includes(note);
}

function isPassingBassContext(chord, keyContext) {
  // Simplified check
  return true;
}

function findNearestChordTone(bass, chordTones) {
  if (chordTones.length === 0) return bass;

  const bassMidi = Tonal.Note.midi(bass);
  if (bassMidi === null) return chordTones[0];

  let minDist = Infinity;
  let nearest = chordTones[0];

  for (const tone of chordTones) {
    const toneMidi = Tonal.Note.midi(tone);
    if (toneMidi === null) continue;

    const dist = Math.min(
      Math.abs(toneMidi - bassMidi),
      Math.abs(toneMidi - bassMidi + 12),
      Math.abs(toneMidi - bassMidi - 12),
    );

    if (dist < minDist) {
      minDist = dist;
      nearest = tone;
    }
  }

  return nearest;
}

function isDominantChord(chord, keyContext) {
  const key = Tonal.Key.majorKey(keyContext.primary_key || 'C');
  const dominant = key.tonic === 'C' ? 'G' : Tonal.Note.transpose(key.tonic, '5P');
  return chord.root === dominant || chord.quality.includes('dominant');
}

function isTonicChord(chord, keyContext) {
  const key = Tonal.Key.majorKey(keyContext.primary_key || 'C');
  return chord.root === key.tonic;
}

function isPredominantChord(chord, keyContext) {
  const key = Tonal.Key.majorKey(keyContext.primary_key || 'C');
  const subdominant = key.tonic === 'C' ? 'F' : Tonal.Note.transpose(key.tonic, '4P');
  return chord.root === subdominant;
}

module.exports = {
  applyBassDisambiguation,
  getExpectedFunction,
  detectCadenceContext,
  calculateVoiceLeading,
  getSectionHarmonicRhythm,
  isNonDiatonic,
  addExtensionsForGenre,
};

