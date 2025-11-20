/**
 * Test script to compare analysis results against .lab ground truth files
 * Tests chord detection accuracy
 */

const path = require('path');
const fs = require('fs');
const { analyzeAudio } = require('../electron/analysis/listener');

/**
 * Parse .lab file format: start_time end_time chord_label
 */
function parseLabFile(labPath) {
  const content = fs.readFileSync(labPath, 'utf8');
  const lines = content.trim().split('\n');
  const annotations = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 3) {
      const startTime = parseFloat(parts[0]);
      const endTime = parseFloat(parts[1]);
      const chordLabel = parts.slice(2).join(' ');

      if (!isNaN(startTime) && !isNaN(endTime)) {
        annotations.push({
          startTime,
          endTime,
          chordLabel: chordLabel.trim(),
        });
      }
    }
  }

  return annotations;
}

/**
 * Normalize chord label for comparison
 * Converts various formats to a standard form matching .lab format
 */
function normalizeChordLabel(chordLabel) {
  if (!chordLabel) return '';

  // Remove extra whitespace
  let normalized = chordLabel.trim().toUpperCase();

  // Handle slash chords - split and normalize separately
  const slashParts = normalized.split('/');
  const rootPart = slashParts[0];
  const bassPart = slashParts.length > 1 ? slashParts[1] : null;

  // Normalize root part
  let normalizedRoot = rootPart;

  // Standardize minor notation
  normalizedRoot = normalizedRoot.replace(/:MIN\b/g, ':MIN');
  normalizedRoot = normalizedRoot.replace(/:M\b/g, ':MIN');
  normalizedRoot = normalizedRoot.replace(/\bMIN\b/g, ':MIN');
  normalizedRoot = normalizedRoot.replace(/M\b/g, ':MIN'); // "Am" -> "A:MIN"

  // Remove explicit major notation
  normalizedRoot = normalizedRoot.replace(/:MAJ\b/g, '');
  normalizedRoot = normalizedRoot.replace(/:M\b/g, '');

  // Handle diminished/augmented
  normalizedRoot = normalizedRoot.replace(/:DIM\b/g, ':DIM');
  normalizedRoot = normalizedRoot.replace(/:AUG\b/g, ':AUG');

  // Handle 7th chords - keep as-is
  // The .lab format uses "E:min7" so we keep "7" suffix

  // Reassemble with slash bass if present
  if (bassPart) {
    normalized = normalizedRoot + '/' + bassPart;
  } else {
    normalized = normalizedRoot;
  }

  return normalized;
}

/**
 * Extract chord from analysis event
 */
function extractChordFromEvent(event) {
  if (!event || event.event_type !== 'chord_candidate') {
    return null;
  }

  const candidate = event.chord_candidate;
  if (!candidate) return null;

  // Handle different candidate structures
  let root = '';
  let quality = 'major';
  let slashBass = null;

  // Check if it's the new structure with root_candidates array
  if (candidate.root_candidates && candidate.root_candidates.length > 0) {
    root = candidate.root_candidates[0].root || '';
  } else if (candidate.root) {
    // Old structure
    root = candidate.root;
  } else {
    return null;
  }

  // Get quality
  if (candidate.quality_candidates && candidate.quality_candidates.length > 0) {
    quality = candidate.quality_candidates[0].quality || 'major';
  } else if (candidate.quality) {
    quality = candidate.quality;
  }

  // Get slash bass
  if (candidate.slash_bass) {
    slashBass = candidate.slash_bass;
  } else if (candidate.bass_note && candidate.bass_note !== root) {
    slashBass = candidate.bass_note;
  }

  // Build chord label
  let chordLabel = root;
  
  // Add quality
  if (quality === 'minor' || quality === 'min') {
    chordLabel += ':min';
  } else if (quality === 'diminished' || quality === 'dim') {
    chordLabel += ':dim';
  } else if (quality === 'augmented' || quality === 'aug') {
    chordLabel += ':aug';
  }
  // Major is implicit, no suffix

  // Add extensions (if present in candidate)
  if (candidate.extensions && candidate.extensions.length > 0) {
    const ext = candidate.extensions[0];
    if (ext === '7' || ext === 'dominant7') {
      chordLabel += '7';
    } else {
      chordLabel += ext;
    }
  }

  // Add slash bass
  if (slashBass) {
    chordLabel += '/' + slashBass;
  }

  return {
    timestamp: event.timestamp,
    chordLabel: normalizeChordLabel(chordLabel),
    confidence: event.confidence || 0,
  };
}

