/**
 * Structural Function Labeling Engine
 * Implements clustering-based semantic labeling for Verse/Chorus/Bridge identification
 */

const SECTION_PRIORITY = [
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'bridge',
  'middle8',
  'solo',
  'instrumental',
  'breakdown',
  'outro',
];

const MIN_CHORUS_SECONDS = 12;
const CHROMA_SIMILARITY_THRESHOLD = 0.9;

/**
 * Main function: Apply structural function labeling to sections
 * @param {Array} sections - Raw sections from architect
 * @param {Object} metadata - Analysis metadata
 * @returns {Array} Sections with functional labels applied
 */
function labelSectionsWithSemantics(sections = [], metadata = {}) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return sections;
  }

  // Clone sections to avoid mutation
  const clones = sections.map((section) => ({
    ...section,
    semantic_signature: {
      ...(section.semantic_signature || {}),
      architect_label: section.semantic_signature?.architect_label || section.section_label,
    },
  }));

  // Apply new clustering-based functional labeling
  const functionallyLabeled = assignFunctionalLabels(clones, metadata);

  // Normalize variants for consistent numbering
  normalizeVariants(functionallyLabeled);

  return functionallyLabeled;
}

/**
 * Task 1: Cluster sections based on chroma similarity
 * @param {Array} sections - Sections to cluster
 * @returns {Object} Map of groups: { 'A': [section1, section3], 'B': [section2, section4] }
 */
function clusterSections(sections) {
  const groups = {};
  const processed = new Set();
  let groupId = 'A';

  for (let i = 0; i < sections.length; i++) {
    if (processed.has(i)) continue;

    const currentSection = sections[i];
    const currentChroma = currentSection.semantic_signature?.chroma_features;

    if (!currentChroma) {
      // No chroma data, create singleton group
      groups[groupId] = [currentSection];
      processed.add(i);
      groupId = String.fromCharCode(groupId.charCodeAt(0) + 1);
      continue;
    }

    const group = [currentSection];
    processed.add(i);

    // Find similar sections
    for (let j = i + 1; j < sections.length; j++) {
      if (processed.has(j)) continue;

      const otherSection = sections[j];
      const otherChroma = otherSection.semantic_signature?.chroma_features;

      if (!otherChroma) continue;

      // Calculate chroma similarity (cosine similarity)
      const similarity = calculateChromaSimilarity(currentChroma, otherChroma);

      if (similarity > CHROMA_SIMILARITY_THRESHOLD) {
        group.push(otherSection);
        processed.add(j);
      }
    }

    groups[groupId] = group;
    groupId = String.fromCharCode(groupId.charCodeAt(0) + 1);
  }

  return groups;
}

/**
 * Calculate cosine similarity between two chroma feature vectors
 * @param {Array} chroma1 - First chroma vector
 * @param {Array} chroma2 - Second chroma vector
 * @returns {number} Similarity score (0-1)
 */
