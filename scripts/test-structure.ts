import path from 'path';
import fs from 'fs';
import { parseSectionLab, SectionSegment } from '../benchmarks/labParser';

const metadataLookup = require('../electron/analysis/metadataLookup');
const listener = require('../electron/analysis/listener');
const architect = require('../electron/analysis/architect');
const theorist = require('../electron/analysis/theorist');

interface SongDefinition {
  id: string;
  title: string;
  audioPath: string;
  sectionPath: string;
}

interface StructureMetrics {
  songId: string;
  title: string;
  fScore: number;
  precision: number;
  recall: number;
  fragmentationIndex: number;
  detectedCount: number;
  groundTruthCount: number;
  hits: number;
  misses: number;
  ghosts: number;
  status: 'PASS' | 'FAIL' | 'WARN';
}

const ROOT = path.resolve(__dirname, '..');
const TOLERANCE_SECONDS = 3.0;

const SONGS: SongDefinition[] = [
  {
    id: 'come_together',
    title: 'Come Together',
    audioPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '01 Come Together.mp3'),
    sectionPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '01_-_Come_Together.lab'),
  },
  {
    id: 'eleanor_rigby',
    title: 'Eleanor Rigby',
    audioPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '02 Eleanor Rigby.mp3'),
    sectionPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '02_-_Eleanor_Rigby.lab'),
  },
  {
    id: 'maxwell',
    title: "Maxwell's Silver Hammer",
    audioPath: path.resolve(ROOT, 'electron', 'analysis', 'test', "03 Maxwell's Silver Hammer.mp3"),
    sectionPath: path.resolve(ROOT, 'electron', 'analysis', 'test', "03_-_Maxwell's_Silver_Hammer.lab"),
  },
  {
    id: 'ob_la_di',
    title: 'Ob-La-Di, Ob-La-Da',
    audioPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '04 Ob-La-Di, Ob-La-Da.mp3'),
    sectionPath: path.resolve(ROOT, 'electron', 'analysis', 'test', 'CD1_-_04_-_Ob-La-Di,_Ob-La-Da.lab'),
  },
  {
    id: 'let_it_be',
    title: 'Let It Be',
    audioPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '06 Let It Be.mp3'),
    sectionPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '06_-_Let_It_Be.lab'),
  },
  {
    id: 'helter_skelter',
    title: 'Helter Skelter',
    audioPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '06 Helter Skelter.mp3'),
    sectionPath: path.resolve(ROOT, 'electron', 'analysis', 'test', 'CD2_-_06_-_Helter_Skelter.lab'),
  },
  {
    id: 'day_in_the_life',
    title: 'A Day In The Life',
    audioPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '13 A Day In The Life.mp3'),
    sectionPath: path.resolve(ROOT, 'electron', 'analysis', 'test', '13_-_A_Day_In_The_Life.lab'),
  },
];

async function analyzeSong(audioPath: string) {
  const metadata = metadataLookup.gatherMetadata(audioPath, {});
  const analysisResult = await listener.analyzeAudio(audioPath, () => {}, metadata);
  const linearAnalysis = analysisResult.linear_analysis;

  const structuralMap = await architect.analyzeStructure(linearAnalysis, () => {});
  const correctedStructuralMap = await theorist.correctStructuralMap(
    structuralMap,
    linearAnalysis,
    metadata,
    () => {},
  );

  return correctedStructuralMap;
}

function extractDetectedBoundaries(structuralMap: any): number[] {
  const sections = structuralMap?.sections || [];
  const boundaries: number[] = [0]; // Start is always a boundary

  sections.forEach((section: any) => {
    const startTime = section.time_range?.start_time;
    if (startTime !== undefined && startTime !== null && startTime > 0) {
      boundaries.push(startTime);
    }
  });

  // Sort and deduplicate
  boundaries.sort((a, b) => a - b);
  const unique: number[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    if (i === 0 || Math.abs(boundaries[i] - boundaries[i - 1]) > 0.1) {
      unique.push(boundaries[i]);
    }
  }

  return unique;
}

