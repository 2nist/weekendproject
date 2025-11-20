/**
 * Step 0: Metadata Lookup System
 * Gathers context before analysis begins, including user hints
 */

function gatherMetadata(filePath, userHints = {}) {
  const metadata = {
    file_path: filePath,
    analysis_timestamp: new Date().toISOString(),
    engine_version: '1.0.0',
    confidence_threshold: userHints.confidence_threshold || 0.65,
  };

  // User-provided hints (critical for non-stereotypical forms)
  if (userHints.genre) {
    metadata.genre_hint = userHints.genre;
  }

  if (userHints.expected_form) {
    metadata.expected_form = userHints.expected_form; // e.g., "Verse-Chorus", "AABA"
  }

  if (userHints.key_hint) {
    metadata.key_hint = userHints.key_hint; // e.g., "C", "G"
  }

  if (userHints.mode_hint) {
    metadata.mode_hint = userHints.mode_hint; // e.g., "ionian", "dorian"
  }

  if (userHints.harmonic_complexity !== undefined) {
    metadata.harmonic_complexity_hint = userHints.harmonic_complexity; // 0-100
  }

  if (userHints.tempo_hint) {
    const parsedTempo = parseFloat(userHints.tempo_hint);
    if (!Number.isNaN(parsedTempo) && parsedTempo > 0) {
      metadata.tempo_hint = parsedTempo;
    }
  }

  // TODO: Future integration with music metadata APIs
  // - Query song title, artist, album
  // - Historical analysis data lookup
  // - Genre detection from metadata

  return metadata;
}

module.exports = {
  gatherMetadata,
};

