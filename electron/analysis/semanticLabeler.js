/**
 * Structural Function Labeling Engine - Complete Overhaul
 * Multi-phase detection system with multi-factor similarity scoring
 * Implements clustering-based semantic labeling for Verse/Chorus/Bridge identification
 */

const FRAME_HOP_SECONDS = 0.0232; // Default frame hop (librosa hop_length=512 @ sr=22050)
const logger = require('./logger');

/**
 * Main function: Apply structural function labeling to sections
 * @param {Array} sections - Raw sections from architect
 * @param {Object} metadata - Analysis metadata
 * @param {Object} linear - Linear analysis data (chroma, mfcc, events, etc.)
 * @returns {Array} Sections with functional labels applied
 */
function labelSectionsWithSemantics(sections = [], metadata = {}, linear = {}) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return sections;
  }

  logger.debug(`[SemanticLabeler] Processing ${sections.length} sections...`);

  // Extract features
  const chromaFrames = linear?.chroma_frames?.map((f) => f.chroma || []) || [];
  const mfccFrames = linear?.mfcc_frames?.map((f) => f.mfcc || []) || [];

  // Step 1: Enhanced clustering with multi-factor similarity
  const { sections: clusteredSections, clusters } = clusterSectionsImproved(
    sections,
    chromaFrames,
    mfccFrames,
    linear,
    { similarityThreshold: 0.65 },
  );

  logger.debug(`[SemanticLabeler] Created ${clusters.size} clusters`);

  // Step 2: Rule-based labeling with confidence scores
  const labeledSections = labelSectionsEnhanced(clusteredSections, clusters, linear);

  // Step 3: Assign variant numbers with context
  const finalSections = assignVariantNumbers(labeledSections);

  // Step 4: Post-processing validation
  validateAndFixLabels(finalSections);

  // Log results
  const labelCounts = {};
  for (const section of finalSections) {
    labelCounts[section.section_label] = (labelCounts[section.section_label] || 0) + 1;
  }

  logger.info('[SemanticLabeler] Final labels:', labelCounts);
  logger.info(
    '[SemanticLabeler] Confidence scores:',
    finalSections
      .map((s) => `${s.section_label}: ${(s.label_confidence * 100).toFixed(0)}%`)
      .join(', '),
  );

  return finalSections;
}

/**
 * Phase 1: Multi-Factor Similarity Score
 * Combines chroma, MFCC, energy, rhythm, and progression signals
 */
