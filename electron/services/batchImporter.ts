import fs from 'fs';
import path from 'path';
const logger = require('../analysis/logger');

type DiscoveredFile = {
  path: string;
  type: 'audio' | 'json' | 'midi' | 'lab' | 'lyrics';
  dataset?: string;
  metadata?: {
    title?: string;
    artist?: string;
    bpm?: number;
    key?: string;
    sections?: any[];
    chords?: any[];
  };
};

type MatchedGroup = {
  audio?: DiscoveredFile;
  json?: DiscoveredFile;
  midi?: DiscoveredFile;
  lab?: DiscoveredFile;
  lyrics?: DiscoveredFile;
  title?: string;
  artist?: string;
  confidence: number;
};

/**
 * Parse McGill/SALAMI JSON format
 */
function parseMcGillFormat(jsonData: any): any {
  return {
    title: jsonData.title || '',
    artist: jsonData.artist || '',
    bpm: jsonData.bpm || null,
    key: null,
    sections: (jsonData.sections || []).map((s: any) => ({
      start_time: s.start_ms / 1000,
      end_time: (s.start_ms + s.duration_ms) / 1000,
      section_label: s.sectionLabel || s.sectionType || 'unknown',
      chords: s.chords || [],
    })),
    chords:
      jsonData.sections?.flatMap((s: any) =>
        (s.chords || []).map((c: string, idx: number) => ({
          timestamp: (s.start_ms + (idx * s.duration_ms) / (s.chords?.length || 1)) / 1000,
          chord: c,
        })),
      ) || [],
  };
}

/**
 * Parse Nottingham/JAMS format
 */
function parseNottinghamFormat(jsonData: any): any {
  return {
    title: jsonData.title || '',
    artist: jsonData.artist || 'Unknown Artist',
    bpm: jsonData.bpm || null,
    key: jsonData.key || null,
    sections: (jsonData.sections || []).map((s: any) => ({
      start_time: s.start_ms / 1000,
      end_time: (s.start_ms + s.duration_ms) / 1000,
      section_label: s.sectionLabel || 'unknown',
      chords: s.chords || [],
    })),
    chords:
      jsonData.sections?.flatMap((s: any) =>
        (s.chords || []).map((c: string, idx: number) => ({
          timestamp: (s.start_ms + (idx * s.duration_ms) / (s.chords?.length || 1)) / 1000,
          chord: c,
        })),
      ) || [],
  };
}

/**
 * Parse Rock Corpus .jcrd format
 */
function parseRockCorpusFormat(jsonData: any): any {
  const metadata = jsonData.metadata || {};
  return {
    title: metadata.title || '',
    artist: metadata.artist || 'Unknown',
    bpm: metadata.tempo || null,
    key: metadata.key || null,
    sections: [],
    chords: (jsonData.chords || []).map((c: any) => ({
      timestamp: c.time,
      duration: c.duration,
      chord: c.chord,
    })),
  };
}

/**
 * Parse Mozart .jcrd.json format
 */
function parseMozartFormat(jsonData: any): any {
  const metadata = jsonData.metadata || {};
  return {
    title: jsonData.title || metadata.title || '',
    artist: jsonData.artist || metadata.artist || 'Unknown',
    bpm: jsonData.bpm || metadata.tempo || null,
    key: jsonData.key || metadata.key || null,
    sections: (jsonData.sections || []).map((s: any) => ({
      start_time: s.start_ms / 1000,
      end_time: (s.start_ms + s.duration_ms) / 1000,
      section_label: s.sectionLabel || 'unknown',
      chords: s.chords || [],
    })),
    chords: (jsonData.chords || []).map((c: any) => ({
      timestamp: c.time,
      duration: c.duration,
      chord: c.chord,
    })),
  };
}

/**
 * Parse Isophonics .lab format
 * Format: "Start End Label" (space-separated, one per line)
 */
