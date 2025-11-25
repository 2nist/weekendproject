/**
 * Calibration Service
 * Runs optimization loop to find best engine parameters
 * Uses grid search or hill climbing to maximize accuracy
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
const logger = require('../analysis/logger');
import { loadConfig, saveConfig, EngineConfig } from '../config/engineConfig';
import { app } from 'electron';

// Helper to get app path reliably
function getAppPath(): string {
  try {
    // In Electron, app.getAppPath() is most reliable
    if (app && typeof app.getAppPath === 'function') {
      return app.getAppPath();
    }
  } catch (e) {
    // app might not be available yet
  }
  // Fallback to process.cwd() or __dirname
  return process.cwd() || path.resolve(__dirname, '../..');
}

// Import analysis modules
const metadataLookup = require('../analysis/metadataLookup');
const listener = require('../analysis/listener');
const architect = require('../analysis/architect_canonical_final');
let architectV2 = null;
try {
  architectV2 = require('../analysis/architect_v2');
} catch (e) {
  logger.warn('Architect V2 not available for calibration');
}
const theorist = require('../analysis/theorist');

// More reliable path resolution for TypeScript files
// When loaded via ts-node, __dirname points to the .js output location
// We need to find the actual source file location
function getTestDir(): string {
  // Try multiple path resolution strategies
  const strategies = [
    // Strategy 1: Relative to __dirname (services/ -> analysis/test/)
    () => path.resolve(__dirname, '..', 'analysis', 'test'),
    // Strategy 2: From app path
    () => {
      try {
        const appPath = getAppPath();
        return path.resolve(appPath, 'electron', 'analysis', 'test');
      } catch (e) {
        return null;
      }
    },
    // Strategy 3: From process.cwd()
    () => path.resolve(process.cwd(), 'electron', 'analysis', 'test'),
    // Strategy 4: From __dirname going up to root
    () => path.resolve(__dirname, '../..', 'electron', 'analysis', 'test'),
  ];

  for (const strategy of strategies) {
    try {
      const testDir = strategy();
      if (testDir && fs.existsSync(testDir)) {
        logger.info('[CALIBRATION] Found test directory at:', testDir);
        return testDir;
      }
    } catch (e) {
      // Continue to next strategy
    }
  }

  // Fallback: use __dirname relative path even if it doesn't exist
  const fallback = path.resolve(__dirname, '..', 'analysis', 'test');
  logger.warn('[CALIBRATION] Could not find test directory, using fallback:', fallback);
  return fallback;
}

const TEST_DIR = getTestDir();
const TEST_USER_DIR = path.join(TEST_DIR, 'user');

// Debug: Log the resolved paths
logger.debug('[CALIBRATION] Path resolution:', {
  __dirname,
  appPath: getAppPath(),
  cwd: process.cwd(),
  TEST_DIR,
  TEST_DIR_EXISTS: fs.existsSync(TEST_DIR),
  TEST_DIR_FILES: fs.existsSync(TEST_DIR) ? fs.readdirSync(TEST_DIR).slice(0, 5) : 'N/A',
});

/**
 * Scan for user-added benchmark songs
 */
function scanUserBenchmarks(): Array<
  (typeof BASE_SONGS)[0] & { isUserAdded: boolean; weight: number }
> {
  const userSongs: Array<(typeof BASE_SONGS)[0] & { isUserAdded: boolean; weight: number }> = [];

  if (!fs.existsSync(TEST_USER_DIR)) {
    return userSongs;
  }

  const files = fs.readdirSync(TEST_USER_DIR);
  const metadataFiles = files.filter((f) => f.endsWith('_metadata.json'));

  for (const metaFile of metadataFiles) {
    try {
      const metaPath = path.join(TEST_USER_DIR, metaFile);
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

      // Check if all required files exist
      if (
        fs.existsSync(metadata.audioPath) &&
        fs.existsSync(metadata.sectionLabPath) &&
        fs.existsSync(metadata.chordLabPath)
      ) {
        const baseName = path.basename(metaFile, '_metadata.json');
        userSongs.push({
          id: `user_${baseName}`,
          title: metadata.projectTitle || baseName,
          audioPath: metadata.audioPath,
          sectionPath: metadata.sectionLabPath,
          chordPath: metadata.chordLabPath,
          referenceKey: metadata.referenceKey || 'unknown',
          isUserAdded: true,
          weight: 2.0, // Double weight for user corrections
        });
      }
    } catch (error) {
      logger.warn(`[CALIBRATION] Failed to load user benchmark ${metaFile}:`, error);
    }
  }

  return userSongs;
}