function calculateChromaSimilarity(chroma1, chroma2) {
  if (!chroma1 || !chroma2 || chroma1.length !== chroma2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < chroma1.length; i++) {
    dotProduct += chroma1[i] * chroma2[i];
    norm1 += chroma1[i] * chroma1[i];
    norm2 += chroma2[i] * chroma2[i];
  }

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Task 2: Logic Engine - Assign functional labels based on clustering and context
 * @param {Array} sections - Sections to label
 * @param {Object} metadata - Analysis metadata
 * @returns {Array} Sections with functional labels
 */
function assignFunctionalLabels(sections, metadata) {
  const totalDuration =
    metadata.duration_seconds ||
    sections.reduce((max, section) => Math.max(max, section.time_range?.end_time || 0), 0);

  // Step 1: Cluster sections by chroma similarity
  const groups = clusterSections(sections);

  // Step 2: Calculate group statistics
  const groupStats = calculateGroupStats(groups, sections);

  // Step A: Find Chorus group and label individual sections within it
  const chorusGroupId = findChorusGroup(groupStats);
  if (chorusGroupId) {
    labelChorusSections(groups[chorusGroupId]);
  }

  // Step B: Find Verse group (predecessor to Chorus) and label it
  const verseGroupId = findVerseGroup(groups, chorusGroupId, sections);
  if (verseGroupId) {
    applyGroupLabel(groups[verseGroupId], 'verse', 'Most frequent predecessor to chorus');
  }

  // Step C: Find Pre-Chorus (short sections sandwiching Verse-Chorus)
  findPreChorusSections(
    sections,
    chorusGroupId ? groups[chorusGroupId] : [],
    verseGroupId ? groups[verseGroupId] : [],
  );

  // Step D: Handle remaining unlabeled sections (time-based intro/outro detection)
  labelRemainingSections(sections, totalDuration);

  // Step E: Find Bridge (unique section after first chorus, but not intro/outro)
  findBridgeSection(sections, chorusGroupId ? groups[chorusGroupId] : []);

  // Step F: Find Solos/Instrumentals based on vocal probability and energy
  findInstrumentalSections(sections, totalDuration);

  // Step G: Label any remaining vocal sections as verses
  sections.forEach((section) => {
    if (!section.section_label && section.semantic_signature?.vocal_probability > 0.4) {
      applySemanticLabel(section, 'verse', 0.5, 'Remaining vocal section');
    }
  });

  return sections;
}

/**
 * Calculate statistics for each group
 * @param {Object} groups - Grouped sections
 * @param {Array} allSections - All sections
 * @returns {Object} Group statistics
 */
function calculateGroupStats(groups, allSections) {
  const stats = {};

  Object.keys(groups).forEach((groupId) => {
    const groupSections = groups[groupId];
    const repetitionCount = groupSections.length;

    // Calculate average RMS energy
    const totalRMS = groupSections.reduce((sum, section) => {
      return sum + (section.semantic_signature?.avg_rms || 0);
    }, 0);
    const averageRMS = totalRMS / repetitionCount;

    // Calculate average vocal probability
    const totalVocalProb = groupSections.reduce((sum, section) => {
      return sum + (section.semantic_signature?.vocal_probability || 0);
    }, 0);
    const averageVocalProb = totalVocalProb / repetitionCount;

    stats[groupId] = {
      id: groupId,
      repetitionCount,
      averageRMS,
      averageVocalProb,
      sections: groupSections,
      score: repetitionCount * 2.0 + averageRMS * 1.0, // Chorus scoring formula
    };
  });

  return stats;
}

/**
 * Step A: Find Chorus group and label individual sections within it
 * @param {string} chorusGroupId - ID of the chorus group
 * @param {Object} groupStats - Group statistics
 * @returns {string|null} Chorus group ID
 */
function findChorusGroup(groupStats) {
  let bestGroup = null;
  let bestScore = -1;

  Object.values(groupStats).forEach((stat) => {
    // Must have vocals and meet minimum duration
    const hasVocals = stat.averageVocalProb > 0.3;
    const meetsDuration = stat.sections.some(
      (section) => (section.semantic_signature?.duration_seconds || 0) >= MIN_CHORUS_SECONDS,
    );

    if (hasVocals && meetsDuration && stat.score > bestScore) {
      bestScore = stat.score;
      bestGroup = stat.id;
    }
  });

  return bestGroup;
}

/**
 * Label chorus sections within the chorus group (highest scoring individual sections)
 * @param {Array} chorusGroupSections - Sections in the chorus group
 */
function labelChorusSections(chorusGroupSections) {
  if (!chorusGroupSections || chorusGroupSections.length === 0) return;

  // Calculate individual scores for sections in chorus group
  const sectionScores = chorusGroupSections.map((section) => {
    const repetition = section.semantic_signature?.repetition_score || 0;
    const energy = section.semantic_signature?.avg_rms || 0;
    const score = repetition * 2.0 + energy * 1.0;
    return { section, score };
  });

  // Sort by score descending
  sectionScores.sort((a, b) => b.score - a.score);

  // Label top sections as choruses (at least 1, up to all if they have similar scores)
  const topScore = sectionScores[0].score;
  const threshold = topScore * 0.8; // 80% of top score

  sectionScores.forEach(({ section, score }) => {
    if (score >= threshold) {
      applySemanticLabel(section, 'chorus', 0.9, 'High repetition and energy within chorus group');
    }
  });
}

/**
 * Step B: Find Verse groups (other vocal groups that aren't chorus)
 * @param {Object} groups - All groups
 * @param {Object} groupStats - Group statistics
 * @param {string} chorusGroupId - Chorus group ID
 * @returns {Array} Array of verse group IDs
 */
function findVerseGroups(groups, groupStats, chorusGroupId) {
  const verseGroups = [];

  Object.keys(groupStats).forEach((groupId) => {
    if (groupId === chorusGroupId) return;

    const stat = groupStats[groupId];
    // Must have vocals but lower score than chorus
    if (stat.averageVocalProb > 0.3) {
      verseGroups.push(groupId);
    }
  });

  return verseGroups;
}

/**
 * Step B: Find Verse group (most frequent predecessor to Chorus)
 * @param {Object} groups - All groups
 * @param {string} chorusGroupId - Chorus group ID
 * @param {Array} allSections - All sections
 * @returns {string|null} Verse group ID
 */
function findVerseGroup(groups, chorusGroupId, allSections) {
  if (!chorusGroupId) return null;

  const chorusSections = groups[chorusGroupId];
  const predecessorCounts = {};

  // Count what comes before each chorus
  chorusSections.forEach((chorusSection) => {
    const chorusIndex = allSections.indexOf(chorusSection);
    if (chorusIndex > 0) {
      const predecessor = allSections[chorusIndex - 1];
      if (predecessor && !predecessor.section_label) {
        // Find which group this predecessor belongs to
        Object.keys(groups).forEach((groupId) => {
          if (groups[groupId].includes(predecessor)) {
            predecessorCounts[groupId] = (predecessorCounts[groupId] || 0) + 1;
          }
        });
      }
    }
  });

  // Find group with highest predecessor count
  let bestGroup = null;
  let maxCount = 0;

  Object.keys(predecessorCounts).forEach((groupId) => {
    if (predecessorCounts[groupId] > maxCount) {
      maxCount = predecessorCounts[groupId];
      bestGroup = groupId;
    }
  });

  return bestGroup;
}

/**
 * Step C: Find Pre-Chorus sections (short sections sandwiching Verse-Chorus)
 * @param {Array} allSections - All sections
 * @param {Array} chorusSections - Chorus sections
 * @param {Array} verseSections - Verse sections
 */
function findPreChorusSections(allSections, chorusSections, verseSections) {
  const chorusIndices = new Set(chorusSections.map((s) => allSections.indexOf(s)));
  const verseIndices = new Set(verseSections.map((s) => allSections.indexOf(s)));

  allSections.forEach((section, index) => {
    if (section.section_label) return;

    // Check if this section is short (< 8 bars)
    const durationBars =
      section.time_range?.duration_bars ||
      (section.time_range?.end_time - section.time_range?.start_time) * 2 ||
      0;

    if (durationBars >= 8) return;

    // Check if it sandwiches verse and chorus
    const nextSection = allSections[index + 1];
    const prevSection = allSections[index - 1];

    const nextIsChorus = nextSection && chorusIndices.has(index + 1);
    const prevIsVerse = prevSection && verseIndices.has(index - 1);

    if (nextIsChorus && prevIsVerse) {
      applySemanticLabel(section, 'pre-chorus', 0.85, 'Short section sandwiching verse and chorus');
    }
  });
}

/**
 * Step E: Find Bridge (unique section after first chorus, but not intro/outro)
 * @param {Array} allSections - All sections
 * @param {Array} chorusSections - Chorus sections
 */
function findBridgeSection(allSections, chorusSections) {
  if (chorusSections.length < 2) return;

  // Sort choruses by time
  const sortedChoruses = [...chorusSections].sort(
    (a, b) => (a.time_range?.start_time || 0) - (b.time_range?.start_time || 0),
  );

  const firstChorus = sortedChoruses[0];
  const firstChorusIndex = allSections.indexOf(firstChorus);

  // Look for unique sections after the first chorus (but not too late in track)
  for (let i = firstChorusIndex + 1; i < allSections.length; i++) {
    const section = allSections[i];
    if (section.section_label) continue; // Skip already labeled sections

    const startTime = section.time_range?.start_time || 0;
    const totalDuration = allSections[allSections.length - 1]?.time_range?.end_time || 1;
    const positionRatio = startTime / totalDuration;

    // Skip intro/outro positions
    if (positionRatio < 0.15 || positionRatio > 0.85) continue;

    // Check if it's unique (low repetition score)
    const repetitionScore = section.semantic_signature?.repetition_score || 0;
    const isUnique = repetitionScore < 0.3;

    // Check if it's different from verses (different chroma)
    const isDifferentFromVerses = !allSections.some(
      (s) =>
        s.section_label === 'verse' &&
        calculateChromaSimilarity(
          s.semantic_signature?.chroma_features,
          section.semantic_signature?.chroma_features,
        ) > CHROMA_SIMILARITY_THRESHOLD,
    );

    if (isUnique && isDifferentFromVerses) {
      applySemanticLabel(section, 'bridge', 0.75, 'Unique section after first chorus');
      break; // Only label one bridge
    }
  }
}

/**
 * Step E: Find Solos/Instrumentals based on vocal probability and energy
 * @param {Array} allSections - All sections
 * @param {number} totalDuration - Total track duration
 */
function findInstrumentalSections(allSections, totalDuration) {
  allSections.forEach((section, index) => {
    if (section.section_label) return;

    const sig = section.semantic_signature || {};
    const vocalProb = sig.vocal_probability || 0;
    const energy = sig.avg_rms || 0;
    const startTime = section.time_range?.start_time || 0;
    const positionRatio = startTime / totalDuration;

    // Skip time-based sections (let labelRemainingSections handle them)
    if (positionRatio < 0.15 || positionRatio > 0.85) return;
  });
}

/**
 * Handle remaining unlabeled sections with time-based heuristics
 * @param {Array} sections - All sections
 * @param {number} totalDuration - Total track duration
 */
function labelRemainingSections(sections, totalDuration) {
  sections.forEach((section, index) => {
    if (section.section_label) return; // Don't override existing labels

    const startTime = section.time_range?.start_time || 0;
    const positionRatio = startTime / totalDuration;
    const duration =
      section.semantic_signature?.duration_seconds ||
      section.time_range?.end_time - section.time_range?.start_time ||
      0;

    // Time-based rules
    if (positionRatio < 0.15 && duration < 30) {
      // Early and short = intro
      applySemanticLabel(section, 'intro', 0.7, 'Early short section');
    } else if (positionRatio > 0.85) {
      // Late in track = outro
      applySemanticLabel(section, 'outro', 0.7, 'Late section in track');
    } else if (section.semantic_signature?.vocal_probability < 0.3) {
      // Mid-track instrumental
      applySemanticLabel(section, 'instrumental', 0.5, 'Mid-track instrumental section');
    }
    // Leave vocal sections unlabeled for now - they might be verses or other structures
  });
}

/**
 * Apply label to all sections in a group
 * @param {Array} groupSections - Sections in the group
 * @param {string} label - Label to apply
 * @param {string} reason - Reason for labeling
 */
function applyGroupLabel(groupSections, label, reason) {
  groupSections.forEach((section) => {
    if (!section.section_label) {
      applySemanticLabel(section, label, 0.9, reason);
    }
  });
}

/**
 * Apply semantic label to a single section
 * @param {Object} section - Section to label
 * @param {string} label - Label to apply
 * @param {number} confidence - Confidence score
 * @param {string} reason - Reason for labeling
 */
function applySemanticLabel(section, label, confidence, reason) {
  if (!section || section.section_label === label) return;

  section.section_label = label;
  section.section_variant = 1; // Will be normalized later
  section.semantic_signature = section.semantic_signature || {};
  section.semantic_signature.semantic_label = {
    label,
    confidence,
    reason,
  };
}

/**
 * Normalize section variants for consistent numbering
 * @param {Array} sections - Sections to normalize
 */
function normalizeVariants(sections) {
  const counters = new Map();
  sections.forEach((section) => {
    const label = section.section_label || 'section';
    const count = (counters.get(label) || 0) + 1;
    counters.set(label, count);
    section.section_variant = count;
  });
}

module.exports = {
  labelSectionsWithSemantics,
  clusterSections,
  assignFunctionalLabels,
};