/**
 * Compare analysis results with ground truth
 */
function compareResults(groundTruth, analysisChords, toleranceSeconds = 0.5) {
  const matches = [];
  const misses = [];
  const falsePositives = [];

  // Create a map of ground truth chords by time
  const gtByTime = new Map();
  groundTruth.forEach((gt, idx) => {
    const midTime = (gt.startTime + gt.endTime) / 2;
    gtByTime.set(midTime, gt);
  });

  // Check each analysis chord against ground truth
  for (const analysisChord of analysisChords) {
    let matched = false;
    let bestMatch = null;
    let bestTimeDiff = Infinity;

    // Find closest ground truth chord in time
    for (const gt of groundTruth) {
      const timeDiff = Math.abs(analysisChord.timestamp - (gt.startTime + gt.endTime) / 2);
      
      if (timeDiff <= toleranceSeconds && timeDiff < bestTimeDiff) {
        bestTimeDiff = timeDiff;
        bestMatch = gt;
      }
    }

    if (bestMatch) {
      const normalizedGt = normalizeChordLabel(bestMatch.chordLabel);
      const normalizedAnalysis = normalizeChordLabel(analysisChord.chordLabel);

      if (normalizedGt === normalizedAnalysis) {
        matches.push({
          analysis: analysisChord,
          groundTruth: bestMatch,
          timeDiff: bestTimeDiff,
        });
        matched = true;
      } else {
        misses.push({
          analysis: analysisChord,
          groundTruth: bestMatch,
          timeDiff: bestTimeDiff,
          expected: normalizedGt,
          got: normalizedAnalysis,
        });
      }
    }

    if (!matched) {
      falsePositives.push(analysisChord);
    }
  }

  // Find ground truth chords that weren't detected
  const undetected = groundTruth.filter((gt) => {
    return !analysisChords.some((ac) => {
      const timeDiff = Math.abs(ac.timestamp - (gt.startTime + gt.endTime) / 2);
      return timeDiff <= toleranceSeconds;
    });
  });

  return {
    matches,
    misses,
    falsePositives,
    undetected,
    accuracy: groundTruth.length > 0 ? matches.length / groundTruth.length : 0,
    precision: analysisChords.length > 0 ? matches.length / analysisChords.length : 0,
  };
}

/**
 * Run analysis and compare with ground truth
 */