// Reference songs (base set)
const BASE_SONGS = [
  {
    id: 'come_together',
    title: 'Come Together',
    audioPath: path.join(TEST_DIR, '01 Come Together.mp3'),
    sectionPath: path.join(TEST_DIR, '01_-_Come_Together.lab'),
    chordPath: path.join(TEST_DIR, '01_-_Come_Together_chord.lab'),
    referenceKey: 'D:maj',
  },
  {
    id: 'eleanor_rigby',
    title: 'Eleanor Rigby',
    audioPath: path.join(TEST_DIR, '02 Eleanor Rigby.mp3'),
    sectionPath: path.join(TEST_DIR, '02_-_Eleanor_Rigby.lab'),
    chordPath: path.join(TEST_DIR, '02_-_Eleanor_Rigby_chord.lab'),
    referenceKey: 'E:min',
  },
  {
    id: 'maxwell',
    title: "Maxwell's Silver Hammer",
    audioPath: path.join(TEST_DIR, "03 Maxwell's Silver Hammer.mp3"),
    sectionPath: path.join(TEST_DIR, "03_-_Maxwell's_Silver_Hammer.lab"),
    chordPath: path.join(TEST_DIR, "03_-_Maxwell's_Silver_Hammer_chord.lab"),
    referenceKey: 'C:maj',
  },
  {
    id: 'ob_la_di',
    title: 'Ob-La-Di, Ob-La-Da',
    audioPath: path.join(TEST_DIR, '04 Ob-La-Di, Ob-La-Da.mp3'),
    sectionPath: path.join(TEST_DIR, 'CD1_-_04_-_Ob-La-Di,_Ob-La-Da.lab'),
    chordPath: path.join(TEST_DIR, 'CD1_-_04_-_Ob-La-Di,_Ob-La-Da_chord.lab'),
    referenceKey: 'C:maj',
  },
  {
    id: 'let_it_be',
    title: 'Let It Be',
    audioPath: path.join(TEST_DIR, '06 Let It Be.mp3'),
    sectionPath: path.join(TEST_DIR, '06_-_Let_It_Be.lab'),
    chordPath: path.join(TEST_DIR, '06_-_Let_It_Be_chord.lab'),
    referenceKey: 'C:maj',
  },
  {
    id: 'helter_skelter',
    title: 'Helter Skelter',
    audioPath: path.join(TEST_DIR, '06 Helter Skelter.mp3'),
    sectionPath: path.join(TEST_DIR, 'CD2_-_06_-_Helter_Skelter.lab'),
    chordPath: path.join(TEST_DIR, 'CD2_-_06_-_Helter_Skelter_chord.lab'),
    referenceKey: 'E:maj',
  },
  {
    id: 'day_in_the_life',
    title: 'A Day In The Life',
    audioPath: path.join(TEST_DIR, '13 A Day In The Life.mp3'),
    sectionPath: path.join(TEST_DIR, '13_-_A_Day_In_The_Life.lab'),
    chordPath: path.join(TEST_DIR, '13_-_A_Day_In_The_Life_chord.lab'),
    referenceKey: 'G:maj',
  },
];

// Combine base songs with user-added benchmarks
// User songs get double weight in scoring
function getAllSongs(): Array<(typeof BASE_SONGS)[0] & { isUserAdded?: boolean; weight?: number }> {
  const baseSongs = BASE_SONGS.map((song) => ({ ...song, isUserAdded: false, weight: 1.0 }));
  const userSongs = scanUserBenchmarks();
  return [...baseSongs, ...userSongs];
}

// Export SONGS getter for dynamic loading (includes user songs)
// Call getAllSongs() at runtime to pick up newly added user benchmarks
const getSongs = () => getAllSongs();

/**
 * Get list of available benchmark songs for selection
 * Returns metadata about each benchmark (id, title, filename, genre, etc.)
 */
