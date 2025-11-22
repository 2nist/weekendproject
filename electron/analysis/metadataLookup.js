/**
 * Step 0: Metadata Lookup System
 * Gathers context before analysis begins, including user hints and ID3 tags
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Read ID3 tags from audio file using music-metadata
 * Falls back gracefully if library is not available
 */
async function readID3Tags(filePath) {
  try {
    // Try to load music-metadata
    const mm = require('music-metadata');
    if (!mm || !fs.existsSync(filePath)) {
      logger.debug('[Metadata] ⚠️ music-metadata not available or file not found, skipping ID3 read');
      return null;
    }

    logger.debug('[Metadata] 📖 Reading ID3 tags from:', path.basename(filePath));
    const metadata = await mm.parseFile(filePath);
    
    const id3Data = {
      title: metadata.common.title || null,
      artist: metadata.common.artist || (metadata.common.artists && metadata.common.artists[0]) || null,
      album: metadata.common.album || null,
      genre: metadata.common.genre && metadata.common.genre[0] || null,
      bpm: metadata.common.bpm ? Math.round(metadata.common.bpm) : null,
      key: metadata.common.key || null,
      year: metadata.common.year || null,
    };

    // Log what we found
    const found = [];
    if (id3Data.title) found.push(`Title: ${id3Data.title}`);
    if (id3Data.artist) found.push(`Artist: ${id3Data.artist}`);
    if (id3Data.bpm) found.push(`BPM: ${id3Data.bpm}`);
    if (id3Data.key) found.push(`Key: ${id3Data.key}`);
    if (id3Data.genre) found.push(`Genre: ${id3Data.genre}`);
    
    if (found.length > 0) {
      logger.pass0('[Metadata] ✅ Found ID3 tags:', found.join(', '));
    } else {
      logger.debug('[Metadata] ℹ️ No ID3 tags found in file');
    }

    return id3Data;
  } catch (error) {
    // Graceful fallback - don't crash if music-metadata fails
    logger.warn('[Metadata] ⚠️ Failed to read ID3 tags:', error.message);
    return null;
  }
}

/**
 * Extract key from ID3 key field (e.g., "C major" -> "C", "ionian")
 */
function parseKeyFromID3(keyString) {
  if (!keyString || typeof keyString !== 'string') return null;
  
  // Common formats: "C major", "Am", "A minor", "C", "1A" (key code)
  const keyMatch = keyString.match(/^([A-G][#b]?)/i);
  if (!keyMatch) return null;
  
  const root = keyMatch[1];
  const mode = keyString.toLowerCase().includes('minor') || keyString.toLowerCase().includes('m') 
    ? 'aeolian' 
    : 'ionian';
  
  return { root, mode };
}

async function gatherMetadata(filePath, userHints = {}) {
  logger.pass0('[Metadata] 🔵 Pass 0: Starting metadata lookup...');
  
  const metadata = {
    file_path: filePath,
    analysis_timestamp: new Date().toISOString(),
    engine_version: '1.0.0',
    confidence_threshold: userHints.confidence_threshold || 0.65,
  };

  // Read ID3 tags from file
  const id3Data = await readID3Tags(filePath);
  
  // Extract key from ID3 if available
  if (id3Data?.key) {
    const parsedKey = parseKeyFromID3(id3Data.key);
    if (parsedKey) {
      metadata.key_hint = parsedKey.root;
      metadata.mode_hint = parsedKey.mode;
      logger.pass0(`[Metadata] ✅ Found ID3 Key: ${parsedKey.root} ${parsedKey.mode}`);
    }
  }
  
  // Extract BPM from ID3 if available
  if (id3Data?.bpm) {
    metadata.tempo_hint = id3Data.bpm;
    logger.pass0(`[Metadata] ✅ Found ID3 BPM: ${id3Data.bpm}`);
  }
  
  // Extract genre from ID3 if available
  if (id3Data?.genre && !userHints.genre) {
    metadata.genre_hint = id3Data.genre.toLowerCase();
    logger.pass0(`[Metadata] ✅ Found ID3 Genre: ${id3Data.genre}`);
  }

  // User-provided hints (override ID3 tags)
  if (userHints.genre) {
    metadata.genre_hint = userHints.genre;
    logger.debug(`[Metadata] 📝 Using user-provided genre hint: ${userHints.genre}`);
  }

  if (userHints.expected_form) {
    metadata.expected_form = userHints.expected_form; // e.g., "Verse-Chorus", "AABA"
  }

  if (userHints.key_hint) {
    metadata.key_hint = userHints.key_hint; // e.g., "C", "G"
    logger.debug(`[Metadata] 📝 Using user-provided key hint: ${userHints.key_hint}`);
  }

  if (userHints.mode_hint) {
    metadata.mode_hint = userHints.mode_hint; // e.g., "ionian", "dorian"
    logger.debug(`[Metadata] 📝 Using user-provided mode hint: ${userHints.mode_hint}`);
  }

  if (userHints.harmonic_complexity !== undefined) {
    metadata.harmonic_complexity_hint = userHints.harmonic_complexity; // 0-100
  }

  if (userHints.tempo_hint) {
    const parsedTempo = parseFloat(userHints.tempo_hint);
    if (!Number.isNaN(parsedTempo) && parsedTempo > 0) {
      metadata.tempo_hint = parsedTempo;
      logger.debug(`[Metadata] 📝 Using user-provided tempo hint: ${parsedTempo}`);
    }
  }

  // Log final metadata summary
  const summary = [];
  if (metadata.key_hint) summary.push(`Key: ${metadata.key_hint}`);
  if (metadata.tempo_hint) summary.push(`BPM: ${metadata.tempo_hint}`);
  if (metadata.genre_hint) summary.push(`Genre: ${metadata.genre_hint}`);
  
  if (summary.length > 0) {
    logger.pass0(`[Metadata] ✅ Pass 0 Complete - Metadata: ${summary.join(', ')}`);
  } else {
    logger.pass0('[Metadata] ⚠️ Pass 0 Complete - No metadata found (using defaults)');
  }

  return metadata;
}

module.exports = {
  gatherMetadata,
};