function calculateSectionSimilarity(sectionA, sectionB, chromaFrames, mfccFrames, linear) {
  const weights = {
    chroma: 0.35, // Harmonic content
    mfcc: 0.15, // Timbre/texture
    energy: 0.2, // Volume/intensity
    rhythm: 0.15, // Drum patterns
    progression: 0.15, // Chord changes
  };

  let totalScore = 0;
  let totalWeight = 0;

  // Helper: Get average vector for a section
  const getCachedAvgVector = (frames, startFrame, endFrame, type) => {
    if (!frames || frames.length === 0) return null;
    if (startFrame < 0 || endFrame <= startFrame) return null;

    const sectionFrames = frames.slice(
      Math.max(0, Math.floor(startFrame)),
      Math.min(frames.length, Math.ceil(endFrame)),
    );

    if (sectionFrames.length === 0) return null;

    const dim = sectionFrames[0]?.length || 0;
    if (dim === 0) return null;

    const avg = new Array(dim).fill(0);
    for (const frame of sectionFrames) {
      if (frame && frame.length === dim) {
        for (let i = 0; i < dim; i++) {
          avg[i] += frame[i] || 0;
        }
      }
    }

    const count = sectionFrames.length;
    for (let i = 0; i < dim; i++) {
      avg[i] /= count;
    }

    return avg;
  };

  // Convert time ranges to frame indices
  const getFrameRange = (section) => {
    const startTime = section.time_range?.start_time || 0;
    const endTime = section.time_range?.end_time || startTime + 10;
    return {
      startFrame: startTime / FRAME_HOP_SECONDS,
      endFrame: endTime / FRAME_HOP_SECONDS,
    };
  };

  const rangeA = getFrameRange(sectionA);
  const rangeB = getFrameRange(sectionB);

  // 1. CHROMA SIMILARITY (Harmonic)
  const chromaA = getCachedAvgVector(chromaFrames, rangeA.startFrame, rangeA.endFrame, 'chroma');
  const chromaB = getCachedAvgVector(chromaFrames, rangeB.startFrame, rangeB.endFrame, 'chroma');

  if (chromaA && chromaB) {
    const chromaSim = cosineSimilarity(chromaA, chromaB);
    totalScore += chromaSim * weights.chroma;
    totalWeight += weights.chroma;
  }

  // 2. MFCC SIMILARITY (Timbre)
  if (mfccFrames && mfccFrames.length) {
    const mfccA = getCachedAvgVector(mfccFrames, rangeA.startFrame, rangeA.endFrame, 'mfcc');
    const mfccB = getCachedAvgVector(mfccFrames, rangeB.startFrame, rangeB.endFrame, 'mfcc');

    if (mfccA && mfccB) {
      const mfccSim = cosineSimilarity(mfccA, mfccB);
      totalScore += mfccSim * weights.mfcc;
      totalWeight += weights.mfcc;
    }
  }

  // 3. ENERGY SIMILARITY (Volume)
  const energyA = sectionA.semantic_signature?.avg_rms || sectionA.semantic?.energy || 0.5;
  const energyB = sectionB.semantic_signature?.avg_rms || sectionB.semantic?.energy || 0.5;
  const energySim = 1.0 - Math.abs(energyA - energyB);
  totalScore += energySim * weights.energy;
  totalWeight += weights.energy;

  // 4. RHYTHM PATTERN SIMILARITY (Drums)
  const rhythmSim = compareRhythmPatterns(sectionA, sectionB, linear);
  totalScore += rhythmSim * weights.rhythm;
  totalWeight += weights.rhythm;

  // 5. CHORD PROGRESSION SIMILARITY
  const progSim = compareChordProgressions(sectionA, sectionB, linear);
  totalScore += progSim * weights.progression;
  totalWeight += weights.progression;

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

/**
 * Compare rhythm patterns (kick/snare) between two sections
 */
function compareRhythmPatterns(sectionA, sectionB, linear) {
  const drumGrid = linear?.beat_grid?.drum_grid || [];

  const getSectionDrums = (section) => {
    const startTime = section.time_range?.start_time || 0;
    const endTime = section.time_range?.end_time || startTime + 10;
    return drumGrid.filter((d) => d.time >= startTime && d.time < endTime);
  };

  const drumsA = getSectionDrums(sectionA);
  const drumsB = getSectionDrums(sectionB);

  if (!drumsA.length || !drumsB.length) return 0.5;

  // Compare kick/snare patterns
  const patternA = drumsA.map((d) => ({ kick: d.hasKick || false, snare: d.hasSnare || false }));
  const patternB = drumsB.map((d) => ({ kick: d.hasKick || false, snare: d.hasSnare || false }));

  // Normalize to same length
  const minLen = Math.min(patternA.length, patternB.length);
  if (minLen === 0) return 0.5;

  let matches = 0;
  for (let i = 0; i < minLen; i++) {
    if (patternA[i].kick === patternB[i].kick && patternA[i].snare === patternB[i].snare) {
      matches++;
    }
  }

  return matches / minLen;
}

/**
 * Compare chord progressions between two sections
 */
function compareChordProgressions(sectionA, sectionB, linear) {
  const events = linear?.events || [];

  const getSectionChords = (section) => {
    const startTime = section.time_range?.start_time || 0;
    const endTime = section.time_range?.end_time || startTime + 10;
    return events
      .filter(
        (e) =>
          e.event_type === 'chord_candidate' && e.timestamp >= startTime && e.timestamp < endTime,
      )
      .map((e) => e.chord || e.chord_candidate?.chord || 'N');
  };

  const chordsA = getSectionChords(sectionA);
  const chordsB = getSectionChords(sectionB);

  if (!chordsA.length || !chordsB.length) return 0.5;

  // Compare chord sequences
  const minLen = Math.min(chordsA.length, chordsB.length);
  if (minLen === 0) return 0.5;

  let matches = 0;
  for (let i = 0; i < minLen; i++) {
    if (chordsA[i] === chordsB[i]) matches++;
  }

  return matches / minLen;
}

/**
 * Cosine similarity helper
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Phase 2: Improved Clustering with Dynamic Threshold
 */
function clusterSectionsImproved(sections, chromaFrames, mfccFrames, linear, opts = {}) {
  const baseSimilarityThreshold = opts.similarityThreshold || 0.65; // LOWERED from 0.9
  const clusters = new Map();
  let clusterId = 0;

  // Initialize cluster_id for all sections
  sections.forEach((s) => {
    s.cluster_id = null;
  });

  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;

    sections[i].cluster_id = clusterId;
    clusters.set(clusterId, [i]);

    // Find similar sections
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;

      // Multi-factor similarity
      const similarity = calculateSectionSimilarity(
        sections[i],
        sections[j],
        chromaFrames,
        mfccFrames,
        linear,
      );

      // Dynamic threshold based on section characteristics
      let threshold = baseSimilarityThreshold;

      // Lower threshold for short sections (they vary more)
      const durationA =
        (sections[i].time_range?.end_time || 0) - (sections[i].time_range?.start_time || 0);
      const durationB =
        (sections[j].time_range?.end_time || 0) - (sections[j].time_range?.start_time || 0);
      const avgLength = (durationA + durationB) / 2;
      if (avgLength < 3) {
        // < 3 seconds
        threshold -= 0.1;
      }

      // Lower threshold if sections are adjacent (might be same with variation)
      if (Math.abs(i - j) === 1) {
        threshold -= 0.05;
      }

      // Check if sections should merge
      if (similarity > threshold) {
        sections[j].cluster_id = clusterId;
        clusters.get(clusterId).push(j);
      }
    }

    clusterId++;
  }

  return { sections, clusters };
}