export function getBenchmarks(): Array<{
  id: string;
  title: string;
  filename: string;
  genre?: string;
  isUserAdded: boolean;
  weight: number;
  referenceKey: string;
}> {
  logger.debug('[getBenchmarks] Starting...');
  logger.debug('[getBenchmarks] TEST_DIR:', TEST_DIR);
  logger.debug('[getBenchmarks] TEST_DIR exists:', fs.existsSync(TEST_DIR));

  const allSongs = getAllSongs();
  logger.debug('[getBenchmarks] Total songs from getAllSongs():', allSongs.length);

  if (allSongs.length === 0) {
    logger.warn('[getBenchmarks] getAllSongs() returned empty array!');
    logger.debug('[getBenchmarks] BASE_SONGS length:', BASE_SONGS.length);
    logger.debug('[getBenchmarks] scanUserBenchmarks() result:', scanUserBenchmarks().length);
  }

  const validSongs = allSongs.filter((song) => {
    const audioExists = fs.existsSync(song.audioPath);
    const sectionExists = fs.existsSync(song.sectionPath);
    const chordExists = fs.existsSync(song.chordPath);

    if (!audioExists || !sectionExists || !chordExists) {
      logger.debug(`[getBenchmarks] ❌ Song "${song.title}" missing files:`, {
        audio: audioExists ? '✅' : '❌',
        section: sectionExists ? '✅' : '❌',
        chord: chordExists ? '✅' : '❌',
        audioPath: song.audioPath,
        sectionPath: song.sectionPath,
        chordPath: song.chordPath,
      });
    } else {
      logger.debug(`[getBenchmarks] ✅ Song "${song.title}" - all files exist`);
    }

    return audioExists && sectionExists && chordExists;
  });

  logger.debug('[getBenchmarks] Valid songs:', validSongs.length, 'out of', allSongs.length);

  const result = validSongs.map((song) => ({
    id: song.id,
    title: song.title,
    filename: path.basename(song.audioPath),
    genre: (song as any).genre || 'unknown',
    isUserAdded: (song as any).isUserAdded || false,
    weight: (song as any).weight || 1.0,
    referenceKey: song.referenceKey,
  }));

  logger.debug('[getBenchmarks] Returning', result.length, 'benchmarks');
  return result;
}

// Utility functions (same as calibrationService.js)
function parseLabFile(filePath: string): Array<{ start: number; end: number; label: string }> {
  const contents = fs.readFileSync(filePath, 'utf8');
  const lines = contents
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const segments: Array<{ start: number; end: number; label: string }> = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const start = parseFloat(parts[0]);
    const end = parseFloat(parts[1]);
    if (isNaN(start) || isNaN(end)) continue;
    const label = parts.slice(2).join(' ').trim();
    segments.push({ start, end, label });
  }

  return segments;
}

