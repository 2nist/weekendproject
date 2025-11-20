/**
 * Structure Generator for Blank Sandbox Mode
 * Generates chord progressions and song structures based on constraints
 */

const { getGenreProfile } = require('./genreProfiles');
const Tonal = require('tonal');

/**
 * Generate a song structure from constraints
 * @param {Object} constraints - User-defined constraints
 * @returns {Object} Generated structural map
 */
function generateStructure(constraints) {
  const {
    genre = 'pop',
    form = 'verse-chorus',
    key = 'C',
    mode = 'major',
    tempo = 120,
    harmonicComplexity = 50,
    rhythmicDensity = 50,
    sections = 4,
  } = constraints;

  const genreProfile = getGenreProfile(genre);
  const keyContext = {
    primary_key: key,
    mode: mode === 'major' ? 'ionian' : mode === 'minor' ? 'aeolian' : mode,
  };

  // Generate sections based on form
  const sectionLabels = generateForm(form, sections);
  
  const generatedSections = sectionLabels.map((label, idx) => {
    const progression = generateProgression(
      label,
      genreProfile,
      keyContext,
      harmonicComplexity,
    );

    const rhythmicDna = generateRhythmicDNA(
      label,
      genreProfile,
      rhythmicDensity,
      tempo,
    );

    return {
      section_id: `generated-${label}-${idx + 1}`,
      section_label: label,
      section_variant: idx + 1,
      time_range: {
        start_time: idx * 16, // 16 bars per section (approx)
        end_time: (idx + 1) * 16,
        duration_bars: 16,
      },
      harmonic_dna: {
        progression: progression,
        key_center: key,
        mode: mode,
        harmonic_rhythm: getHarmonicRhythm(label, genreProfile),
        characteristic_moves: genreProfile.characteristic_moves || [],
      },
      rhythmic_dna: rhythmicDna,
      probability_score: 0.8, // Generated structures have high confidence
    };
  });

  return {
    sections: generatedSections,
  };
}

/**
 * Generate section labels based on form
 */
function generateForm(form, numSections) {
  const forms = {
    'verse-chorus': () => {
      const labels = [];
      for (let i = 0; i < numSections; i++) {
        if (i === 0) labels.push('intro');
        else if (i % 2 === 1) labels.push('verse');
        else labels.push('chorus');
      }
      return labels;
    },
    'aaba': () => {
      const labels = [];
      for (let i = 0; i < numSections; i++) {
        if (i < 2) labels.push('verse');
        else if (i === 2) labels.push('bridge');
        else labels.push('verse');
      }
      return labels;
    },
    'through-composed': () => {
      return Array(numSections).fill(null).map((_, i) => `section-${i + 1}`);
    },
    'strophic': () => {
      return Array(numSections).fill(null).map((_, i) => 'verse');
    },
  };

  return forms[form] ? forms[form]() : forms['verse-chorus']();
}

/**
 * Generate a chord progression for a section
 */
function generateProgression(sectionLabel, genreProfile, keyContext, complexity) {
  const commonProgressions = genreProfile.common_progressions || {};
  const allowedChords = genreProfile.allowed_chords || {};
  const extensionProb = genreProfile.extension_probability || {};

  // Select a progression pattern
  const progressionPatterns = Object.keys(commonProgressions);
  const selectedPattern = progressionPatterns[
    Math.floor(Math.random() * progressionPatterns.length)
  ] || 'I-V-vi-IV';

  // Parse roman numerals
  const romanNumerals = selectedPattern.split('-');
  
  // Convert to chords
  const progression = romanNumerals.map((rn, idx) => {
    const chord = romanNumeralToChord(rn, keyContext);
    
    // Add extensions based on complexity
    const extendedChord = addExtensions(
      chord,
      extensionProb,
      complexity,
      sectionLabel,
      idx,
    );

    return {
      chord: extendedChord,
      duration_beats: 4, // Default 4 beats per chord
      position_in_bar: 1,
      probability_score: 0.85,
      theory_justification: {
        correction_applied: false,
        reasoning: `Generated from ${selectedPattern} pattern`,
        rules_applied: ['generative'],
      },
      functional_analysis: {
        roman_numeral: rn,
        function: getFunctionFromRomanNumeral(rn),
        cadence_point: idx === romanNumerals.length - 1 ? 'authentic' : 'none',
      },
    };
  });

  return progression;
}