/**
 * Phase 3: Rule-Based Labeling with Confidence Scores
 */
function labelSectionsEnhanced(sections, clusters, linear) {
  const labeledSections = sections.map((s) => ({ ...s, labelCandidates: [] }));

  // RULE 1: Intro Detection (high confidence)
  const firstSection = labeledSections[0];
  if (firstSection) {
    const energy = firstSection.semantic_signature?.avg_rms || firstSection.semantic?.energy || 0.5;
    const isQuiet = energy < 0.4;
    const duration =
      (firstSection.time_range?.end_time || 0) - (firstSection.time_range?.start_time || 0);
    const isShort = duration < 4; // < 4 seconds
    const vocalProb =
      firstSection.semantic_signature?.vocal_probability ||
      firstSection.semantic?.vocal_probability ||
      0;
    const noVocals = vocalProb < 0.2;

    if (isQuiet || isShort || noVocals) {
      firstSection.labelCandidates.push({
        label: 'intro',
        confidence: 0.9,
        reason: 'First section with low energy/vocals',
      });
    }
  }

  // RULE 2: Outro Detection (high confidence)
  const lastSection = labeledSections[labeledSections.length - 1];
  if (lastSection) {
    const energy = lastSection.semantic_signature?.avg_rms || lastSection.semantic?.energy || 0.5;
    const isFading = energy < 0.3;
    const duration =
      (lastSection.time_range?.end_time || 0) - (lastSection.time_range?.start_time || 0);
    const isLong = duration > 5; // > 5 seconds

    if (isFading || isLong) {
      lastSection.labelCandidates.push({
        label: 'outro',
        confidence: 0.85,
        reason: 'Last section with fade or extended length',
      });
    }
  }

  // RULE 3: Chorus Detection (multi-factor)
  const clusterStats = calculateClusterStats(clusters, labeledSections);

  for (const [clusterId, stats] of Object.entries(clusterStats)) {
    const confidence = calculateChorusConfidence(stats);

    if (confidence > 0.6) {
      for (const sectionIdx of stats.indices) {
        labeledSections[sectionIdx].labelCandidates.push({
          label: 'chorus',
          confidence,
          reason: `High repetition (${stats.repetitionCount}x), energy: ${stats.avgEnergy.toFixed(2)}`,
        });
      }
    }
  }

  // RULE 4: Verse Detection (predecessor to chorus)
  const chorusSections = labeledSections
    .map((s, idx) => ({ section: s, idx }))
    .filter(({ section }) =>
      section.labelCandidates.some((c) => c.label === 'chorus' && c.confidence > 0.7),
    );

  for (const { idx } of chorusSections) {
    if (idx > 0) {
      const predecessor = labeledSections[idx - 1];
      const vocalProb =
        predecessor.semantic_signature?.vocal_probability ||
        predecessor.semantic?.vocal_probability ||
        0;
      const hasVocals = vocalProb > 0.5;
      const energy = predecessor.semantic_signature?.avg_rms || predecessor.semantic?.energy || 0.5;
      const moderateEnergy = energy > 0.4 && energy < 0.8;

      if (hasVocals && moderateEnergy) {
        predecessor.labelCandidates.push({
          label: 'verse',
          confidence: 0.75,
          reason: 'Precedes chorus, has vocals, moderate energy',
        });
      }
    }
  }

  // RULE 5: Bridge Detection (unique section after first chorus)
  const firstChorusIdx = chorusSections.length > 0 ? chorusSections[0].idx : -1;

  if (firstChorusIdx > 0) {
    for (let i = firstChorusIdx + 1; i < labeledSections.length - 1; i++) {
      const section = labeledSections[i];

      // Check if section is unique (small cluster)
      const clusterSize = clusters.get(section.cluster_id)?.length || 0;
      const isUnique = clusterSize <= 1;

      // Check if harmonically different
      const isDifferent = section.labelCandidates.length === 0;

      // Check position (middle-to-late)
      const position = i / labeledSections.length;
      const isMidToLate = position > 0.4 && position < 0.85;

      if (isUnique && isDifferent && isMidToLate) {
        section.labelCandidates.push({
          label: 'bridge',
          confidence: 0.7,
          reason: 'Unique section in middle-to-late position',
        });
      }
    }
  }

  // RULE 6: Pre-Chorus Detection (short section between verse and chorus)
  for (let i = 1; i < labeledSections.length - 1; i++) {
    const section = labeledSections[i];
    const prev = labeledSections[i - 1];
    const next = labeledSections[i + 1];

    const prevIsVerse = prev.labelCandidates.some((c) => c.label === 'verse');
    const nextIsChorus = next.labelCandidates.some((c) => c.label === 'chorus');
    const duration = (section.time_range?.end_time || 0) - (section.time_range?.start_time || 0);
    const isShort = duration < 3; // < 3 seconds

    if (prevIsVerse && nextIsChorus && isShort) {
      section.labelCandidates.push({
        label: 'pre-chorus',
        confidence: 0.8,
        reason: 'Short section between verse and chorus',
      });
    }
  }

  // RULE 7: Instrumental/Solo Detection
  for (const section of labeledSections) {
    if (section.labelCandidates.length > 0) continue;

    const vocalProb =
      section.semantic_signature?.vocal_probability || section.semantic?.vocal_probability || 0;
    const noVocals = vocalProb < 0.2;
    const energy = section.semantic_signature?.avg_rms || section.semantic?.energy || 0.5;
    const highEnergy = energy > 0.6;
    const position = labeledSections.indexOf(section) / labeledSections.length;
    const isMidTrack = position > 0.3 && position < 0.8;

    if (noVocals && isMidTrack) {
      section.labelCandidates.push({
        label: highEnergy ? 'solo' : 'instrumental',
        confidence: 0.65,
        reason: `No vocals, ${highEnergy ? 'high' : 'moderate'} energy, mid-track`,
      });
    }
  }

  // RULE 8: Fill remaining with verse (default for vocal sections)
  for (const section of labeledSections) {
    if (section.labelCandidates.length === 0) {
      const vocalProb =
        section.semantic_signature?.vocal_probability || section.semantic?.vocal_probability || 0;
      const hasVocals = vocalProb > 0.4;

      if (hasVocals) {
        section.labelCandidates.push({
          label: 'verse',
          confidence: 0.5,
          reason: 'Default: vocal section with no clear pattern',
        });
      } else {
        section.labelCandidates.push({
          label: 'section',
          confidence: 0.3,
          reason: 'Unclear - generic section',
        });
      }
    }
  }

  // Select best label for each section
  for (const section of labeledSections) {
    if (section.labelCandidates.length === 0) {
      section.section_label = 'section';
      section.label_confidence = 0.3;
      section.label_reason = 'No candidates found';
      continue;
    }

    const bestCandidate = section.labelCandidates.reduce((best, current) =>
      current.confidence > best.confidence ? current : best,
    );

    section.section_label = bestCandidate.label;
    section.label_confidence = bestCandidate.confidence;
    section.label_reason = bestCandidate.reason;
  }

  return labeledSections;
}