function normalizeChord(label: string | null): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed || /^(silence|n)$/i.test(trimmed)) return null;

  let pure = trimmed
    .replace(/\(.*\)/g, '')
    .replace(/\*+/g, '')
    .trim();
  pure = pure.replace(/^key\s+/i, '');
  pure = pure.replace(/\s+/g, '');
  pure = pure.replace(/\/.+$/, '');

  const [rootPart, qualityPart = ''] = pure.split(':');
  const rootMatch = rootPart?.match(/^([A-Ga-g])([b#]?)/);
  if (!rootMatch) return null;

  const root = rootMatch[1].toUpperCase() + (rootMatch[2] || '');
  const quality = qualityPart.toLowerCase();
  if (!quality || quality === 'maj') return root;
  if (quality.startsWith('min')) return root + 'm';
  return root + quality.replace(/[^a-z0-9]/gi, '');
}

function getOverlap(start1: number, end1: number, start2: number, end2: number): number {
  const overlapStart = Math.max(start1, start2);
  const overlapEnd = Math.min(end1, end2);
  return Math.max(0, overlapEnd - overlapStart);
}

function computeKeyScore(engineAnalysis: any, referenceKey: string): number {
  if (!referenceKey) return 0;
  const expectedKey = normalizeChord(referenceKey);
  if (!expectedKey) return 0;

  const engineKeyObj = engineAnalysis?.harmonic_context?.global_key || {};
  const root = engineKeyObj.primary_key;
  const mode = engineKeyObj.mode;

  let engineKey: string | null = null;
  if (root) {
    const normalizedRoot = normalizeChord(root) || root;
    if (mode && (mode.toLowerCase().includes('minor') || mode.toLowerCase().includes('aeolian'))) {
      engineKey = `${normalizedRoot}:min`;
    } else {
      engineKey = `${normalizedRoot}:maj`;
    }
  }

  const engineKeyNormalized = normalizeChord(engineKey || '');
  return engineKeyNormalized === expectedKey ? 100 : 0;
}

function computeChordOverlap(
  engineAnalysis: any,
  chordSegments: Array<{ start: number; end: number; label: string }>,
): number {
  const labChords = chordSegments.filter((seg) => normalizeChord(seg.label));
  const engineEvents = engineAnalysis?.linear_analysis?.events || [];
  const engineChords = engineEvents
    .filter((e: any) => e.event_type === 'chord_candidate' && e.chord)
    .map((e: any) => ({
      start: e.timestamp || 0,
      end: (e.timestamp || 0) + (e.duration || 1),
      chord: normalizeChord(e.chord),
    }));

  if (!labChords.length || !engineChords.length) return 0;

  let totalOverlap = 0;
  let matchedOverlap = 0;

  for (const labSeg of labChords) {
    const labChord = normalizeChord(labSeg.label);
    for (const engSeg of engineChords) {
      const overlap = getOverlap(labSeg.start, labSeg.end, engSeg.start, engSeg.end);
      if (overlap <= 0) continue;
      totalOverlap += overlap;
      if (labChord && engSeg.chord && labChord === engSeg.chord) {
        matchedOverlap += overlap;
      }
    }
  }

  return totalOverlap > 0 ? matchedOverlap / totalOverlap : 0;
}

function computeSegmentationScore(
  engineAnalysis: any,
  sectionSegments: Array<{ start: number; end: number; label: string }>,
): number {
  const engineSections = engineAnalysis?.structural_map?.sections || [];
  if (!sectionSegments.length || !engineSections.length) return 0;

  let totalOverlap = 0;
  let matchedOverlap = 0;

  for (const labSeg of sectionSegments) {
    for (const engSec of engineSections) {
      const engStart = engSec.time_range?.start_time || 0;
      const engEnd = engSec.time_range?.end_time || Infinity;
      const overlap = getOverlap(labSeg.start, labSeg.end, engStart, engEnd);
      if (overlap <= 0) continue;
      totalOverlap += overlap;
      const labLabel = labSeg.label.toLowerCase();
      const engLabel = (engSec.section_label || '').toLowerCase();
      if (labLabel.includes(engLabel) || engLabel.includes(labLabel)) {
        matchedOverlap += overlap;
      }
    }
  }

  return totalOverlap > 0 ? matchedOverlap / totalOverlap : 0;
}

/**
 * Analyze a song with given parameters
 */
async function analyzeSongWithParams(
  audioPath: string,
  config: EngineConfig,
  progressCallback?: (p: number) => void,
): Promise<any> {
  const metadata = await metadataLookup.gatherMetadata(audioPath, {});

  // Analyze audio with chord options (harmonyOptions parameter)
  const analysisResult = await listener.analyzeAudio(
    audioPath,
    progressCallback || (() => {}),
    metadata,
    config.chordOptions, // Pass as harmonyOptions (4th parameter)
  );
  const linearAnalysis = analysisResult.linear_analysis;

  // Build architect options
  const architectOptions = {
    downsampleFactor: config.architectOptions.downsampleFactor || 4,
    forceOverSeg: config.architectOptions.forceOverSeg || false,
    noveltyKernel: config.architectOptions.noveltyKernel || 5,
    sensitivity: config.architectOptions.sensitivity || 0.6,
    mergeChromaThreshold: config.architectOptions.mergeChromaThreshold || 0.92,
    minSectionDurationSec: config.architectOptions.minSectionDurationSec || 8.0,
    exactChromaThreshold: 0.99,
    exactMfccThreshold: 0.95,
    progressionSimilarityThreshold: 0.95,
    progressionSimilarityMode: 'normalized',
    minSectionsStop: 20,
  };

  const useV2 = !!architectV2 && process.env.USE_ARCHITECT_V2 !== '0';
  const computeScaleWeights = (detailLevel: number) => {
    const phraseW = Math.max(0.2, Math.min(0.8, detailLevel));
    const movementW = 1 - phraseW - 0.2;
    return { phrase: phraseW, section: 0.2, movement: Math.max(0.05, movementW) };
  };

  const v2Options = {
    downsampleFactor: architectOptions.downsampleFactor,
    adaptiveSensitivity: config.architectOptions.adaptiveSensitivity || 1.5,
    scaleWeights: computeScaleWeights(config.architectOptions.detailLevel || 0.5),
    mfccWeight: config.architectOptions.mfccWeight || 0.5,
    forceOverSeg: architectOptions.forceOverSeg,
  };

  let structuralMap;
  if (useV2 && architectV2) {
    structuralMap = await (architectV2 as typeof architect).analyzeStructure(
      linearAnalysis,
      () => {},
      v2Options,
    );
  } else {
    structuralMap = await architect.analyzeStructure(linearAnalysis, () => {}, architectOptions);
  }

  const correctedStructuralMap = await theorist.correctStructuralMap(
    structuralMap,
    linearAnalysis,
    metadata,
    () => {},
  );

  const detectedKey = linearAnalysis?.metadata?.detected_key || metadata?.key_hint || 'C';
  const detectedMode = linearAnalysis?.metadata?.detected_mode || metadata?.mode_hint || 'major';

  const harmonicContext = {
    global_key: {
      primary_key: detectedKey,
      mode: detectedMode,
      confidence: 0.8,
    },
  };

  return {
    linear_analysis: linearAnalysis,
    structural_map: correctedStructuralMap,
    harmonic_context: harmonicContext,
  };
}

/**
 * Evaluate a single song with a parameter configuration
 */
async function evaluateSong(
  song: (typeof BASE_SONGS)[0] & { isUserAdded?: boolean; weight?: number },
  config: EngineConfig,
  logCallback?: (message: string) => void,
): Promise<number> {
  const log = logCallback || ((msg) => {});

  try {
    if (
      !fs.existsSync(song.audioPath) ||
      !fs.existsSync(song.sectionPath) ||
      !fs.existsSync(song.chordPath)
    ) {
      log(`[CALIBRATION] ⚠️ Skipping ${song.title} (files missing)`);
      return 0;
    }

    const sectionData = parseLabFile(song.sectionPath);
    const chordData = parseLabFile(song.chordPath);

    const engineAnalysis = await analyzeSongWithParams(song.audioPath, config);

    const keyScore = computeKeyScore(engineAnalysis, song.referenceKey);
    const chordRatio = computeChordOverlap(engineAnalysis, chordData);
    const segmentRatio = computeSegmentationScore(engineAnalysis, sectionData);

    const keyWeight = 0.4;
    const structureWeight = 0.3;
    const chordWeight = 0.3;
    const totalScore =
      keyScore * keyWeight + chordRatio * 100 * chordWeight + segmentRatio * 100 * structureWeight;

    log(
      `[CALIBRATION] ${song.title}: Key=${keyScore.toFixed(0)}%, Chords=${(chordRatio * 100).toFixed(1)}%, Sections=${(segmentRatio * 100).toFixed(1)}%, Total=${totalScore.toFixed(1)}%`,
    );
    return totalScore;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`[CALIBRATION] ⚠️ Failed to evaluate "${song.title}": ${errorMsg}`);
    return 0;
  }
}

/**
 * Evaluate a parameter configuration with parallel execution and early stopping
 * @param songsGetter Function that returns the list of songs to evaluate
 */
async function evaluateConfigWithSongs(
  config: EngineConfig,
  songsGetter: () => Array<(typeof BASE_SONGS)[0] & { isUserAdded?: boolean; weight?: number }>,
  progressCallback?: (msg: string) => void,
  logCallback?: (message: string) => void,
  enableEarlyStopping: boolean = true,
): Promise<number> {
  const log = logCallback || ((msg) => {});
  const allSongs = songsGetter(); // Use provided songs getter
  const availableSongs = allSongs.filter(
    (song) =>
      fs.existsSync(song.audioPath) &&
      fs.existsSync(song.sectionPath) &&
      fs.existsSync(song.chordPath),
  );

  if (availableSongs.length === 0) {
    log('[CALIBRATION] ⚠️ No valid songs found for evaluation');
    return 0;
  }

  // Limit concurrency to avoid freezing UI (use os.cpus().length - 1)
  const maxConcurrency = Math.max(1, os.cpus().length - 1);
  log(`[CALIBRATION] Evaluating ${availableSongs.length} songs (max ${maxConcurrency} parallel)`);

  // Early stopping: Evaluate first 2 songs first
  const results: number[] = [];
  let songsToProcess = availableSongs;

  if (enableEarlyStopping && availableSongs.length > 2) {
    const earlySongs = availableSongs.slice(0, 2);
    const earlyResults = await Promise.all(
      earlySongs.map((song) => evaluateSong(song, config, logCallback)),
    );

    const earlyAvg = earlyResults.reduce((sum, score) => sum + score, 0) / earlyResults.length;

    if (earlyAvg < 50) {
      log(
        `[CALIBRATION] ⚠️ Early stopping: First 2 songs average ${earlyAvg.toFixed(1)}% < 50% (pruning this config)`,
      );
      throw new Error('PRUNED'); // Signal to skip remaining songs
    }

    log(
      `[CALIBRATION] Early check passed: ${earlyAvg.toFixed(1)}% (continuing with remaining songs)`,
    );
    // Add early results and process remaining songs
    results.push(...earlyResults);
    songsToProcess = availableSongs.slice(2);
  }

  // Process remaining songs in parallel batches
  const batchSize = maxConcurrency;

  for (let i = 0; i < songsToProcess.length; i += batchSize) {
    const batch = songsToProcess.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((song) => evaluateSong(song, config, logCallback)),
    );
    results.push(...batchResults);

    // Yield to event loop between batches
    await new Promise((resolve) => setImmediate(resolve));
  }

  const avgScore =
    results.length > 0 ? results.reduce((sum, score) => sum + score, 0) / results.length : 0;

  log(`[CALIBRATION] Average score across ${results.length} songs: ${avgScore.toFixed(1)}%`);
  return avgScore;
}