async function testAnalysisAccuracy(audioFile, labFile) {
  console.log(`\n=== Testing: ${path.basename(audioFile)} ===\n`);

  // Check files exist
  if (!fs.existsSync(audioFile)) {
    console.error(`✗ Audio file not found: ${audioFile}`);
    return null;
  }

  if (!fs.existsSync(labFile)) {
    console.error(`✗ Lab file not found: ${labFile}`);
    return null;
  }

  // Parse ground truth
  console.log('1. Parsing ground truth (.lab file)...');
  const groundTruth = parseLabFile(labFile);
  console.log(`   ✓ Found ${groundTruth.length} chord annotations`);
  console.log(`   Duration: ${groundTruth[groundTruth.length - 1]?.endTime || 0}s`);

  // Run analysis
  console.log('\n2. Running audio analysis...');
  const startTime = Date.now();
  let analysisResult;
  try {
    analysisResult = await analyzeAudio(audioFile, (progress) => {
      if (progress % 20 === 0) {
        process.stdout.write(`   Progress: ${progress}%...\r`);
      }
    });
  } catch (error) {
    console.error(`\n   ✗ Analysis failed: ${error.message}`);
    return null;
  }
  const analysisTime = Date.now() - startTime;
  console.log(`\n   ✓ Analysis complete in ${(analysisTime / 1000).toFixed(2)}s`);

  // Extract chord events
  console.log('\n3. Extracting chord events...');
  const chordEvents = (analysisResult.linear_analysis.events || [])
    .filter((e) => e.event_type === 'chord_candidate')
    .map(extractChordFromEvent)
    .filter((c) => c !== null);

  console.log(`   ✓ Found ${chordEvents.length} chord detections`);

  // Compare results
  console.log('\n4. Comparing with ground truth...');
  const comparison = compareResults(groundTruth, chordEvents, 0.5);

  // Print results
  console.log('\n=== Results ===\n');
  console.log(`Accuracy: ${(comparison.accuracy * 100).toFixed(1)}% (${comparison.matches.length}/${groundTruth.length} correct)`);
  console.log(`Precision: ${(comparison.precision * 100).toFixed(1)}% (${comparison.matches.length}/${chordEvents.length} correct)`);
  console.log(`\nMatches: ${comparison.matches.length}`);
  console.log(`Misses (wrong chord): ${comparison.misses.length}`);
  console.log(`False Positives: ${comparison.falsePositives.length}`);
  console.log(`Undetected: ${comparison.undetected.length}`);

  // Show some examples of misses
  if (comparison.misses.length > 0) {
    console.log('\n--- Sample Misses (first 5) ---');
    comparison.misses.slice(0, 5).forEach((miss, i) => {
      console.log(`  ${i + 1}. At ${miss.analysis.timestamp.toFixed(2)}s: Expected "${miss.expected}", got "${miss.got}"`);
    });
  }

  // Show some examples of undetected
  if (comparison.undetected.length > 0) {
    console.log('\n--- Sample Undetected Chords (first 5) ---');
    comparison.undetected.slice(0, 5).forEach((undetected, i) => {
      console.log(`  ${i + 1}. ${undetected.startTime.toFixed(2)}s-${undetected.endTime.toFixed(2)}s: "${undetected.chordLabel}"`);
    });
  }

  return comparison;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('=== Analysis Accuracy Test Suite ===\n');
  console.log('Comparing analysis results with .lab ground truth files\n');

  const testDir = path.join(__dirname, '..', 'electron', 'analysis', 'test');
  const testFiles = [
    {
      audio: path.join(testDir, '13 A Day In The Life.mp3'),
      lab: path.join(testDir, '13_-_A_Day_In_The_Life_chord.lab'),
    },
    {
      audio: path.join(testDir, '01 Come Together.mp3'),
      lab: path.join(testDir, '01_-_Come_Together_chord.lab'),
    },
  ];

  const results = [];

  for (const test of testFiles) {
    if (fs.existsSync(test.audio) && fs.existsSync(test.lab)) {
      const result = await testAnalysisAccuracy(test.audio, test.lab);
      if (result) {
        results.push({
          file: path.basename(test.audio),
          ...result,
        });
      }
    } else {
      console.log(`\n⚠ Skipping ${path.basename(test.audio)} (files not found)`);
    }
  }

  // Summary
  if (results.length > 0) {
    console.log('\n\n=== Summary ===\n');
    const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
    const avgPrecision = results.reduce((sum, r) => sum + r.precision, 0) / results.length;

    console.log(`Average Accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);
    console.log(`Average Precision: ${(avgPrecision * 100).toFixed(1)}%`);

    results.forEach((r) => {
      console.log(`\n${r.file}:`);
      console.log(`  Accuracy: ${(r.accuracy * 100).toFixed(1)}%`);
      console.log(`  Precision: ${(r.precision * 100).toFixed(1)}%`);
    });
  }

  console.log('\n✅ Test suite complete\n');
}

// Run tests
(async () => {
  try {
    await runTests();
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
})();