/**
 * Calculate chorus confidence from cluster statistics
 */
function calculateChorusConfidence(stats) {
  let confidence = 0;

  // Factor 1: Repetition (most important)
  if (stats.repetitionCount >= 3) confidence += 0.4;
  else if (stats.repetitionCount === 2) confidence += 0.2;

  // Factor 2: Energy (choruses are usually louder)
  if (stats.avgEnergy > 0.7) confidence += 0.3;
  else if (stats.avgEnergy > 0.5) confidence += 0.15;

  // Factor 3: Vocals (choruses have vocals)
  if (stats.avgVocalProb > 0.6) confidence += 0.2;
  else if (stats.avgVocalProb > 0.4) confidence += 0.1;

  // Factor 4: Duration (choruses are substantial)
  if (stats.avgDuration > 20) confidence += 0.1;

  return Math.min(1.0, confidence);
}

/**
 * Calculate cluster statistics
 */
function calculateClusterStats(clusters, sections) {
  const stats = {};

  for (const [clusterId, indices] of clusters.entries()) {
    const clusterSections = indices.map((i) => sections[i]);

    const durations = clusterSections.map((s) => {
      const start = s.time_range?.start_time || 0;
      const end = s.time_range?.end_time || start + 10;
      return end - start;
    });

    stats[clusterId] = {
      id: clusterId,
      indices,
      repetitionCount: indices.length,
      avgEnergy: average(
        clusterSections.map((s) => s.semantic_signature?.avg_rms || s.semantic?.energy || 0.5),
      ),
      avgVocalProb: average(
        clusterSections.map(
          (s) => s.semantic_signature?.vocal_probability || s.semantic?.vocal_probability || 0,
        ),
      ),
      avgDuration: average(durations),
      firstOccurrence: Math.min(...indices),
    };
  }

  return stats;
}