/**
 * Evaluate a parameter configuration (wrapper for backward compatibility)
 */
async function evaluateConfig(
  config: EngineConfig,
  progressCallback?: (msg: string) => void,
  logCallback?: (message: string) => void,
  enableEarlyStopping: boolean = true,
): Promise<number> {
  return evaluateConfigWithSongs(
    config,
    getSongs,
    progressCallback,
    logCallback,
    enableEarlyStopping,
  );
}

/**
 * Coordinate Descent Optimization
 * Optimizes one parameter at a time sequentially
 */
async function optimizeWithCoordinateDescentWithSongs(
  baseline: EngineConfig,
  songsGetter: () => Array<(typeof BASE_SONGS)[0] & { isUserAdded?: boolean; weight?: number }>,
  sendProgress: (data: any) => void,
  logCallback?: (message: string) => void,
): Promise<EngineConfig> {
  const log =
    logCallback ||
    ((...args: any[]) => {
      logger.debug(...args);
    });
  let currentConfig = { ...baseline };
  let currentScore = 0;

  // Step 1: Optimize noveltyKernel
  log('[CALIBRATION] Step 1/4: Optimizing Novelty Kernel...');
  sendProgress({
    progress: 10,
    currentSong: 'Step 1/4: Optimizing Novelty Kernel...',
    stage: 'kernel',
  });

  const noveltyKernels = [3, 4, 5, 6, 7, 8, 9];
  let bestKernel = currentConfig.architectOptions.noveltyKernel || 5;
  let bestKernelScore = 0;

  for (const nk of noveltyKernels) {
    const testConfig = {
      ...currentConfig,
      architectOptions: {
        ...currentConfig.architectOptions,
        noveltyKernel: nk,
      },
    };

    try {
      const score = await evaluateConfigWithSongs(
        testConfig,
        songsGetter,
        undefined,
        logCallback,
        true,
      );
      log(`[CALIBRATION] Kernel ${nk}: ${score.toFixed(1)}%`);

      if (score > bestKernelScore) {
        bestKernelScore = score;
        bestKernel = nk;
      }

      // Yield to event loop
      await new Promise((resolve) => setImmediate(resolve));
    } catch (error) {
      if (error instanceof Error && error.message === 'PRUNED') {
        log(`[CALIBRATION] Kernel ${nk} pruned (early stopping)`);
        continue;
      }
      log(`[CALIBRATION] ⚠️ Kernel ${nk} failed: ${error}`);
    }
  }

  currentConfig.architectOptions.noveltyKernel = bestKernel;
  currentScore = bestKernelScore;
  log(`[CALIBRATION] ✅ Best Kernel: ${bestKernel} (score: ${bestKernelScore.toFixed(1)}%)`);

  // Step 2: Optimize mergeChromaThreshold
  log('[CALIBRATION] Step 2/4: Optimizing Chroma Threshold...');
  sendProgress({
    progress: 40,
    currentSong: 'Step 2/4: Optimizing Chroma Threshold...',
    stage: 'threshold',
  });

  const thresholds = [0.85, 0.88, 0.9, 0.92, 0.94, 0.96];
  let bestThreshold = currentConfig.architectOptions.mergeChromaThreshold || 0.92;
  let bestThresholdScore = currentScore;

  for (const threshold of thresholds) {
    const testConfig = {
      ...currentConfig,
      architectOptions: {
        ...currentConfig.architectOptions,
        mergeChromaThreshold: threshold,
      },
    };

    try {
      const score = await evaluateConfigWithSongs(
        testConfig,
        songsGetter,
        undefined,
        logCallback,
        true,
      );
      log(`[CALIBRATION] Threshold ${threshold}: ${score.toFixed(1)}%`);

      if (score > bestThresholdScore) {
        bestThresholdScore = score;
        bestThreshold = threshold;
      }

      await new Promise((resolve) => setImmediate(resolve));
    } catch (error) {
      if (error instanceof Error && error.message === 'PRUNED') {
        log(`[CALIBRATION] Threshold ${threshold} pruned (early stopping)`);
        continue;
      }
      log(`[CALIBRATION] ⚠️ Threshold ${threshold} failed: ${error}`);
    }
  }

  currentConfig.architectOptions.mergeChromaThreshold = bestThreshold;
  currentScore = bestThresholdScore;
  log(
    `[CALIBRATION] ✅ Best Threshold: ${bestThreshold} (score: ${bestThresholdScore.toFixed(1)}%)`,
  );

  // Step 3: Optimize temperature
  log('[CALIBRATION] Step 3/4: Optimizing Temperature...');
  sendProgress({
    progress: 70,
    currentSong: 'Step 3/4: Optimizing Temperature...',
    stage: 'temperature',
  });

  const temperatures = [0.05, 0.08, 0.1, 0.12, 0.15, 0.18, 0.2];
  let bestTemp = currentConfig.chordOptions.temperature || 0.1;
  let bestTempScore = currentScore;

  for (const temp of temperatures) {
    const testConfig = {
      ...currentConfig,
      chordOptions: {
        ...currentConfig.chordOptions,
        temperature: temp,
      },
    };

    try {
      const score = await evaluateConfigWithSongs(
        testConfig,
        songsGetter,
        undefined,
        logCallback,
        true,
      );
      log(`[CALIBRATION] Temperature ${temp}: ${score.toFixed(1)}%`);

      if (score > bestTempScore) {
        bestTempScore = score;
        bestTemp = temp;
      }

      await new Promise((resolve) => setImmediate(resolve));
    } catch (error) {
      if (error instanceof Error && error.message === 'PRUNED') {
        log(`[CALIBRATION] Temperature ${temp} pruned (early stopping)`);
        continue;
      }
      log(`[CALIBRATION] ⚠️ Temperature ${temp} failed: ${error}`);
    }
  }

  currentConfig.chordOptions.temperature = bestTemp;
  currentScore = bestTempScore;
  log(`[CALIBRATION] ✅ Best Temperature: ${bestTemp} (score: ${bestTempScore.toFixed(1)}%)`);

  // Step 4: Optimize sensitivity
  log('[CALIBRATION] Step 4/4: Optimizing Sensitivity...');
  sendProgress({
    progress: 90,
    currentSong: 'Step 4/4: Optimizing Sensitivity...',
    stage: 'sensitivity',
  });

  const sensitivities = [0.4, 0.5, 0.6, 0.7, 0.8];
  let bestSens = currentConfig.architectOptions.sensitivity || 0.6;
  let bestSensScore = currentScore;

  for (const sens of sensitivities) {
    const testConfig = {
      ...currentConfig,
      architectOptions: {
        ...currentConfig.architectOptions,
        sensitivity: sens,
      },
    };

    try {
      const score = await evaluateConfigWithSongs(
        testConfig,
        songsGetter,
        undefined,
        logCallback,
        true,
      );
      log(`[CALIBRATION] Sensitivity ${sens}: ${score.toFixed(1)}%`);

      if (score > bestSensScore) {
        bestSensScore = score;
        bestSens = sens;
      }

      await new Promise((resolve) => setImmediate(resolve));
    } catch (error) {
      if (error instanceof Error && error.message === 'PRUNED') {
        log(`[CALIBRATION] Sensitivity ${sens} pruned (early stopping)`);
        continue;
      }
      log(`[CALIBRATION] ⚠️ Sensitivity ${sens} failed: ${error}`);
    }
  }

  currentConfig.architectOptions.sensitivity = bestSens;
  log(`[CALIBRATION] ✅ Best Sensitivity: ${bestSens} (final score: ${bestSensScore.toFixed(1)}%)`);

  return currentConfig;
}