function extractGroundTruthBoundaries(sectionSegments: SectionSegment[]): number[] {
  const boundaries: number[] = [0]; // Start is always a boundary

  sectionSegments.forEach((seg) => {
    if (seg.start > 0) {
      boundaries.push(seg.start);
    }
  });

  // Sort and deduplicate
  boundaries.sort((a, b) => a - b);
  const unique: number[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    if (i === 0 || Math.abs(boundaries[i] - boundaries[i - 1]) > 0.1) {
      unique.push(boundaries[i]);
    }
  }

  return unique;
}

function calculateBoundaryFMeasure(
  detectedBoundaries: number[],
  groundTruthBoundaries: number[],
): { fScore: number; precision: number; recall: number; hits: number; misses: number; ghosts: number } {
  const tolerance = TOLERANCE_SECONDS;
  let hits = 0;
  let misses = 0;
  let ghosts = 0;

  // Track which ground truth boundaries were matched
  const matchedGT = new Set<number>();

  // For each detected boundary, check if it matches a ground truth boundary
  for (const detected of detectedBoundaries) {
    let matched = false;
    for (const gt of groundTruthBoundaries) {
      if (Math.abs(detected - gt) <= tolerance) {
        matched = true;
        matchedGT.add(gt);
        hits++;
        break;
      }
    }
    if (!matched) {
      ghosts++; // False positive
    }
  }

  // Count unmatched ground truth boundaries (misses)
  for (const gt of groundTruthBoundaries) {
    if (!matchedGT.has(gt)) {
      misses++;
    }
  }

  // Calculate precision and recall
  const precision = detectedBoundaries.length > 0 ? hits / detectedBoundaries.length : 0;
  const recall = groundTruthBoundaries.length > 0 ? hits / groundTruthBoundaries.length : 0;

  // F-Measure (F1 Score)
  const fScore = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { fScore, precision, recall, hits, misses, ghosts };
}

function calculateFragmentationIndex(detectedCount: number, groundTruthCount: number): number {
  if (groundTruthCount === 0) return detectedCount > 0 ? Infinity : 1.0;
  return detectedCount / groundTruthCount;
}

function determineStatus(fScore: number, fragmentationIndex: number): 'PASS' | 'FAIL' | 'WARN' {
  if (fScore >= 0.8 && fragmentationIndex >= 0.8 && fragmentationIndex <= 1.2) {
    return 'PASS';
  }
  if (fScore < 0.5 || fragmentationIndex > 1.5 || fragmentationIndex < 0.5) {
    return 'FAIL';
  }
  return 'WARN';
}

function getStatusIcon(status: 'PASS' | 'FAIL' | 'WARN'): string {
  switch (status) {
    case 'PASS':
      return '✅';
    case 'FAIL':
      return '❌';
    case 'WARN':
      return '⚠️';
  }
}

function getStatusLabel(status: 'PASS' | 'FAIL' | 'WARN', fragmentationIndex: number): string {
  if (status === 'PASS') return 'PASS';
  if (fragmentationIndex > 1.5) return 'FAIL (Over-segmented)';
  if (fragmentationIndex < 0.5) return 'FAIL (Under-segmented)';
  return 'OK'; // Changed from 'WARN' to match user's specification
}

