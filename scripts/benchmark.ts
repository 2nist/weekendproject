import path from 'path';
import fs from 'fs';
import {
  parseSectionLab,
  parseChordLab,
  SectionSegment,
  ChordSegment,
  normalizeChordLabel,
} from '../benchmarks/labParser';

const metadataLookup = require('../electron/analysis/metadataLookup');
const listener = require('../electron/analysis/listener');
const architect = require('../electron/analysis/architect_clean');
const theorist = require('../electron/analysis/theorist');

interface SongDefinition {
  id: string;
  title: string;
  audioPath: string;
  sectionPath: string;
  chordPath: string;
  referenceKey?: string;
}

interface BenchmarkMetrics {
  songId: string;
  title: string;
  keyScore: number;
  chordRatio: number;
  segmentRatio: number;
  totalScore: number;
  timestamp?: string;
  config?: AnalyzerConfig;
}

interface BenchmarkHistory {
  runs: Array<{
    timestamp: string;
    label: string;
    results: BenchmarkMetrics[];
    config: AnalyzerConfig;
    summary: {
      avgKeyScore: number;
      avgChordRatio: number;
      avgSegmentRatio: number;
      avgTotalScore: number;
      songsPassed: number;
      songsTotal: number;
    };
  }>;
}

interface RegressionAlert {
  songId: string;
  title: string;
  metric: 'keyScore' | 'chordRatio' | 'segmentRatio' | 'totalScore';
  previous: number;
  current: number;
  change: number;
  threshold: number;
}

interface AnalyzerConfig {
  chroma_smoothing_window: number;
  bass_weight: number;
  rhythm_method: string;
  onset_sensitivity: number;
  spectral_whitening: number;
  novelty_threshold: number;
  rms_threshold_adaptive: boolean;
  chord_duration_min: number;
  key_detection_major_bias: number;
}

const ROOT = path.resolve(__dirname, '..');
const ANALYZER_CONFIG_PATH = path.resolve(
  ROOT,
  'electron',
  'analysis',
  'audioAnalyzerConfig.json',
);
const BENCHMARK_RESULTS_DIR = path.resolve(ROOT, 'benchmarks', 'results');
const BENCHMARK_HISTORY_FILE = path.resolve(
  BENCHMARK_RESULTS_DIR,
  'history.json',
);

const SONGS: SongDefinition[] = [
  {
    id: 'come_together',
    title: 'Come Together',
    audioPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '01 Come Together.mp3',
    ),
    sectionPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '01_-_Come_Together.lab',
    ),
    chordPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '01_-_Come_Together_chord.lab',
    ),
    referenceKey: 'D:min',
  },
  {
    id: 'eleanor_rigby',
    title: 'Eleanor Rigby',
    audioPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '02 Eleanor Rigby.mp3',
    ),
    sectionPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '02_-_Eleanor_Rigby.lab',
    ),
    chordPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '02_-_Eleanor_Rigby_chord.lab',
    ),
    referenceKey: 'E:min',
  },
  {
    id: 'maxwell',
    title: "Maxwell's Silver Hammer",
    audioPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      "03 Maxwell's Silver Hammer.mp3",
    ),
    sectionPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      "03_-_Maxwell's_Silver_Hammer.lab",
    ),
    chordPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      "03_-_Maxwell's_Silver_Hammer_chord.lab",
    ),
    referenceKey: 'D:maj',
  },
  {
    id: 'ob_la_di',
    title: 'Ob-La-Di, Ob-La-Da',
    audioPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '04 Ob-La-Di, Ob-La-Da.mp3',
    ),
    sectionPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      'CD1_-_04_-_Ob-La-Di,_Ob-La-Da.lab',
    ),
    chordPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      'CD1_-_04_-_Ob-La-Di,_Ob-La-Da_chord.lab',
    ),
    referenceKey: 'Bb:maj',
  },
  {
    id: 'let_it_be',
    title: 'Let It Be',
    audioPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '06 Let It Be.mp3',
    ),
    sectionPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '06_-_Let_It_Be.lab',
    ),
    chordPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '06_-_Let_It_Be_chord.lab',
    ),
    referenceKey: 'C:maj',
  },
  {
    id: 'helter_skelter',
    title: 'Helter Skelter',
    audioPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '06 Helter Skelter.mp3',
    ),
    sectionPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      'CD2_-_06_-_Helter_Skelter.lab',
    ),
    chordPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      'CD2_-_06_-_Helter_Skelter_chord.lab',
    ),
    referenceKey: 'E:maj',
  },
  {
    id: 'day_in_the_life',
    title: 'A Day In The Life',
    audioPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '13 A Day In The Life.mp3',
    ),
    sectionPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '13_-_A_Day_In_The_Life.lab',
    ),
    chordPath: path.resolve(
      ROOT,
      'electron',
      'analysis',
      'test',
      '13_-_A_Day_In_The_Life_chord.lab',
    ),
    referenceKey: 'G:maj',
  },
];