/**
 * Average helper
 */
function average(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * Phase 4: Variant Numbering with Context
 */
function assignVariantNumbers(sections) {
  const labelCounts = new Map();

  for (const section of sections) {
    const label = section.section_label || 'section';

    if (!labelCounts.has(label)) {
      labelCounts.set(label, 0);
    }

    labelCounts.set(label, labelCounts.get(label) + 1);
    section.section_variant = labelCounts.get(label);

    // Add contextual suffix for clarity
    if (label === 'verse' && section.section_variant > 1) {
      // Check if this verse is different (new chord progression)
      const firstVerse = sections.find(
        (s) => s.section_label === 'verse' && s.section_variant === 1,
      );
      if (firstVerse && section.cluster_id !== firstVerse.cluster_id) {
        section.section_suffix = 'alt'; // "Verse 2 (alt)"
      }
    }

    if (label === 'chorus' && section.section_variant > 2) {
      // Check if this is a climactic final chorus
      const position = sections.indexOf(section) / sections.length;
      const isLast = position > 0.8;
      const energy = section.semantic_signature?.avg_rms || section.semantic?.energy || 0.5;
      const isLouder = energy > 0.85;

      if (isLast && isLouder) {
        section.section_suffix = 'finale'; // "Chorus 3 (finale)"
      }
    }
  }

  return sections;
}

/**
 * Phase 5: Post-processing Validation
 */
function validateAndFixLabels(sections) {
  // Fix 1: Ensure at least one chorus exists (if repetition detected)
  const hasChorus = sections.some((s) => s.section_label === 'chorus');
  const hasRepetition = sections.some((s) => {
    const cluster = sections.filter((x) => x.cluster_id === s.cluster_id);
    return cluster.length >= 2;
  });

  if (!hasChorus && hasRepetition) {
    // Find most repeated cluster with high energy
    const clusterStats = {};
    for (const section of sections) {
      if (!clusterStats[section.cluster_id]) {
        clusterStats[section.cluster_id] = {
          count: 0,
          avgEnergy: 0,
          indices: [],
        };
      }
      clusterStats[section.cluster_id].count++;
      clusterStats[section.cluster_id].avgEnergy +=
        section.semantic_signature?.avg_rms || section.semantic?.energy || 0.5;
      clusterStats[section.cluster_id].indices.push(sections.indexOf(section));
    }

    let bestCluster = null;
    let bestScore = 0;

    for (const [id, stats] of Object.entries(clusterStats)) {
      stats.avgEnergy /= stats.count;
      const score = stats.count * 2 + stats.avgEnergy;
      if (score > bestScore) {
        bestScore = score;
        bestCluster = id;
      }
    }

    if (bestCluster) {
      for (const idx of clusterStats[bestCluster].indices) {
        sections[idx].section_label = 'chorus';
        sections[idx].label_confidence = 0.7;
        sections[idx].label_reason = 'Most repeated high-energy section';
      }
      logger.info(`[SemanticLabeler] Fixed: Promoted cluster ${bestCluster} to chorus`);
    }
  }

  // Fix 2: Ensure intro/outro are reasonable lengths
  const firstDuration =
    (sections[0]?.time_range?.end_time || 0) - (sections[0]?.time_range?.start_time || 0);
  if (sections[0]?.section_label === 'intro' && firstDuration > 10) {
    sections[0].section_label = 'verse';
    sections[0].label_reason = 'Too long for intro';
    logger.info('[SemanticLabeler] Fixed: Intro too long, changed to verse');
  }

  const lastIdx = sections.length - 1;
  const lastDuration =
    (sections[lastIdx]?.time_range?.end_time || 0) -
    (sections[lastIdx]?.time_range?.start_time || 0);
  if (sections[lastIdx]?.section_label === 'outro' && lastDuration < 2) {
    sections[lastIdx].section_label = 'ending';
    logger.info('[SemanticLabeler] Fixed: Outro too short, changed to ending');
  }

  // Fix 3: No orphan pre-choruses (must be between verse and chorus)
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].section_label === 'pre-chorus') {
      const prev = i > 0 ? sections[i - 1] : null;
      const next = i < sections.length - 1 ? sections[i + 1] : null;

      const validPrev =
        prev && (prev.section_label === 'verse' || prev.section_label === 'pre-chorus');
      const validNext = next && next.section_label === 'chorus';

      if (!validPrev || !validNext) {
        sections[i].section_label = 'verse';
        sections[i].label_reason = 'Invalid pre-chorus context';
        logger.info(`[SemanticLabeler] Fixed: Orphan pre-chorus at index ${i}`);
      }
    }
  }

  // Fix 4: Consecutive identical labels get merged or re-labeled
  for (let i = 0; i < sections.length - 1; i++) {
    const curr = sections[i];
    const next = sections[i + 1];

    if (
      curr.section_label === next.section_label &&
      curr.section_label !== 'chorus' &&
      curr.section_label !== 'verse'
    ) {
      const durationA = (curr.time_range?.end_time || 0) - (curr.time_range?.start_time || 0);
      const durationB = (next.time_range?.end_time || 0) - (next.time_range?.start_time || 0);

      // Small sections - mark for potential merge
      if (durationA + durationB < 5) {
        curr.should_merge = true;
        logger.warn(
          `[SemanticLabeler] Warning: Consecutive ${curr.section_label} sections (${i}, ${i + 1}) should be reviewed`,
        );
      }
    }
  }
}