function parseLabFile(filePath: string): any {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim());

    const sections: any[] = [];
    const chords: any[] = [];
    let detectedKey: string | null = null;

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const start = parseFloat(parts[0]);
        const end = parseFloat(parts[1]);
        const label = parts.slice(2).join(' ').trim();

        if (isNaN(start) || isNaN(end)) continue;

        // Detect key annotations
        if (label.toLowerCase() === 'key' && parts.length >= 4) {
          detectedKey = parts[3] || null;
          continue;
        }

        // Skip silence markers
        if (label.toLowerCase() === 'silence') continue;

        // Check if it's a chord label (common patterns)
        const isChord =
          /^[A-G][#b]?[0-9]*(m|min|maj|dim|aug|sus|add)?[0-9]*(\/[A-G][#b]?)?$/i.test(label) ||
          /^[IVX]+[0-9]*$/i.test(label) || // Roman numerals
          /^[A-G][#b]?(:|$)/i.test(label); // Simple chord notation

        if (isChord) {
          chords.push({
            timestamp: start,
            duration: end - start,
            chord: label,
          });
        } else {
          // Treat as section label
          sections.push({
            start_time: start,
            end_time: end,
            section_label: label,
            chords: [],
          });
        }
      }
    }

    // Extract title from filename
    const filename = path.basename(filePath, path.extname(filePath));

    return {
      title: filename,
      artist: '',
      bpm: null,
      key: detectedKey,
      sections,
      chords,
    };
  } catch (err) {
    logger.error(`[BatchImporter] Failed to parse LAB file: ${filePath}`, err);
    return null;
  }
}

/**
 * Detect and parse JSON format
 */
function parseJSONFile(filePath: string): any {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(content);

    // Detect format by structure
    if (
      jsonData.sections &&
      Array.isArray(jsonData.sections) &&
      jsonData.sections[0]?.start_ms !== undefined
    ) {
      // McGill/SALAMI format
      if (jsonData.source?.includes('McGill') || jsonData.source?.includes('SALAMI')) {
        return parseMcGillFormat(jsonData);
      }
      // Nottingham format
      if (jsonData.source?.includes('JAMS') || jsonData.partition === 'nottingham') {
        return parseNottinghamFormat(jsonData);
      }
      // Generic format with sections (including .jcrd.json)
      return parseNottinghamFormat(jsonData);
    }

    // Rock Corpus / Mozart format
    if (jsonData.metadata && jsonData.chords) {
      if (jsonData.metadata.source_format?.includes('Rock Corpus')) {
        return parseRockCorpusFormat(jsonData);
      }
      return parseMozartFormat(jsonData);
    }

    // Check for .jcrd.json format (has sections with start_ms)
    if (
      jsonData.sections &&
      Array.isArray(jsonData.sections) &&
      jsonData.sections[0]?.start_ms !== undefined
    ) {
      return parseMozartFormat(jsonData);
    }

    // Fallback: try to extract basic info
    return {
      title: jsonData.title || jsonData.metadata?.title || '',
      artist: jsonData.artist || jsonData.metadata?.artist || 'Unknown',
      bpm: jsonData.bpm || jsonData.metadata?.tempo || null,
      key: jsonData.key || jsonData.metadata?.key || null,
      sections: [],
      chords: [],
    };
  } catch (err) {
    logger.error(`[BatchImporter] Failed to parse JSON: ${filePath}`, err);
    return null;
  }
}

/**
 * Normalize filename for matching (remove extensions, special chars, lowercase)
 */
function normalizeFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '') // Remove extension
    .replace(/[^a-zA-Z0-9]/g, '') // Remove special chars
    .toLowerCase()
    .trim();
}

/**
 * Calculate similarity between two strings (simple Levenshtein-like)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeFilename(str1);
  const s2 = normalizeFilename(str2);
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // Simple substring matching
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.includes(shorter)) return 0.7;

  return 0.3; // Low confidence for partial matches
}

/**
 * Scan library directory and discover files
 */
export function scanLibraryDirectory(libraryRoot: string): {
  files: DiscoveredFile[];
  datasets: Record<string, number>;
} {
  const files: DiscoveredFile[] = [];
  const datasets: Record<string, number> = {};

  if (!fs.existsSync(libraryRoot)) {
    return { files, datasets };
  }

  // Scan audio directory
  const audioDir = path.join(libraryRoot, 'audio');
  if (fs.existsSync(audioDir)) {
    scanDirectory(audioDir, 'audio', files, datasets);
  }

  // Scan JSON directory
  const jsonDir = path.join(libraryRoot, 'json');
  if (fs.existsSync(jsonDir)) {
    scanDirectory(jsonDir, 'json', files, datasets);
  }

  // Scan MIDI directory
  const midiDir = path.join(libraryRoot, 'midi');
  if (fs.existsSync(midiDir)) {
    scanDirectory(midiDir, 'midi', files, datasets);
  }

  // Scan lyrics directory (if exists)
  const lyricsDir = path.join(libraryRoot, 'lyrics');
  if (fs.existsSync(lyricsDir)) {
    scanDirectory(lyricsDir, 'lyrics', files, datasets);
  }

  // Also scan for lyrics files in audio/json directories (if they exist)
  if (fs.existsSync(audioDir)) {
    scanDirectory(audioDir, 'lyrics', files, datasets);
  }
  if (fs.existsSync(jsonDir)) {
    scanDirectory(jsonDir, 'lyrics', files, datasets);
  }

  return { files, datasets };
}