function generateSuggestion(metrics: StructureMetrics): string | null {
  if (metrics.fragmentationIndex > 1.5) {
    return `Suggestion: Increase MIN_SECTION_DURATION or NOVELTY_THRESHOLD in architect.js (currently detecting ${metrics.detectedCount} sections vs ${metrics.groundTruthCount} expected)`;
  }
  if (metrics.fragmentationIndex < 0.5) {
    return `Suggestion: Enable Timbre Tracking (MFCCs) in Pass 2 - sections may be too similar (detected ${metrics.detectedCount} vs ${metrics.groundTruthCount} expected)`;
  }
  if (metrics.ghosts > metrics.hits && metrics.fragmentationIndex > 1.2) {
    return `Suggestion: Apply 10-second moving average smoothing to Novelty Curve in architect.js (${metrics.ghosts} false positives, ${metrics.hits} hits)`;
  }
  if (metrics.misses > metrics.hits * 2) {
    return `Suggestion: Lower NOVELTY_THRESHOLD or improve similarity detection - missing ${metrics.misses} boundaries (only ${metrics.hits} hits)`;
  }
  return null;
}

async function testSong(song: SongDefinition): Promise<StructureMetrics> {
  console.log(`\nAnalyzing "${song.title}"...`);

  // Load ground truth
  const groundTruthSections = parseSectionLab(song.sectionPath);
  const groundTruthBoundaries = extractGroundTruthBoundaries(groundTruthSections);

  // Run analysis
  const structuralMap = await analyzeSong(song.audioPath);
  const detectedBoundaries = extractDetectedBoundaries(structuralMap);

  // Calculate metrics
  const { fScore, precision, recall, hits, misses, ghosts } = calculateBoundaryFMeasure(
    detectedBoundaries,
    groundTruthBoundaries,
  );

  const fragmentationIndex = calculateFragmentationIndex(
    detectedBoundaries.length,
    groundTruthBoundaries.length,
  );

  const status = determineStatus(fScore, fragmentationIndex);

  return {
    songId: song.id,
    title: song.title,
    fScore,
    precision,
    recall,
    fragmentationIndex,
    detectedCount: detectedBoundaries.length,
    groundTruthCount: groundTruthBoundaries.length,
    hits,
    misses,
    ghosts,
    status,
  };
}

