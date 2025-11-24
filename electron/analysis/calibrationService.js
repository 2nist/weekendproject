const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Try to load TypeScript benchmark script
let benchmarkScript = null;
try {
  // Register ts-node if available
  try {
    require('ts-node').register({ transpileOnly: true });
  } catch (e) {
    // ts-node not available, will try to use compiled version
  }
  
  // Try to load the benchmark script
  const benchmarkPath = path.resolve(__dirname, '../../scripts/benchmark.ts');
  if (fs.existsSync(benchmarkPath)) {
    benchmarkScript = require(benchmarkPath);
  }
} catch (err) {
  logger.warn('Could not load benchmark script:', err.message);
}

const ROOT = path.resolve(__dirname, '../..');
const TEST_DIR = path.resolve(ROOT, 'electron', 'analysis', 'test');

// Load analysis modules
const metadataLookup = require('./metadataLookup');
const listener = require('./listener');
const architect = require('./architect_clean');
const theorist = require('./theorist');

// Simple lab parser (inline version)
function parseLabFile(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  const lines = contents.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const segments = [];
  
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

function normalizeChord(label) {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed || /^(silence|n)$/i.test(trimmed)) return null;
  
  let pure = trimmed.replace(/\(.*\)/g, '').replace(/\*+/g, '').trim();
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

const SONGS = [
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
      const logger = logger || require('./logger');
      logger.warn('[getBenchmarks] getAllSongs() returned empty array!');
    title: "Maxwell's Silver Hammer",
    audioPath: path.join(TEST_DIR, "03 Maxwell's Silver Hammer.mp3"),
    sectionPath: path.join(TEST_DIR, "03_-_Maxwell's_Silver_Hammer.lab"),
    chordPath: path.join(TEST_DIR, "03_-_Maxwell's_Silver_Hammer_chord.lab"),
    referenceKey: 'C:maj',
  },
  {
    id: 'ob_la_di',
    title: "Ob-La-Di, Ob-La-Da",
    audioPath: path.join(TEST_DIR, "04 Ob-La-Di, Ob-La-Da.mp3"),
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

async function analyzeSong(audioPath, progressCallback) {
  const metadata = await metadataLookup.gatherMetadata(audioPath, {});
  const analysisResult = await listener.analyzeAudio(
    audioPath,
    progressCallback || (() => {}),
    metadata,
  );
  const linearAnalysis = analysisResult.linear_analysis;

  const structuralMap = await architect.analyzeStructure(
    linearAnalysis,
    () => {},
  );
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

function computeKeyScore(engineAnalysis, referenceKey) {
  if (!referenceKey) return 0;
  const expectedKey = normalizeChord(referenceKey);
  if (!expectedKey) return 0;

  const engineKeyObj = engineAnalysis?.harmonic_context?.global_key || {};
  const root = engineKeyObj.primary_key;
  const mode = engineKeyObj.mode;
  
  let engineKey = null;
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

function getOverlap(start1, end1, start2, end2) {
  const overlapStart = Math.max(start1, start2);
  const overlapEnd = Math.min(end1, end2);
  return Math.max(0, overlapEnd - overlapStart);
}

function computeChordOverlap(engineAnalysis, chordSegments) {
  const labChords = chordSegments.filter(seg => normalizeChord(seg.label));
  const engineEvents = engineAnalysis?.linear_analysis?.events || [];
  const engineChords = engineEvents
    .filter(e => e.event_type === 'chord_candidate' && e.chord)
    .map(e => ({
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

function computeSegmentationScore(engineAnalysis, sectionSegments) {
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
      // Simple label matching (could be improved)
      const labLabel = labSeg.label.toLowerCase();
      const engLabel = (engSec.section_label || '').toLowerCase();
      if (labLabel.includes(engLabel) || engLabel.includes(labLabel)) {
        matchedOverlap += overlap;
      }
    }
  }

  return totalOverlap > 0 ? matchedOverlap / totalOverlap : 0;
}

async function runCalibration(sendProgress) {
  const results = [];
  
  for (let i = 0; i < SONGS.length; i++) {
    const song = SONGS[i];
    const progress = ((i + 1) / SONGS.length) * 100;
    
    sendProgress({
      progress,
      currentSong: song.title,
    });

    try {
      // Check if files exist
      if (!fs.existsSync(song.audioPath)) {
        throw new Error(`Audio file not found: ${song.audioPath}`);
      }
      if (!fs.existsSync(song.sectionPath)) {
        throw new Error(`Section file not found: ${song.sectionPath}`);
      }
      if (!fs.existsSync(song.chordPath)) {
        throw new Error(`Chord file not found: ${song.chordPath}`);
      }

      const sectionData = parseLabFile(song.sectionPath);
      const chordData = parseLabFile(song.chordPath);
      
      const engineAnalysis = await analyzeSong(song.audioPath, (p) => {
        // Sub-progress for individual song analysis
        const songProgress = (i / SONGS.length) * 100 + (p / SONGS.length);
        sendProgress({ progress: songProgress, currentSong: song.title });
      });

      const keyScore = computeKeyScore(engineAnalysis, song.referenceKey);
      const chordRatio = computeChordOverlap(engineAnalysis, chordData);
      const segmentRatio = computeSegmentationScore(engineAnalysis, sectionData);

      const keyWeight = 0.4;
      const structureWeight = 0.3;
      const chordWeight = 0.3;
      const totalScore = Math.round(
        keyScore * keyWeight +
        (chordRatio * 100) * chordWeight +
        (segmentRatio * 100) * structureWeight
      );

      const result = {
        songId: song.id,
        title: song.title,
        keyScore,
        chordRatio,
        segmentRatio,
        totalScore,
        status: 'success',
      };

      results.push(result);
      sendProgress({
        progress,
        currentSong: song.title,
        result,
      });
    } catch (error) {
      logger.error(`Failed to analyze "${song.title}":`, error);
      results.push({
        songId: song.id,
        title: song.title,
        keyScore: 0,
        chordRatio: 0,
        segmentRatio: 0,
        totalScore: 0,
        status: 'error',
        error: error.message,
      });
      sendProgress({
        progress,
        currentSong: song.title,
        result: results[results.length - 1],
      });
    }
  }

  // Calculate summary
  const validResults = results.filter(r => r.status === 'success');
  const summary = {
    avgKeyScore: validResults.length > 0
      ? validResults.reduce((sum, r) => sum + r.keyScore, 0) / validResults.length
      : 0,
    avgChordRatio: validResults.length > 0
      ? validResults.reduce((sum, r) => sum + r.chordRatio, 0) / validResults.length
      : 0,
    avgSegmentRatio: validResults.length > 0
      ? validResults.reduce((sum, r) => sum + r.segmentRatio, 0) / validResults.length
      : 0,
    avgTotalScore: validResults.length > 0
      ? validResults.reduce((sum, r) => sum + r.totalScore, 0) / validResults.length
      : 0,
    songsPassed: results.filter(r => r.totalScore >= 50).length,
    songsTotal: results.length,
  };

  sendProgress({
    progress: 100,
    summary,
    complete: true,
  });

  return { success: true, results, summary };
}

module.exports = {
  runCalibration,
  SONGS,
};

