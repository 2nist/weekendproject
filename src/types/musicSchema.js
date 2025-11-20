/**
 * Type definitions for Music Theory Schema
 * JavaScript equivalents of schema structures
 */

/**
 * @typedef {Object} Chord
 * @property {string} root - Root note (e.g., "C", "F#")
 * @property {string} quality - Chord quality (major, minor, dominant7, etc.)
 * @property {string[]} extensions - Extensions (9, #11, b13, etc.)
 * @property {string[]} alterations - Alterations (b5, #5, b9, #9, #11)
 * @property {Voicing} voicing - Voicing information
 * @property {string} [slash_bass] - Slash chord bass note
 */

/**
 * @typedef {Object} Voicing
 * @property {string} type - root_position, first_inversion, drop2, etc.
 * @property {string} bass_note - Bass note
 * @property {string[]} chord_tones - Array of chord tone names
 * @property {string} voicing_density - open, close, spread
 */

/**
 * @typedef {Object} ChordProgressionItem
 * @property {Chord} chord - Chord object
 * @property {number} duration_beats - Duration in beats
 * @property {number} position_in_bar - Position in bar
 * @property {number} probability_score - Post-correction confidence (0-1)
 * @property {number} raw_probability - Original DSP confidence
 * @property {TheoryJustification} theory_justification - Correction reasoning
 * @property {FunctionalAnalysis} functional_analysis - Functional harmony analysis
 */

/**
 * @typedef {Object} TheoryJustification
 * @property {boolean} correction_applied - Whether correction was made
 * @property {string} [original_chord] - Original chord name
 * @property {string} [corrected_chord] - Corrected chord name
 * @property {string} reasoning - Explanation
 * @property {string[]} rules_applied - Rules that were applied
 * @property {number} [genre_weight] - Genre influence weight
 */

/**
 * @typedef {Object} FunctionalAnalysis
 * @property {string} roman_numeral - Roman numeral (I, IV, V, etc.)
 * @property {number} scale_degree - Scale degree (1-7)
 * @property {string} function - tonic, predominant, dominant, mediant, submediant
 * @property {string} cadence_point - authentic, half, deceptive, plagal, none
 * @property {string} [tonicization_target] - Target of secondary dominant
 */

/**
 * @typedef {Object} HarmonicDNA
 * @property {ChordProgressionItem[]} progression - Chord progression
 * @property {string} key_center - Key center (e.g., "C")
 * @property {string} mode - Mode (ionian, dorian, etc.)
 * @property {string} harmonic_rhythm - Description (e.g., "1 chord per bar")
 * @property {string[]} characteristic_moves - Characteristic harmonic moves
 */

/**
 * @typedef {Object} PulsePattern
 * @property {number[]} pattern - Array of 2s and 3s (e.g., [2, 2, 3] for 7/8)
 * @property {string} mnemonic - Mnemonic syllables (e.g., "apple apple galloping")
 */

/**
 * @typedef {Object} RhythmicDNA
 * @property {Object} time_signature - {numerator, denominator}
 * @property {number[]} pulse_pattern - Additive rhythm grouping
 * @property {string} mnemonic_syllables - Apple/Galloping system
 * @property {Object} macrobeat_structure - Tempo and macrobeat info
 * @property {Object} microbeat_base - Subdivision level
 * @property {Object} [groove_descriptor] - Groove pattern info
 * @property {number} cyclic_length - Length of repeating cycle
 * @property {number[]} onset_positions - Microbeat positions of onsets
 */

/**
 * @typedef {Object} SemanticFrame
 * @property {number} timestamp - Frame time in seconds
 * @property {number} rms - Root mean square energy
 * @property {number} spectral_flux - Delta between consecutive chroma frames
 * @property {number} chroma_entropy - Harmonic density proxy
 * @property {boolean} has_vocals - Heuristic vocal detection flag
 * @property {number} rms_delta - Local energy change
 */

/**
 * @typedef {Object} SemanticFeatures
 * @property {number} frame_stride_seconds - Seconds between stored frames
 * @property {string} feature_version - Version tag for feature schema
 * @property {SemanticFrame[]} frames - Downsampled frame features
 */

/**
 * @typedef {Object} SemanticSignature
 * @property {number} repetition_score
 * @property {number} repetition_count
 * @property {number} avg_rms
 * @property {number} max_rms
 * @property {number} spectral_flux_mean
 * @property {number} spectral_flux_trend
 * @property {number} chroma_entropy_mean
 * @property {number} vocal_ratio
 * @property {boolean} has_vocals
 * @property {number} energy_slope
 * @property {number} harmonic_stability
 * @property {number} harmonic_variety
 * @property {number} chord_unique
 * @property {number} chord_total
 * @property {number} duration_seconds
 * @property {number} duration_bars
 * @property {number} position_ratio
 * @property {boolean} is_unique
 * @property {{label: string, confidence: number, reason: string}} [semantic_label]
 */

/**
 * @typedef {Object} Section
 * @property {string} section_id - Unique ID (e.g., "SECTION_A1")
 * @property {string} section_label - intro, verse, chorus, bridge, etc.
 * @property {number} section_variant - Variant number (1, 2, etc.)
 * @property {Object} time_range - {start_time, end_time, duration_bars}
 * @property {HarmonicDNA} harmonic_dna - Harmonic identity
 * @property {RhythmicDNA} rhythmic_dna - Rhythmic identity
 * @property {SemanticSignature} [semantic_signature] - Semantic features for labeler
 * @property {Object} [melodic_contour] - Melodic contour data
 * @property {Object} [similarity_matrix] - Self-similarity data
 */

/**
 * @typedef {Object} StructuralMap
 * @property {Section[]} sections - Array of sections
 */

/**
 * @typedef {Object} ArrangementFlow
 * @property {string} form - Form description (e.g., "Verse-Chorus")
 * @property {Object[]} timeline - Timeline of section references
 * @property {Object[]} transitions - Transition data
 */

/**
 * @typedef {Object} HarmonicContext
 * @property {Object} global_key - {primary_key, mode, confidence}
 * @property {Object[]} modulations - Modulation events
 * @property {Object[]} borrowed_chords - Borrowed chord events
 * @property {Object} genre_profile - Genre detection and constraints
 * @property {Object} functional_summary - Functional usage statistics
 */

/**
 * @typedef {Object} LinearAnalysis
 * @property {Object[]} events - Array of analysis events
 * @property {Object} beat_grid - Beat and tempo information
 * @property {SemanticFeatures} semantic_features - Frame-level descriptors
 */

/**
 * Helper function to validate chord object
 */
function validateChord(chord) {
  if (!chord.root || !chord.quality) {
    return false;
  }
  return true;
}

/**
 * Helper function to validate section
 */
function validateSection(section) {
  if (!section.section_id || !section.section_label) {
    return false;
  }
  if (!section.harmonic_dna || !section.rhythmic_dna) {
    return false;
  }
  return true;
}

module.exports = {
  validateChord,
  validateSection,
};