function printReport(results: StructureMetrics[]) {
  console.log('\n' + '='.repeat(80));
  console.log('STRUCTURE STABILITY TEST REPORT');
  console.log('='.repeat(80));
  console.log(`Tolerance: ±${TOLERANCE_SECONDS} seconds`);
  console.log('\n' + '-'.repeat(80));
  
  // Header
  const header = [
    'SONG'.padEnd(30),
    'F-SCORE'.padEnd(8),
    'FRAG. INDEX'.padEnd(12),
    'STATUS'.padEnd(25),
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(80));

  // Rows
  for (const result of results) {
    const title = result.title.padEnd(30);
    const fScore = result.fScore.toFixed(2).padEnd(8);
    const fragIndex = result.fragmentationIndex.toFixed(2).padEnd(12);
    const statusIcon = getStatusIcon(result.status);
    const statusLabel = getStatusLabel(result.status, result.fragmentationIndex);
    const status = `${statusIcon} ${statusLabel}`.padEnd(25);

    console.log([title, fScore, fragIndex, status].join(' | '));
  }

  console.log('-'.repeat(80));

  // Summary statistics
  const avgFScore = results.reduce((sum, r) => sum + r.fScore, 0) / results.length;
  const avgFragIndex = results.reduce((sum, r) => sum + r.fragmentationIndex, 0) / results.length;
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const warnCount = results.filter((r) => r.status === 'WARN').length;

  console.log(`\nSummary:`);
  console.log(`  Average F-Score: ${avgFScore.toFixed(3)}`);
  console.log(`  Average Fragmentation Index: ${avgFragIndex.toFixed(2)}`);
  console.log(`  Pass: ${passCount} | Warn: ${warnCount} | Fail: ${failCount}`);

  // Detailed breakdown for failed songs
  const failedSongs = results.filter((r) => r.status === 'FAIL' || r.fragmentationIndex > 1.5);
  if (failedSongs.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('DETAILED BREAKDOWN (Failed/Over-segmented Songs)');
    console.log('='.repeat(80));

    for (const result of failedSongs) {
      console.log(`\n${result.title}:`);
      console.log(`  F-Score: ${result.fScore.toFixed(3)} (Precision: ${result.precision.toFixed(3)}, Recall: ${result.recall.toFixed(3)})`);
      console.log(`  Boundaries: ${result.hits} hits, ${result.misses} misses, ${result.ghosts} ghosts`);
      console.log(`  Fragmentation: ${result.detectedCount} detected / ${result.groundTruthCount} expected = ${result.fragmentationIndex.toFixed(2)}`);
      
      const suggestion = generateSuggestion(result);
      if (suggestion) {
        console.log(`  ${suggestion}`);
      }
    }
  }

  // Suggestions for all songs with issues
  console.log('\n' + '='.repeat(80));
  console.log('REFINEMENT SUGGESTIONS');
  console.log('='.repeat(80));

  for (const result of results) {
    if (result.status !== 'PASS') {
      const suggestion = generateSuggestion(result);
      if (suggestion) {
        console.log(`\n${result.title}:`);
        console.log(`  ${suggestion}`);
      }
    }
  }

  // Print refinement hints for songs with Fragmentation Index > 1.5
  const overSegmented = results.filter((r) => r.fragmentationIndex > 1.5);
  if (overSegmented.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('REFINEMENT HINTS');
    console.log('='.repeat(80));
    
    for (const result of overSegmented) {
      console.log(`\n${result.title} (Fragmentation Index: ${result.fragmentationIndex.toFixed(2)}):`);
      console.log(`  Suggestion: Increase MIN_SECTION_DURATION or NOVELTY_THRESHOLD in architect.js`);
    }
  }

  // Visual boundary comparison (ASCII art)
  console.log('\n' + '='.repeat(80));
  console.log('VISUAL BOUNDARY COMPARISON');
  console.log('='.repeat(80));
  console.log('(Top: Ground Truth, Bottom: Detected)');
  console.log('');

  for (const result of results) {
    if (result.status !== 'PASS' && result.groundTruthCount > 0) {
      const maxWidth = 60;
      const scale = maxWidth / Math.max(result.groundTruthCount, result.detectedCount);
      
      console.log(`${result.title}:`);
      console.log(`  GT: ${'█'.repeat(Math.round(result.groundTruthCount * scale))} (${result.groundTruthCount} sections)`);
      console.log(`  DT: ${'█'.repeat(Math.round(result.detectedCount * scale))} (${result.detectedCount} sections)`);
      console.log('');
    }
  }
}

async function main() {
  console.log('Running Structure Stability Test...');
  console.log(`Testing ${SONGS.length} songs\n`);

  const results: StructureMetrics[] = [];

  for (const song of SONGS) {
    try {
      const metrics = await testSong(song);
      results.push(metrics);
    } catch (error) {
      console.error(`Failed to test "${song.title}":`, error);
      // Add failure entry
      results.push({
        songId: song.id,
        title: song.title,
        fScore: 0,
        precision: 0,
        recall: 0,
        fragmentationIndex: 0,
        detectedCount: 0,
        groundTruthCount: 0,
        hits: 0,
        misses: 0,
        ghosts: 0,
        status: 'FAIL',
      });
    }
  }

  // Capture report output
  const originalLog = console.log;
  const logLines: string[] = [];
  console.log = (...args: any[]) => {
    const line = args.map(String).join(' ');
    logLines.push(line);
    originalLog(...args);
  };

  printReport(results);
  console.log = originalLog;

  // Save report to file
  const reportPath = path.resolve(ROOT, 'benchmarks', 'results', 'structure-test-report.txt');
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, logLines.join('\n'));
  console.log(`\nReport saved to: ${reportPath}`);

  // Exit with error code if any failures
  const hasFailures = results.some((r) => r.status === 'FAIL');
  if (hasFailures) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Structure test failed:', error);
  process.exit(1);
});