/**
 * Convert roman numeral to chord object
 */
function romanNumeralToChord(rn, keyContext) {
  const key = keyContext.primary_key;
  const mode = keyContext.mode;

  // Map roman numerals to scale degrees
  const scaleDegreeMap = {
    'I': 1, 'ii': 2, 'ii°': 2, 'III': 3, 'iii': 3,
    'IV': 4, 'V': 5, 'vi': 6, 'VI': 6, 'vii°': 7, 'VII': 7,
    'bII': -1, 'bIII': -2, 'bVI': -3, 'bVII': -4,
  };

  const degree = scaleDegreeMap[rn] || 1;
  
  // Get scale
  const scale = mode === 'ionian' || mode === 'major'
    ? Tonal.Scale.get(`${key} major`).notes
    : Tonal.Scale.get(`${key} minor`).notes;

  // Get root note
  let root;
  if (degree > 0) {
    root = scale[(degree - 1) % scale.length];
  } else {
    // Borrowed chord - flat the degree
    const majorScale = Tonal.Scale.get(`${key} major`).notes;
    root = Tonal.Note.transpose(majorScale[0], `${degree}M`);
  }

  // Determine quality
  let quality = 'major';
  if (rn.toLowerCase().includes('ii') || rn.toLowerCase().includes('vi') || rn.toLowerCase().includes('iii')) {
    quality = mode === 'major' ? 'minor' : 'minor';
  } else if (rn.includes('°')) {
    quality = 'diminished';
  } else if (rn.toLowerCase().includes('vii')) {
    quality = mode === 'major' ? 'diminished' : 'major';
  }

  return {
    root: root,
    quality: quality,
    bass_note: root,
    bass_ambiguity_flag: false,
  };
}

/**
 * Add extensions to a chord based on complexity
 */
function addExtensions(chord, extensionProb, complexity, sectionLabel, position) {
  if (complexity < 30) {
    // Simple - just triads
    return chord;
  }

  const rand = Math.random();
  let extended = { ...chord };

  if (complexity >= 70 && rand < (extensionProb['13th'] || 0.1)) {
    extended.extensions = ['13'];
    extended.quality = extended.quality + '13';
  } else if (complexity >= 50 && rand < (extensionProb['11th'] || 0.2)) {
    extended.extensions = ['11'];
    extended.quality = extended.quality + '11';
  } else if (rand < (extensionProb['9th'] || 0.3)) {
    extended.extensions = ['9'];
    extended.quality = extended.quality + '9';
  } else if (rand < (extensionProb.dom7 || 0.5)) {
    extended.extensions = ['7'];
    extended.quality = extended.quality + '7';
  }

  return extended;
}

/**
 * Get function from roman numeral
 */
function getFunctionFromRomanNumeral(rn) {
  if (rn === 'I' || rn === 'i') return 'tonic';
  if (rn === 'V' || rn === 'v') return 'dominant';
  if (rn === 'IV' || rn === 'iv' || rn === 'ii' || rn === 'II') return 'predominant';
  return 'ambiguous';
}

/**
 * Generate rhythmic DNA
 */
function generateRhythmicDNA(sectionLabel, genreProfile, density, tempo) {
  const basePattern = density < 30 ? [4, 4, 4, 4] : density < 70 ? [2, 2, 4, 4, 2, 2] : [2, 2, 2, 2, 2, 2, 2, 2];

  return {
    time_signature: { numerator: 4, denominator: 4 },
    pulse_pattern: basePattern,
    macrobeat_structure: {
      tempo_bpm: tempo,
      macrobeats_per_bar: 4,
      macrobeat_feel: density < 30 ? 'even' : density < 70 ? 'swing' : 'syncopated',
    },
    microbeat_base: {
      division_type: density < 50 ? 'binary' : 'ternary',
      microbeats_per_macrobeat: density < 50 ? 4 : 6,
      partition: density < 50 ? 'P=4' : 'P=6',
    },
  };
}

/**
 * Get harmonic rhythm for section
 */
function getHarmonicRhythm(sectionLabel, genreProfile) {
  if (sectionLabel === 'chorus') {
    return 'one_per_bar';
  } else if (sectionLabel === 'verse') {
    return 'two_per_bar';
  } else {
    return 'one_per_bar';
  }
}

module.exports = {
  generateStructure,
};