/**
 * Recursively scan directory for files
 */
function scanDirectory(
  dir: string,
  type: 'audio' | 'json' | 'midi' | 'lyrics',
  files: DiscoveredFile[],
  datasets: Record<string, number>,
  datasetName?: string,
) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Track dataset name from directory structure
        const newDataset = datasetName || entry.name;
        scanDirectory(fullPath, type, files, datasets, newDataset);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        if (type === 'audio' && ['.mp3', '.wav', '.flac', '.m4a', '.ogg'].includes(ext)) {
          files.push({
            path: fullPath,
            type: 'audio',
            dataset: datasetName,
          });
          if (datasetName) datasets[datasetName] = (datasets[datasetName] || 0) + 1;
        } else if (type === 'json' && ext === '.json') {
          // Check if it's a .jcrd.json file (double extension)
          const baseName = path.basename(fullPath, '.json');
          const isJcrdJson = baseName.endsWith('.jcrd');

          const metadata = parseJSONFile(fullPath);
          files.push({
            path: fullPath,
            type: 'json',
            dataset: datasetName,
            metadata: metadata || undefined,
          });
          if (datasetName) datasets[datasetName] = (datasets[datasetName] || 0) + 1;
        } else if (type === 'json' && ext === '.jcrd') {
          const metadata = parseJSONFile(fullPath);
          files.push({
            path: fullPath,
            type: 'json',
            dataset: datasetName,
            metadata: metadata || undefined,
          });
          if (datasetName) datasets[datasetName] = (datasets[datasetName] || 0) + 1;
        } else if (type === 'json' && ext === '.lab') {
          const metadata = parseLabFile(fullPath);
          files.push({
            path: fullPath,
            type: 'lab',
            dataset: datasetName,
            metadata: metadata || undefined,
          });
          if (datasetName) datasets[datasetName] = (datasets[datasetName] || 0) + 1;
        } else if (type === 'midi' && ['.mid', '.midi'].includes(ext)) {
          files.push({
            path: fullPath,
            type: 'midi',
            dataset: datasetName,
          });
          if (datasetName) datasets[datasetName] = (datasets[datasetName] || 0) + 1;
        } else if (type === 'lyrics' && ['.txt', '.lrc', '.lyrics'].includes(ext)) {
          // Try to parse lyrics file for metadata
          let metadata = null;
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            // Simple heuristic: if it looks like LRC format, extract title/artist from filename
            if (content.includes('[') && content.includes(']')) {
              // LRC format - metadata from filename
              metadata = {
                title: path.basename(fullPath, ext),
                artist: '',
              };
            } else {
              // Plain text - metadata from filename
              metadata = {
                title: path.basename(fullPath, ext),
                artist: '',
              };
            }
          } catch (e) {
            // Ignore parse errors
          }

          files.push({
            path: fullPath,
            type: 'lyrics',
            dataset: datasetName,
            metadata: metadata || undefined,
          });
          if (datasetName) datasets[datasetName] = (datasets[datasetName] || 0) + 1;
        }
      }
    }
  } catch (err) {
    logger.error(`[BatchImporter] Error scanning ${dir}:`, err);
  }
}

/**
 * Match files together by filename similarity and metadata
 */
