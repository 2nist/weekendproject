/**
 * Pass 3: The Theorist (Wet Theory-Based Correction)
 * Applies music theory rules to correct audio analysis errors
 * Based on schema pseudocode
 */

const { getGenreProfile } = require('./genreProfiles');
const theoryRules = require('./theoryRules');
const { labelSectionsWithSemantics } = require('./semanticLabeler');

/**
 * Main function: Resolve progression with theory corrections
 * @param {Array} rawChords - Chord candidates from DSP with confidence scores
 * @param {Object} genreProfile - Genre constraints and probability weights
 * @param {Object} keyContext - Global/local key information
 * @param {string} sectionType - "verse", "chorus", etc.
 * @returns {Array} Corrected progression with justifications
 */
function resolveProgression(rawChords, genreProfile, keyContext, sectionType) {
  const correctedProgression = [];

  for (let i = 0; i < rawChords.length; i++) {
    const rawChord = rawChords[i];
    const correctionContext = {
      original: rawChord,
      position: i,
      neighbors: getNeighborChords(rawChords, i),
      probability: rawChord.confidence || 0.5,
      corrected: null,
      justification: [],
    };

    // RULE 1: Bass Note Disambiguation
    if (rawChord.bass_ambiguity_flag) {
      const corrected = theoryRules.applyBassDisambiguation(
        rawChord,
        keyContext,
        correctionContext,
      );
      correctionContext.corrected = corrected;
    }

    // RULE 2: Functional Harmony Correction
    const expectedFunction = theoryRules.getExpectedFunction(
      i,
      sectionType,
      keyContext,
    );

    if (expectedFunction === 'DOMINANT') {
      if (!isDominantQuality(rawChord, keyContext)) {
        const candidates = findDominantCandidates(rawChord, keyContext);
        if (candidates.length > 0) {
          const bestMatch = findBestBassMatch(candidates, rawChord.bass_note);
          correctionContext.corrected = bestMatch.chord;
          correctionContext.justification.push({
            rule: 'functional_harmony_dominant',
            reasoning: `Position ${i} expects dominant function. Bass note ${rawChord.bass_note} suggests ${bestMatch.chord.root}${bestMatch.chord.quality}`,
          });
        }
      }
    } else if (expectedFunction === 'PREDOMINANT') {
      // Common error: F# heard instead of F in C major
      if (
        (rawChord.root === 'F#' || rawChord.root === 'Gb') &&
        isDiatonic('F', keyContext)
      ) {
        const genreName = genreProfile.name || 'pop';
        const secondaryDominantUsage = genreProfile.secondary_dominant_usage || 0.2;

        if (genreName === 'pop' && secondaryDominantUsage < 0.3) {
          // Pop rarely uses secondary dominants
          correctionContext.corrected = buildChord('F', 'major', 'F');
          correctionContext.justification.push({
            rule: 'genre_probability',
            reasoning:
              'Pop genre rarely uses F#. Corrected to F (IV) as predominant.',
            genre_weight: 0.85,
          });
        } else {
          // Jazz/sophisticated pop might use D7/F# (V7/V)
          correctionContext.corrected = buildChord('D', 'dominant7', 'F#');
          correctionContext.justification.push({
            rule: 'secondary_dominant',
            reasoning: 'D7/F# (V7/V) as chromatic predominant. Genre supports this.',
            genre_weight: 0.6,
          });
        }
      }
    }

    // RULE 3: Cadence Detection & Enforcement
    if (i >= rawChords.length - 2) {
      // Near end of phrase
      const cadenceType = theoryRules.detectCadenceContext(
        rawChords.slice(i - 1),
        keyContext,
      );

      if (cadenceType === 'AUTHENTIC_EXPECTED') {
        if (!isTonicChord(rawChord, keyContext)) {
          correctionContext.corrected = buildTonicChord(keyContext);
          correctionContext.justification.push({
            rule: 'authentic_cadence',
            reasoning: `End of phrase in ${sectionType}. Enforcing V->I resolution.`,
            raw_probability: rawChord.confidence,
            corrected_probability: 0.95,
          });
        }
      }
    }

    // RULE 4: Voice Leading Smoothness
    if (i > 0) {
      const prevChord = correctedProgression[correctedProgression.length - 1]?.chord;
      if (prevChord) {
        const voiceLeadingCost = theoryRules.calculateVoiceLeading(
          prevChord,
          rawChord,
        );

        const threshold = 20; // Adjust based on testing
        if (voiceLeadingCost > threshold) {
          const alternateCandidates = findSmootherAlternatives(
            prevChord,
            rawChord,
            keyContext,
          );

          for (const candidate of alternateCandidates) {
            const candidateCost = theoryRules.calculateVoiceLeading(
              prevChord,
              candidate.chord,
            );

            if (candidateCost < voiceLeadingCost * 0.5) {
              correctionContext.corrected = candidate.chord;
              correctionContext.justification.push({
                rule: 'voice_leading_smoothness',
                reasoning: `Original voice leading cost: ${voiceLeadingCost.toFixed(2)}. Smoother option: ${candidate.chord.root}${candidate.chord.quality}`,
                cost_reduction: voiceLeadingCost - candidateCost,
              });
              break;
            }
          }
        }
      }
    }

    // RULE 5: Harmonic Rhythm Consistency
    const sectionHarmonicRhythm = theoryRules.getSectionHarmonicRhythm(
      sectionType,
      genreProfile,
    );

    if (rawChord.duration < sectionHarmonicRhythm.min_duration) {
      if (rawChord.confidence < 0.7) {
        // Merge with previous or next chord
        correctionContext.corrected = null; // Flag for deletion
        correctionContext.justification.push({
          rule: 'harmonic_rhythm_consistency',
          reasoning: `Chord change too rapid (${rawChord.duration}s). Likely artifact. Merged with neighbor.`,
        });
      }
    }

    // RULE 6: Modal Interchange vs. Error
    if (theoryRules.isNonDiatonic(rawChord, keyContext)) {
      const commonBorrowedChords = genreProfile.common_borrowed_chords || [];
      if (commonBorrowedChords.includes(rawChord.root)) {
        // Likely intentional - keep it
        correctionContext.corrected = rawChord;
        correctionContext.justification.push({
          rule: 'modal_interchange',
          reasoning: `${rawChord.root} is common borrowed chord in ${genreProfile.name || 'this genre'}`,
          borrowed_from: getSourceMode(rawChord, keyContext),
        });
      } else {
        // Suspicious - check if diatonic alternative has better bass
        const diatonicAlternative = findDiatonicAlternative(rawChord, keyContext);
        if (diatonicAlternative && diatonicAlternative.bass_match > rawChord.bass_match) {
          correctionContext.corrected = diatonicAlternative.chord;
          correctionContext.justification.push({
            rule: 'bass_note_disambiguation',
            reasoning: `Non-diatonic ${rawChord.root} corrected to ${diatonicAlternative.chord.root}. Bass note match superior.`,
          });
        }
      }
    }

    // RULE 7: Genre-Specific Extensions
    if (['jazz', 'neo_soul', 'r&b'].includes(genreProfile.name?.toLowerCase())) {
      if (
        ['major', 'minor'].includes(rawChord.quality) &&
        (!rawChord.extensions || rawChord.extensions.length === 0)
      ) {
        if (i % 4 === 0) {
          // Downbeat
          const enhancedChord = theoryRules.addExtensionsForGenre(
            rawChord,
            genreProfile,
            keyContext,
          );

          if (enhancedChord !== rawChord) {
            correctionContext.corrected = enhancedChord;
            correctionContext.justification.push({
              rule: 'genre_extension',
              reasoning: `${genreProfile.name} context. Enhanced ${rawChord.quality} to ${enhancedChord.quality}`,
              genre_weight: 0.7,
            });
          }
        }
      }
    }

    // Finalize correction
    const finalChord = correctionContext.corrected !== null
      ? correctionContext.corrected
      : rawChord;

    // Calculate post-correction probability
    const finalProbability = calculateFinalProbability(
      rawChord.confidence || 0.5,
      correctionContext.justification,
      genreProfile,
    );

    // Skip if flagged for deletion
    if (correctionContext.corrected === null && correctionContext.justification.some(j => j.rule === 'harmonic_rhythm_consistency')) {
      continue;
    }

    correctedProgression.push({
      chord: finalChord,
      duration_beats: rawChord.duration_beats || 4,
      position_in_bar: rawChord.position_in_bar || 1,
      probability_score: finalProbability,
      raw_probability: rawChord.confidence || 0.5,
      theory_justification: {
        correction_applied: correctionContext.corrected !== null,
        original_chord: rawChord.root + (rawChord.quality || ''),
        corrected_chord: finalChord.root + (finalChord.quality || ''),
        reasoning: correctionContext.justification.map(j => j.reasoning).join('; '),
        rules_applied: correctionContext.justification.map(j => j.rule),
        genre_weight: correctionContext.justification[0]?.genre_weight || 0,
      },
      functional_analysis: {
        roman_numeral: getRomanNumeral(finalChord, keyContext),
        scale_degree: getScaleDegree(finalChord.root, keyContext),
        function: expectedFunction.toLowerCase(),
        cadence_point: i >= rawChords.length - 2 ? 'authentic' : 'none',
      },
    });
  }

  return correctedProgression;
}