/**
 * Run calibration with optimization
 * @param sendProgress Progress callback
 * @param logCallback Log callback
 * @param selectedIds Optional array of song IDs to use. If empty/null, uses all songs.
 */
export async function runCalibration(
  sendProgress: (data: any) => void,
  logCallback?: (message: string) => void,
  selectedIds?: string[],
): Promise<{ success: boolean; bestConfig?: EngineConfig; score?: number; error?: string }> {
  try {
    const log =
      logCallback ||
      ((...args: any[]) => {
        logger.debug(...args);
      });

    log('[CALIBRATION] Starting calibration optimization...');

    // Filter songs if selectedIds provided
    const originalGetSongs = getSongs;
    if (selectedIds && selectedIds.length > 0) {
      log(`[CALIBRATION] Using ${selectedIds.length} selected songs: ${selectedIds.join(', ')}`);
      // Override getSongs to filter by selectedIds
      (global as any).__calibrationGetSongs = () => {
        const all = originalGetSongs();
        return all.filter((song) => selectedIds.includes(song.id));
      };
    } else {
      log('[CALIBRATION] Using all available songs');
      (global as any).__calibrationGetSongs = originalGetSongs;
    }

    sendProgress({ progress: 0, currentSong: 'Starting calibration...' });

    // Load current config as baseline
    const baselineConfig = loadConfig();
    log('[CALIBRATION] Loading baseline configuration...');
    sendProgress({ progress: 5, currentSong: 'Evaluating baseline configuration...' });

    // Use filtered songs for evaluation
    const getFilteredSongsForBaseline = (global as any).__calibrationGetSongs || originalGetSongs;
    const baselineScore = await evaluateConfigWithSongs(
      baselineConfig,
      getFilteredSongsForBaseline,
      undefined,
      log,
      false,
    );
    log(`[CALIBRATION] Baseline score: ${baselineScore.toFixed(1)}%`);
    sendProgress({
      progress: 10,
      currentSong: `Baseline score: ${baselineScore.toFixed(1)}%`,
      baselineScore: baselineScore,
    });

    // Use Coordinate Descent instead of Grid Search (much faster!)
    log('[CALIBRATION] Starting Coordinate Descent optimization...');
    // Reuse getFilteredSongs or create new one with getSongs fallback
    const getFilteredSongsForOptimization = (global as any).__calibrationGetSongs || getSongs;
    const optimizedConfig = await optimizeWithCoordinateDescentWithSongs(
      baselineConfig,
      getFilteredSongsForOptimization,
      sendProgress,
      log,
    );

    // Final evaluation with optimized config (no early stopping for accurate final score)
    log('[CALIBRATION] Final evaluation of optimized configuration...');
    sendProgress({ progress: 95, currentSong: 'Final evaluation...' });
    const bestScore = await evaluateConfigWithSongs(
      optimizedConfig,
      getFilteredSongsForOptimization,
      undefined,
      log,
      false,
    );
    const bestConfig = optimizedConfig;

    // Save best configuration
    if (bestScore > baselineScore) {
      bestConfig.calibrationScore = bestScore;
      const saveResult = saveConfig(bestConfig);
      if (!saveResult.success) {
        throw new Error(`Failed to save config: ${saveResult.error}`);
      }

      // Also update DB settings so Analysis Lab sliders reflect the new values
      try {
        const db = require('../db');
        if (bestConfig.architectOptions) {
          if (bestConfig.architectOptions.noveltyKernel !== undefined) {
            db.setSetting(
              'analysis_noveltyKernel',
              bestConfig.architectOptions.noveltyKernel.toString(),
            );
          }
          if (bestConfig.architectOptions.sensitivity !== undefined) {
            db.setSetting(
              'analysis_sensitivity',
              bestConfig.architectOptions.sensitivity.toString(),
            );
          }
          if (bestConfig.architectOptions.adaptiveSensitivity !== undefined) {
            db.setSetting(
              'analysis_adaptiveSensitivity',
              bestConfig.architectOptions.adaptiveSensitivity.toString(),
            );
          }
          if (bestConfig.architectOptions.mfccWeight !== undefined) {
            db.setSetting('analysis_mfccWeight', bestConfig.architectOptions.mfccWeight.toString());
          }
          if (bestConfig.architectOptions.detailLevel !== undefined) {
            db.setSetting(
              'analysis_detailLevel',
              bestConfig.architectOptions.detailLevel.toString(),
            );
          }
        }
        if (bestConfig.chordOptions) {
          if (bestConfig.chordOptions.temperature !== undefined) {
            db.setSetting('analysis_temperature', bestConfig.chordOptions.temperature.toString());
          }
          if (bestConfig.chordOptions.transitionProb !== undefined) {
            db.setSetting(
              'analysis_transitionProb',
              bestConfig.chordOptions.transitionProb.toString(),
            );
          }
          if (bestConfig.chordOptions.diatonicBonus !== undefined) {
            db.setSetting(
              'analysis_diatonicBonus',
              bestConfig.chordOptions.diatonicBonus.toString(),
            );
          }
          if (bestConfig.chordOptions.rootPeakBias !== undefined) {
            db.setSetting('analysis_rootPeakBias', bestConfig.chordOptions.rootPeakBias.toString());
          }
        }
        logger.info('✅ Updated DB settings with calibrated values');
      } catch (dbError) {
        logger.warn('⚠️ Failed to update DB settings (non-critical):', dbError);
      }
    }

    sendProgress({
      progress: 100,
      currentSong: 'Calibration complete!',
      complete: true,
      bestConfig: bestConfig,
      bestScore: bestScore,
      baselineScore: baselineScore,
    });

    return {
      success: true,
      bestConfig,
      score: bestScore,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    sendProgress({
      progress: 100,
      error: errorMsg,
      complete: true,
    });
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// Default export for convenience
export default {
  getBenchmarks,
  runCalibration,
};
