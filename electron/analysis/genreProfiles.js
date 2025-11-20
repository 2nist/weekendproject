/**
 * Genre Profile Definitions
 * Based on schema genre_profile section
 */

const genreProfiles = {
  pop: {
    common_progressions: {
      'I-IV-V-I': 0.85,
      'I-V-vi-IV': 0.9,
      'vi-IV-I-V': 0.8,
      'I-vi-IV-V': 0.75,
    },
    allowed_chords: {
      I: 0.95,
      ii: 0.4,
      iii: 0.25,
      IV: 0.92,
      V: 0.88,
      vi: 0.85,
      'vii°': 0.1,
    },
    extension_probability: {
      maj7: 0.15,
      min7: 0.2,
      dom7: 0.35,
      '9th': 0.05,
      '11th': 0.02,
      '13th': 0.01,
    },
    chromatic_tolerance: 0.1,
    secondary_dominant_usage: 0.2,
    cadence_preferences: {
      authentic: 0.85,
      plagal: 0.1,
      half: 0.05,
    },
  },

  jazz: {
    common_progressions: {
      'ii-V-I': 0.95,
      'I-VI-ii-V': 0.8,
      'iii-VI-ii-V': 0.75,
      tritone_sub: 0.6,
    },
    allowed_chords: 'all',
    extension_probability: {
      maj7: 0.85,
      min7: 0.9,
      dom7: 0.95,
      '9th': 0.8,
      '11th': 0.7,
      '13th': 0.65,
      altered: 0.55,
    },
    chromatic_tolerance: 0.6,
    secondary_dominant_usage: 0.7,
    modal_interchange_usage: 0.5,
    cadence_preferences: {
      authentic: 0.4,
      deceptive: 0.3,
      half: 0.2,
      modal_vamp: 0.1,
    },
  },

  neo_soul: {
    common_progressions: {
      'vi-V-IV-III': 0.75,
      'ii-I-IV-V': 0.7,
      modal_vamp: 0.6,
    },
    extension_probability: {
      maj7: 0.7,
      maj9: 0.65,
      min7: 0.75,
      min9: 0.7,
      dom7: 0.8,
      '9th': 0.75,
      '11th': 0.6,
      '13th': 0.55,
    },
    chromatic_tolerance: 0.35,
    slash_chord_usage: 0.45,
    characteristic_moves: ['bVII', 'bII', 'bVI'],
    cadence_preferences: {
      authentic: 0.5,
      plagal: 0.3,
      half: 0.2,
    },
  },

  jazz_traditional: {
    common_progressions: {
      'I-VI-ii-V': 0.85,
      'ii-V-I': 0.95,
      'I-vi-ii-V': 0.8,
      'circle_of_fifths': 0.7,
      'chromatic_walk': 0.6,
    },
    allowed_chords: 'all',
    extension_probability: {
      maj7: 0.8,
      min7: 0.75,
      dom7: 0.95,
      '9th': 0.65,
      '11th': 0.55,
      '13th': 0.5,
    },
    chromatic_tolerance: 0.55,
    swing_ratio: 1.6,
    secondary_dominant_usage: 0.8,
    cadence_preferences: {
      authentic: 0.6,
      half: 0.2,
      deceptive: 0.1,
      plagal: 0.1,
    },
  },
};

function getGenreProfile(genreName) {
  const normalized = genreName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return genreProfiles[normalized] || genreProfiles.pop; // Default to pop
}

function getAllowedExtensions(genreName, chordFunction) {
  const profile = getGenreProfile(genreName);
  return profile.extension_probability || {};
}

function getChromaticTolerance(genreName) {
  const profile = getGenreProfile(genreName);
  return profile.chromatic_tolerance || 0.1;
}

function getSecondaryDominantUsage(genreName) {
  const profile = getGenreProfile(genreName);
  return profile.secondary_dominant_usage || 0.2;
}

function isProgressionCommon(genreName, progression) {
  const profile = getGenreProfile(genreName);
  const common = profile.common_progressions || {};
  return common[progression] || 0;
}

module.exports = {
  genreProfiles,
  getGenreProfile,
  getAllowedExtensions,
  getChromaticTolerance,
  getSecondaryDominantUsage,
  isProgressionCommon,
};