// Helper functions

function getNeighborChords(chords, index) {
  return {
    prev: index > 0 ? chords[index - 1] : null,
    next: index < chords.length - 1 ? chords[index + 1] : null,
  };
}

function isDominantQuality(chord, keyContext) {
  // Simplified check
  return chord.quality?.includes('dominant') || chord.quality === '7';
}

function findDominantCandidates(rawChord, keyContext) {
  // Find dominant function chords that match bass note
  const key = keyContext.primary_key || 'C';
  const dominant = getDominantOfKey(key);
  
  return [
    { chord: buildChord(dominant, 'dominant7', rawChord.bass_note), reason: `V7 in ${key} major`, weight: 0.9 },
  ];
}

function findBestBassMatch(candidates, bassNote) {
  // Find candidate with matching bass note
  for (const candidate of candidates) {
    if (candidate.chord.bass_note === bassNote) {
      return candidate;
    }
  }
  return candidates[0];
}

function buildChord(root, quality, bassNote) {
  return {
    root,
    quality,
    bass_note: bassNote || root,
    extensions: [],
    alterations: [],
    voicing: {
      type: 'root_position',
      bass_note: bassNote || root,
      chord_tones: [],
      voicing_density: 'open',
    },
  };
}

function buildTonicChord(keyContext) {
  const key = keyContext.primary_key || 'C';
  return buildChord(key, 'major', key);
}