export function matchFiles(files: DiscoveredFile[]): MatchedGroup[] {
  const groups: MatchedGroup[] = [];
  const processed = new Set<string>();

  // Group by dataset first
  const byDataset: Record<string, DiscoveredFile[]> = {};
  for (const file of files) {
    const dataset = file.dataset || 'unknown';
    if (!byDataset[dataset]) byDataset[dataset] = [];
    byDataset[dataset].push(file);
  }

  // Try to match files within each dataset
  for (const [dataset, datasetFiles] of Object.entries(byDataset)) {
    const audioFiles = datasetFiles.filter((f) => f.type === 'audio');
    const jsonFiles = datasetFiles.filter((f) => f.type === 'json');
    const midiFiles = datasetFiles.filter((f) => f.type === 'midi');
    const labFiles = datasetFiles.filter((f) => f.type === 'lab');
    const lyricsFiles = datasetFiles.filter((f) => f.type === 'lyrics');

    logger.info(
      `[BatchImporter] Dataset "${dataset}": ${audioFiles.length} audio, ${jsonFiles.length} json, ${midiFiles.length} midi, ${labFiles.length} lab, ${lyricsFiles.length} lyrics`,
    );

    // Match audio files with JSON/MIDI/LAB files
    for (const audio of audioFiles) {
      const audioName = path.basename(audio.path, path.extname(audio.path));
      let bestMatch: MatchedGroup = {
        audio,
        confidence: 0.5,
      };

      // Try to find matching JSON file
      for (const json of jsonFiles) {
        const jsonName = path.basename(json.path, path.extname(json.path));
        const similarity = calculateSimilarity(audioName, jsonName);

        if (similarity > bestMatch.confidence) {
          bestMatch.json = json;
          bestMatch.confidence = similarity;
          if (json.metadata) {
            bestMatch.title = json.metadata.title || bestMatch.title;
            bestMatch.artist = json.metadata.artist || bestMatch.artist;
          }
        }
      }

      // Try to find matching MIDI file
      for (const midi of midiFiles) {
        const midiName = path.basename(midi.path, path.extname(midi.path));
        const similarity = calculateSimilarity(audioName, midiName);

        if (similarity > 0.6) {
          bestMatch.midi = midi;
          bestMatch.confidence = Math.max(bestMatch.confidence, similarity);
        }
      }

      // Try to find matching LAB file
      for (const lab of labFiles) {
        const labName = path.basename(lab.path, path.extname(lab.path));
        const similarity = calculateSimilarity(audioName, labName);

        if (similarity > 0.6) {
          bestMatch.lab = lab;
          bestMatch.confidence = Math.max(bestMatch.confidence, similarity);
        }
      }

      // Try to find matching lyrics file
      for (const lyrics of lyricsFiles) {
        const lyricsName = path.basename(lyrics.path, path.extname(lyrics.path));
        const similarity = calculateSimilarity(audioName, lyricsName);

        if (similarity > 0.6) {
          bestMatch.lyrics = lyrics;
          bestMatch.confidence = Math.max(bestMatch.confidence, similarity);
        }
      }

      if (!processed.has(audio.path)) {
        groups.push(bestMatch);
        processed.add(audio.path);
      }
    }

    // Add unmatched JSON files (reference datasets)
    for (const json of jsonFiles) {
      if (!processed.has(json.path)) {
        groups.push({
          json,
          title: json.metadata?.title,
          artist: json.metadata?.artist,
          confidence: 0.3, // Lower confidence for unmatched files
        });
        processed.add(json.path);
      }
    }

    // Add unmatched MIDI files
    for (const midi of midiFiles) {
      if (!processed.has(midi.path)) {
        groups.push({
          midi,
          confidence: 0.3,
        });
        processed.add(midi.path);
      }
    }
  }

  return groups;
}

/**
 * Get dataset statistics
 */
export function getDatasetStats(libraryRoot: string): Record<string, any> {
  const { files, datasets } = scanLibraryDirectory(libraryRoot);
  const stats: Record<string, any> = {};

  for (const [dataset, count] of Object.entries(datasets)) {
    const datasetFiles = files.filter((f) => f.dataset === dataset);
    stats[dataset] = {
      totalFiles: count,
      audio: datasetFiles.filter((f) => f.type === 'audio').length,
      json: datasetFiles.filter((f) => f.type === 'json').length,
      midi: datasetFiles.filter((f) => f.type === 'midi').length,
      lab: datasetFiles.filter((f) => f.type === 'lab').length,
      lyrics: datasetFiles.filter((f) => f.type === 'lyrics').length,
    };
  }

  return stats;
}

export default {
  scanLibraryDirectory,
  matchFiles,
  getDatasetStats,
};