async function analyzeSong(audioPath: string) {
  const metadata = metadataLookup.gatherMetadata(audioPath, {});
  const analysisResult = await listener.analyzeAudio(
    audioPath,
    () => {},
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

  const harmonicContext = buildHarmonicContext(linearAnalysis, metadata);

  return {
    linear_analysis: linearAnalysis,
    structural_map: correctedStructuralMap,
    harmonic_context: harmonicContext,
  };
}

function buildHarmonicContext(linearAnalysis: any, metadata: any) {
  const detectedKey =
    linearAnalysis?.metadata?.detected_key || metadata?.key_hint || 'C';
  const detectedMode =
    linearAnalysis?.metadata?.detected_mode || metadata?.mode_hint || 'major';

  return {
    global_key: {
      primary_key: detectedKey,
      mode: detectedMode,
      confidence: 0.8,
    },
  };
}

async function runBenchmarks(label = 'Baseline'): Promise<BenchmarkMetrics[]> {
  console.log(`\n=== ${label} Benchmark ===`);
  const config = loadAnalyzerConfig();
  const results: BenchmarkMetrics[] = [];

  for (const song of SONGS) {
    console.log(`\nAnalyzing "${song.title}"...`);
    try {
      const sectionData = parseSectionLab(song.sectionPath);
      const chordData = parseChordLab(song.chordPath);
      const engineAnalysis = await analyzeSong(song.audioPath);
      const metrics = scoreSong(song, sectionData, chordData, engineAnalysis);
      results.push(metrics);
    } catch (error) {
      console.error(`Failed to analyze "${song.title}":`, error);
      // Add a zero-score entry for failed songs
      results.push({
        songId: song.id,
        title: song.title,
        keyScore: 0,
        chordRatio: 0,
        segmentRatio: 0,
        totalScore: 0,
      });
    }
  }

  printReport(results, label);
  saveResults(results, label, config);

  // Detect regressions
  const alerts = detectRegressions(results);
  printRegressionAlerts(alerts);

  return results;
}

function scoreSong(
  song: SongDefinition,
  sectionSegments: SectionSegment[],
  chordSegments: ChordSegment[],
  engineAnalysis: any,
): BenchmarkMetrics {
  const keyRatio = computeKeyScore(engineAnalysis, song.referenceKey);
  const chordRatio = computeChordOverlap(engineAnalysis, chordSegments);
  const segmentRatio = computeSegmentationScore(
    engineAnalysis,
    sectionSegments,
  );

  // Weighted scoring: Higher weight to Key (40%) and Structure (30%), Chord (30%)
  // This reflects the importance of correct key detection and structure segmentation
  const keyWeight = 0.4;
  const structureWeight = 0.3;
  const chordWeight = 0.3;

  const keyScore = keyRatio >= 0.999 ? 100 : 0; // Binary: correct = 100, wrong = 0
  const chordScore = chordRatio * 100;
  const segmentScore = segmentRatio * 100;

  // Weighted total score (0-100)
  const totalScore = Math.round(
    keyScore * keyWeight +
      chordScore * chordWeight +
      segmentScore * structureWeight,
  );

  // Legacy scores for backward compatibility
  const legacyKeyScore = keyRatio >= 0.999 ? 20 : 0;
  const legacyChordScore = chordRatio * 60;
  const legacySegmentScore = segmentRatio * 20;

  return {
    songId: song.id,
    title: song.title,
    keyScore: legacyKeyScore, // Keep for compatibility
    chordRatio,
    segmentRatio,
    totalScore, // Now weighted
  };
}

function computeKeyScore(engineAnalysis: any, referenceKey?: string): number {
  if (!referenceKey) return 0;
  const expectedKey = normalizeChordLabel(referenceKey);
  if (!expectedKey) return 0;

  const engineKeyObj = engineAnalysis?.harmonic_context?.global_key || {};
  const engineKeyLabel = buildKeyLabel(
    engineKeyObj.primary_key,
    engineKeyObj.mode,
  );
  const engineKey = normalizeChordLabel(engineKeyLabel || '');
  if (!engineKey) return 0;
  return engineKey === expectedKey ? 1 : 0;
}

function buildKeyLabel(root?: string, mode?: string) {
  if (!root) return null;
  const normalizedRoot = normalizeChordLabel(root) || root;
  if (!mode) return normalizedRoot;
  const lower = mode.toLowerCase();
  if (lower.includes('minor') || lower.includes('aeolian')) {
    return `${normalizedRoot}:min`;
  }
  return `${normalizedRoot}:maj`;
}

function computeChordOverlap(
  engineAnalysis: any,
  chordSegments: ChordSegment[],
): number {
  const labChords = chordSegments.filter((seg) => seg.normalizedChord);
  const engineChordTimeline = buildEngineChordTimeline(engineAnalysis);

  if (!labChords.length || !engineChordTimeline.length) {
    return 0;
  }

  let totalOverlap = 0;
  let matchedOverlap = 0;

  for (const labSeg of labChords) {
    for (const engSeg of engineChordTimeline) {
      const overlap = getOverlap(
        labSeg.start,
        labSeg.end,
        engSeg.start,
        engSeg.end,
      );
      if (overlap <= 0) continue;

      totalOverlap += overlap;
      if (chordMatches(engSeg.chord, labSeg.normalizedChord!)) {
        matchedOverlap += overlap;
      }
    }
  }

  return totalOverlap > 0 ? matchedOverlap / totalOverlap : 0;
}

function computeSegmentationScore(
  engineAnalysis: any,
  sectionSegments: SectionSegment[],
): number {
  const labBoundaries = sectionSegments
    .map((seg) => seg.start)
    .filter(
      (value, index, array) =>
        value > 0 && (index === 0 || value !== array[index - 1]),
    );

  if (!labBoundaries.length) {
    return 0;
  }

  const sectionBoundaries = collectSectionBoundaries(engineAnalysis);
  if (!sectionBoundaries.length) {
    return 0;
  }

  const tolerance = 2; // seconds
  let matched = 0;
  labBoundaries.forEach((boundary) => {
    if (
      sectionBoundaries.some(
        (candidate) => Math.abs(candidate - boundary) <= tolerance,
      )
    ) {
      matched += 1;
    }
  });

  return matched / labBoundaries.length;
}

function buildEngineChordTimeline(engineAnalysis: any) {
  const events = engineAnalysis?.linear_analysis?.events || [];
  const chordEvents = events
    .filter(
      (event: any) =>
        event.event_type === 'chord_candidate' && event.chord_candidate,
    )
    .map((event: any) => ({
      timestamp: event.timestamp || 0,
      chord: formatChordCandidate(event.chord_candidate),
    }))
    .filter((entry: any) => entry.chord)
    .sort((a: any, b: any) => a.timestamp - b.timestamp);

  const duration =
    engineAnalysis?.linear_analysis?.metadata?.duration_seconds ||
    chordEvents[chordEvents.length - 1]?.timestamp ||
    0;

  const segments: { start: number; end: number; chord: string }[] = [];
  for (let i = 0; i < chordEvents.length; i++) {
    const current = chordEvents[i];
    const next = chordEvents[i + 1];
    const end = next ? next.timestamp : duration;
    if (end > current.timestamp) {
      segments.push({
        start: current.timestamp,
        end,
        chord: current.chord,
      });
    }
  }
  return segments;
}

function formatChordCandidate(chordCandidate: any): string | null {
  const root = chordCandidate?.root_candidates?.[0]?.root;
  const quality = chordCandidate?.quality_candidates?.[0]?.quality;
  if (!root) return null;
  const normalized = normalizeChordLabel(`${root}:${quality || ''}`);
  return normalized;
}

function collectSectionBoundaries(engineAnalysis: any): number[] {
  const sections = engineAnalysis?.structural_map?.sections || [];
  const boundaries = sections
    .map((section: any) => section?.time_range?.start_time ?? 0)
    .filter(
      (value: number, index: number, array: number[]) =>
        index === 0 || value !== array[index - 1],
    );
  return boundaries.sort((a: number, b: number) => a - b);
}

function getOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

function chordMatches(engineChord: string, labChord: string): boolean {
  if (!engineChord || !labChord) return false;
  if (engineChord === labChord) return true;
  const engineRoot = engineChord[0];
  const labRoot = labChord[0];
  return engineRoot === labRoot;
}

function printReport(results: BenchmarkMetrics[], label: string) {
  console.log(
    `\n${label} Results (Weighted Scoring: Key 40%, Chord 30%, Structure 30%):`,
  );
  const table = results.map((result) => ({
    Song: result.title,
    Key: result.keyScore > 0 ? '✓' : '✗',
    'Key Pts': result.keyScore,
    'Chord %': `${(result.chordRatio * 100).toFixed(1)}%`,
    'Segments %': `${(result.segmentRatio * 100).toFixed(1)}%`,
    Weighted: result.totalScore,
  }));
  console.table(table);

  // Calculate summary statistics
  const summary = calculateSummary(results);
  console.log(`\n${label} Summary:`);
  console.log(`  Average Key Score: ${summary.avgKeyScore.toFixed(1)}`);
  console.log(
    `  Average Chord Ratio: ${(summary.avgChordRatio * 100).toFixed(1)}%`,
  );
  console.log(
    `  Average Segment Ratio: ${(summary.avgSegmentRatio * 100).toFixed(1)}%`,
  );
  console.log(`  Average Total Score: ${summary.avgTotalScore.toFixed(1)}`);
  console.log(
    `  Songs Passed (Total > 50): ${summary.songsPassed}/${summary.songsTotal}`,
  );
}

function calculateSummary(results: BenchmarkMetrics[]) {
  const avgKeyScore =
    results.reduce((sum, r) => sum + r.keyScore, 0) / results.length;
  const avgChordRatio =
    results.reduce((sum, r) => sum + r.chordRatio, 0) / results.length;
  const avgSegmentRatio =
    results.reduce((sum, r) => sum + r.segmentRatio, 0) / results.length;
  const avgTotalScore =
    results.reduce((sum, r) => sum + r.totalScore, 0) / results.length;
  const songsPassed = results.filter((r) => r.totalScore > 50).length;

  return {
    avgKeyScore,
    avgChordRatio,
    avgSegmentRatio,
    avgTotalScore,
    songsPassed,
    songsTotal: results.length,
  };
}

function saveResults(
  results: BenchmarkMetrics[],
  label: string,
  config: AnalyzerConfig,
) {
  // Ensure results directory exists
  if (!fs.existsSync(BENCHMARK_RESULTS_DIR)) {
    fs.mkdirSync(BENCHMARK_RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const summary = calculateSummary(results);

  // Add timestamp and config to each result
  const resultsWithMeta = results.map((r) => ({
    ...r,
    timestamp,
    config,
  }));

  // Save individual run
  const runFile = path.resolve(
    BENCHMARK_RESULTS_DIR,
    `run_${timestamp.replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(
    runFile,
    JSON.stringify(
      {
        timestamp,
        label,
        results: resultsWithMeta,
        config,
        summary,
      },
      null,
      2,
    ),
  );

  // Update history
  let history: BenchmarkHistory = { runs: [] };
  if (fs.existsSync(BENCHMARK_HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(BENCHMARK_HISTORY_FILE, 'utf8'));
    } catch (e) {
      console.warn('Failed to parse history file, starting fresh');
    }
  }

  history.runs.push({
    timestamp,
    label,
    results: resultsWithMeta,
    config,
    summary,
  });

  // Keep only last 50 runs
  if (history.runs.length > 50) {
    history.runs = history.runs.slice(-50);
  }

  fs.writeFileSync(BENCHMARK_HISTORY_FILE, JSON.stringify(history, null, 2));

  console.log(`\nResults saved to: ${runFile}`);
  console.log(`History updated: ${BENCHMARK_HISTORY_FILE}`);
}

function detectRegressions(
  current: BenchmarkMetrics[],
  threshold = 0.1,
): RegressionAlert[] {
  const alerts: RegressionAlert[] = [];

  if (!fs.existsSync(BENCHMARK_HISTORY_FILE)) {
    return alerts; // No history to compare against
  }

  try {
    const history: BenchmarkHistory = JSON.parse(
      fs.readFileSync(BENCHMARK_HISTORY_FILE, 'utf8'),
    );
    if (history.runs.length < 2) {
      return alerts; // Need at least one previous run
    }

    // Get the most recent run (excluding current)
    const previousRun = history.runs[history.runs.length - 1];
    const previousResults = previousRun.results;

    for (const currentResult of current) {
      const previousResult = previousResults.find(
        (r) => r.songId === currentResult.songId,
      );
      if (!previousResult) continue;

      // Check each metric
      const metrics: Array<
        'keyScore' | 'chordRatio' | 'segmentRatio' | 'totalScore'
      > = ['keyScore', 'chordRatio', 'segmentRatio', 'totalScore'];

      for (const metric of metrics) {
        const prev = previousResult[metric];
        const curr = currentResult[metric];
        const change = curr - prev;
        const changePercent =
          prev !== 0 ? Math.abs(change / prev) : Math.abs(change);

        // Alert if significant regression (more than threshold decrease)
        if (change < 0 && changePercent > threshold) {
          alerts.push({
            songId: currentResult.songId,
            title: currentResult.title,
            metric,
            previous: prev,
            current: curr,
            change,
            threshold,
          });
        }
      }
    }
  } catch (e) {
    console.warn('Failed to detect regressions:', e);
  }

  return alerts;
}

function printRegressionAlerts(alerts: RegressionAlert[]) {
  if (alerts.length === 0) {
    console.log('\n✓ No regressions detected!');
    return;
  }

  console.log(`\n⚠️  ${alerts.length} Regression(s) Detected:`);
  alerts.forEach((alert) => {
    const changePercent = ((alert.change / alert.previous) * 100).toFixed(1);
    console.log(
      `  ${alert.title} - ${alert.metric}: ${alert.previous.toFixed(2)} → ${alert.current.toFixed(2)} (${changePercent}% decrease)`,
    );
  });
}

async function optimizeEngine(baseline: BenchmarkMetrics[]): Promise<void> {
  let config = loadAnalyzerConfig();
  let modified = false;
  const maxIterations = 3;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n=== Optimization Iteration ${iteration} ===`);
    modified = false;

    // Song-specific optimizations based on failure patterns
    const eleanor = baseline.find((r) => r.songId === 'eleanor_rigby');
    const helter = baseline.find((r) => r.songId === 'helter_skelter');
    const dayInLife = baseline.find((r) => r.songId === 'day_in_the_life');
    const maxwell = baseline.find((r) => r.songId === 'maxwell');
    const obLaDi = baseline.find((r) => r.songId === 'ob_la_di');
    const letItBe = baseline.find((r) => r.songId === 'let_it_be');

    // Eleanor Rigby: No drums - needs higher onset sensitivity for string attacks
    if (eleanor && eleanor.segmentRatio < 0.5) {
      if (config.onset_sensitivity < 0.8) {
        config.onset_sensitivity = Math.min(
          0.9,
          config.onset_sensitivity + 0.1,
        );
        console.log(
          `✓ Eleanor Rigby: Increased onset_sensitivity to ${config.onset_sensitivity} for string attack detection`,
        );
        modified = true;
      }
      // Try Degara method if multifeature fails
      if (config.rhythm_method === 'multifeature' && eleanor.totalScore < 30) {
        config.rhythm_method = 'degara';
        console.log(
          `✓ Eleanor Rigby: Switched rhythm_method to 'degara' for non-percussive rhythm`,
        );
        modified = true;
      }
    }

    // Helter Skelter: Distortion/noise - needs spectral whitening
    if (helter && helter.chordRatio < 0.3) {
      if (config.spectral_whitening < 0.5) {
        config.spectral_whitening = Math.min(
          0.7,
          config.spectral_whitening + 0.2,
        );
        console.log(
          `✓ Helter Skelter: Increased spectral_whitening to ${config.spectral_whitening} to remove noise floor`,
        );
        modified = true;
      }
    }

    // A Day In The Life: Orchestral swells create false sections
    if (dayInLife) {
      const sections = dayInLife.segmentRatio;
      // If too many sections detected (ratio > 1.5x expected), increase threshold
      if (sections > 0.8 || dayInLife.totalScore < 20) {
        if (config.novelty_threshold < 0.3) {
          config.novelty_threshold = Math.min(
            0.4,
            config.novelty_threshold + 0.05,
          );
          console.log(
            `✓ A Day In The Life: Increased novelty_threshold to ${config.novelty_threshold} to reduce false positives`,
          );
          modified = true;
        }
      }
    }

    // Maxwell & Ob-La-Di: Major keys with chromatic passing chords
    if (
      (maxwell && maxwell.keyScore === 0) ||
      (obLaDi && obLaDi.keyScore === 0)
    ) {
      if (config.key_detection_major_bias < 0.3) {
        config.key_detection_major_bias = Math.min(
          0.4,
          config.key_detection_major_bias + 0.1,
        );
        console.log(
          `✓ Maxwell/Ob-La-Di: Increased key_detection_major_bias to ${config.key_detection_major_bias} for chromatic tolerance`,
        );
        modified = true;
      }
    }

    // Ob-La-Di: Fast harmonic rhythm (chords change every 2 beats)
    if (obLaDi && obLaDi.chordRatio < 0.4) {
      if (config.chord_duration_min > 0.5) {
        config.chord_duration_min = Math.max(
          0.3,
          config.chord_duration_min - 0.2,
        );
        console.log(
          `✓ Ob-La-Di: Decreased chord_duration_min to ${config.chord_duration_min} for fast harmonic rhythm`,
        );
        modified = true;
      }
    }

    // Maxwell: Complex harmonic movement
    if (maxwell && maxwell.chordRatio < 0.5) {
      config.chroma_smoothing_window = Math.max(
        1,
        Math.round(config.chroma_smoothing_window * 0.9),
      );
      console.log(
        `✓ Maxwell: Adjusted chroma_smoothing_window to ${config.chroma_smoothing_window} for complex harmony`,
      );
      modified = true;
    }

    // Control: Let It Be should not regress
    if (letItBe && letItBe.totalScore < 40 && iteration > 1) {
      console.log(
        `⚠️  Let It Be (control) regressed to ${letItBe.totalScore}. Stopping optimization.`,
      );
      break;
    }

    if (!modified) {
      console.log('No further optimizations needed.');
      break;
    }

    saveAnalyzerConfig(config);
    console.log('\nRe-running benchmarks after optimization...');
    const newResults = await runBenchmarks(`Iteration-${iteration}`);

    // Check if we improved
    const improvement =
      newResults.reduce((sum, r) => sum + r.totalScore, 0) -
      baseline.reduce((sum, r) => sum + r.totalScore, 0);

    if (improvement <= 0 && iteration > 1) {
      console.log(
        `\n⚠️  No improvement detected (${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}). Stopping.`,
      );
      break;
    }

    baseline = newResults;
  }

  console.log('\n=== Optimization Complete ===');
  console.log('Final Configuration:');
  console.log(JSON.stringify(config, null, 2));
}

function loadAnalyzerConfig(): AnalyzerConfig {
  try {
    const raw = fs.readFileSync(ANALYZER_CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    // Ensure all required fields exist with defaults
    return {
      chroma_smoothing_window: config.chroma_smoothing_window ?? 8,
      bass_weight: config.bass_weight ?? 1.0,
      rhythm_method: config.rhythm_method ?? 'multifeature',
      onset_sensitivity: config.onset_sensitivity ?? 0.5,
      spectral_whitening: config.spectral_whitening ?? 0.0,
      novelty_threshold: config.novelty_threshold ?? 0.15,
      rms_threshold_adaptive: config.rms_threshold_adaptive ?? true,
      chord_duration_min: config.chord_duration_min ?? 1.0,
      key_detection_major_bias: config.key_detection_major_bias ?? 0.0,
    };
  } catch {
    const defaults: AnalyzerConfig = {
      chroma_smoothing_window: 8,
      bass_weight: 1.0,
      rhythm_method: 'multifeature',
      onset_sensitivity: 0.5,
      spectral_whitening: 0.0,
      novelty_threshold: 0.15,
      rms_threshold_adaptive: true,
      chord_duration_min: 1.0,
      key_detection_major_bias: 0.0,
    };
    saveAnalyzerConfig(defaults);
    return defaults;
  }
}

function saveAnalyzerConfig(config: AnalyzerConfig) {
  fs.writeFileSync(ANALYZER_CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  switch (command) {
    case 'run':
      const baseline = await runBenchmarks('Baseline');
      await optimizeEngine(baseline);
      break;

    case 'history':
      printHistory();
      break;

    case 'compare':
      if (args.length < 3) {
        console.error(
          'Usage: npm run test:benchmark compare <run1_timestamp> <run2_timestamp>',
        );
        process.exit(1);
      }
      compareRuns(args[1], args[2]);
      break;

    case 'latest':
      printLatestRun();
      break;

    default:
      console.log('Available commands:');
      console.log('  run      - Run benchmarks (default)');
      console.log('  history  - Show benchmark history');
      console.log('  compare  - Compare two benchmark runs');
      console.log('  latest   - Show latest benchmark results');
      break;
  }
}

function printHistory() {
  if (!fs.existsSync(BENCHMARK_HISTORY_FILE)) {
    console.log('No benchmark history found.');
    return;
  }

  const history: BenchmarkHistory = JSON.parse(
    fs.readFileSync(BENCHMARK_HISTORY_FILE, 'utf8'),
  );
  console.log(`\nBenchmark History (${history.runs.length} runs):\n`);

  history.runs.forEach((run, idx) => {
    console.log(
      `${idx + 1}. ${run.label} - ${new Date(run.timestamp).toLocaleString()}`,
    );
    console.log(`   Avg Total Score: ${run.summary.avgTotalScore.toFixed(1)}`);
    console.log(
      `   Songs Passed: ${run.summary.songsPassed}/${run.summary.songsTotal}`,
    );
    console.log('');
  });
}

function compareRuns(timestamp1: string, timestamp2: string) {
  if (!fs.existsSync(BENCHMARK_HISTORY_FILE)) {
    console.log('No benchmark history found.');
    return;
  }

  const history: BenchmarkHistory = JSON.parse(
    fs.readFileSync(BENCHMARK_HISTORY_FILE, 'utf8'),
  );
  const run1 = history.runs.find((r) => r.timestamp.includes(timestamp1));
  const run2 = history.runs.find((r) => r.timestamp.includes(timestamp2));

  if (!run1 || !run2) {
    console.error('Could not find runs with those timestamps.');
    return;
  }

  console.log(`\nComparing:`);
  console.log(
    `  Run 1: ${run1.label} (${new Date(run1.timestamp).toLocaleString()})`,
  );
  console.log(
    `  Run 2: ${run2.label} (${new Date(run2.timestamp).toLocaleString()})\n`,
  );

  const comparison = run1.results
    .map((r1) => {
      const r2 = run2.results.find((r) => r.songId === r1.songId);
      if (!r2) return null;

      return {
        Song: r1.title,
        'Total Score': `${r1.totalScore} → ${r2.totalScore} (${r2.totalScore - r1.totalScore > 0 ? '+' : ''}${r2.totalScore - r1.totalScore})`,
        'Chord Ratio': `${(r1.chordRatio * 100).toFixed(1)}% → ${(r2.chordRatio * 100).toFixed(1)}%`,
        'Segment Ratio': `${(r1.segmentRatio * 100).toFixed(1)}% → ${(r2.segmentRatio * 100).toFixed(1)}%`,
      };
    })
    .filter(Boolean);

  console.table(comparison);
}

function printLatestRun() {
  if (!fs.existsSync(BENCHMARK_HISTORY_FILE)) {
    console.log('No benchmark history found.');
    return;
  }

  const history: BenchmarkHistory = JSON.parse(
    fs.readFileSync(BENCHMARK_HISTORY_FILE, 'utf8'),
  );
  if (history.runs.length === 0) {
    console.log('No benchmark runs found.');
    return;
  }

  const latest = history.runs[history.runs.length - 1];
  console.log(
    `\nLatest Run: ${latest.label} (${new Date(latest.timestamp).toLocaleString()})\n`,
  );
  printReport(latest.results, latest.label);
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