function isTonicChord(chord, keyContext) {
  return chord.root === (keyContext.primary_key || 'C');
}

function isDiatonic(note, keyContext) {
  // Simplified - would need full scale analysis
  return true;
}

function findSmootherAlternatives(prevChord, nextChord, keyContext) {
  // Simplified - would need more sophisticated analysis
  return [];
}

function findDiatonicAlternative(chord, keyContext) {
  // Simplified - would need scale analysis
  return null;
}

function getSourceMode(chord, keyContext) {
  return 'parallel minor'; // Simplified
}

function calculateFinalProbability(rawConfidence, justifications, genreProfile) {
  let score = rawConfidence;

  for (const justification of justifications) {
    if (['functional_harmony_tonic', 'authentic_cadence'].includes(justification.rule)) {
      score += 0.15;
    } else if (justification.rule === 'genre_probability') {
      score += 0.1 * (justification.genre_weight || 0.5);
    } else if (justification.rule === 'voice_leading_smoothness') {
      score += 0.08;
    }
  }

  // Penalty for forced corrections
  if (rawConfidence > 0.85 && justifications.length > 0) {
    score -= 0.05;
  }

  return Math.min(score, 1.0);
}

function getRomanNumeral(chord, keyContext) {
  // Simplified - would need full Roman numeral analysis
  const key = keyContext.primary_key || 'C';
  if (chord.root === key) return 'I';
  // TODO: Implement full Roman numeral conversion
  return 'I';
}

function getScaleDegree(note, keyContext) {
  // Simplified
  return 1;
}

function getDominantOfKey(key) {
  const Tonal = require('tonal');
  return Tonal.Note.transpose(key, '5P');
}

/**
 * Apply theory corrections to a structural map
 */
async function correctStructuralMap(structuralMap, linearAnalysis, metadata, progressCallback = () => {}) {
  console.log('Theorist: Starting correction, sections:', structuralMap?.sections?.length || 0);
  
  if (!structuralMap || !structuralMap.sections || structuralMap.sections.length === 0) {
    console.warn('Theorist: No sections to correct, returning original');
    return structuralMap || { sections: [] };
  }
  
  const genreProfile = getGenreProfile(metadata.genre_hint || 'pop');
  const keyContext = {
    primary_key: metadata.key_hint || 'C',
    mode: metadata.mode_hint || 'ionian',
  };

  const correctedSections = [];

  for (let sectionIndex = 0; sectionIndex < structuralMap.sections.length; sectionIndex++) {
    const section = structuralMap.sections[sectionIndex];
    progressCallback((sectionIndex / structuralMap.sections.length) * 100);

    // Extract raw chords for this section from linear analysis
    const sectionChords = extractSectionChords(
      linearAnalysis,
      section.time_range,
    );

    // Apply theory corrections
    const correctedProgression = resolveProgression(
      sectionChords,
      genreProfile,
      keyContext,
      section.section_label,
    );

    // Update section with corrected progression
    correctedSections.push({
      ...section,
      harmonic_dna: {
        ...section.harmonic_dna,
        progression: correctedProgression,
        key_center: keyContext.primary_key,
        mode: keyContext.mode,
      },
    });
    
    // Allow event loop to process every 5 sections
    if (sectionIndex % 5 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  progressCallback(100);

  const semanticallyLabeled = labelSectionsWithSemantics(
    correctedSections,
    linearAnalysis?.metadata || metadata,
  );

  return {
    ...structuralMap,
    sections: semanticallyLabeled,
  };
}

function extractSectionChords(linearAnalysis, timeRange) {
  // Extract chord candidates from linear analysis events within time range
  const chords = [];

  if (linearAnalysis.events) {
    for (const event of linearAnalysis.events) {
      if (
        event.event_type === 'chord_candidate' &&
        event.timestamp >= timeRange.start_time &&
        event.timestamp < timeRange.end_time
      ) {
        chords.push({
          root: event.chord_candidate?.root_candidates?.[0]?.root || 'C',
          quality: event.chord_candidate?.quality_candidates?.[0]?.quality || 'major',
          bass_note: event.chord_candidate?.bass_note || 'C',
          bass_ambiguity_flag: event.chord_candidate?.bass_ambiguity_flag || false,
          confidence: event.confidence || 0.5,
          duration_beats: 4, // TODO: Calculate from timestamps
          position_in_bar: 1, // TODO: Calculate from beat grid
        });
      }
    }
  }

  return chords;
}

module.exports = {
  resolveProgression,
  correctStructuralMap,
};