// Legacy function for backward compatibility
function clusterSections(sections) {
  const groups = {};
  const processed = new Set();
  let groupId = 'A';

  for (let i = 0; i < sections.length; i++) {
    if (processed.has(i)) continue;

    const currentSection = sections[i];
    const currentChroma = currentSection.semantic_signature?.chroma_features;

    if (!currentChroma) {
      groups[groupId] = [currentSection];
      processed.add(i);
      groupId = String.fromCharCode(groupId.charCodeAt(0) + 1);
      continue;
    }

    const group = [currentSection];
    processed.add(i);

    for (let j = i + 1; j < sections.length; j++) {
      if (processed.has(j)) continue;

      const otherSection = sections[j];
      const otherChroma = otherSection.semantic_signature?.chroma_features;

      if (!otherChroma) continue;

      const similarity = calculateChromaSimilarity(currentChroma, otherChroma);

      if (similarity > 0.65) {
        // Use new threshold
        group.push(otherSection);
        processed.add(j);
      }
    }

    groups[groupId] = group;
    groupId = String.fromCharCode(groupId.charCodeAt(0) + 1);
  }

  return groups;
}

function calculateChromaSimilarity(chroma1, chroma2) {
  return cosineSimilarity(chroma1, chroma2);
}

module.exports = {
  labelSectionsWithSemantics,
  clusterSectionsImproved,
  labelSectionsEnhanced,
  calculateSectionSimilarity,
  clusterSections, // Legacy
  assignFunctionalLabels: labelSectionsWithSemantics, // Legacy alias
};
