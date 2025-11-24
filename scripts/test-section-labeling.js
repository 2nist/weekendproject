/**
 * Test Script for Section Labeling
 * Validates labeling accuracy against ground truth
 */

const { labelSectionsWithSemantics } = require('../electron/analysis/semanticLabeler');
const fs = require('fs');
const path = require('path');

// Ground truth for "Come Together" (example)
const groundTruth = [
  { start: 1.0, end: 35.861, label: 'intro' },
  { start: 35.861, end: 70.617, label: 'verse' },
  { start: 70.617, end: 76.487, label: 'chorus' }, // "refrain"
  { start: 76.487, end: 111.236, label: 'verse' },
  { start: 111.236, end: 116.995, label: 'chorus' },
  { start: 116.995, end: 145.717, label: 'instrumental' },
  { start: 145.717, end: 174.955, label: 'verse' },
  { start: 174.955, end: 180.829, label: 'chorus' },
  { start: 180.829, end: 254.248, label: 'outro' }
];

function normalizeLabel(label) {
  const map = {
    'refrain': 'chorus',
    'intro/verse': 'verse',
    'intro/outro': 'outro',
    '1/2_intro/verse_(instrumental)': 'instrumental',
    '1/2_intro/verse': 'verse'
  };

  return map[label?.toLowerCase()] || label?.toLowerCase() || 'unknown';
}

function testSectionLabeling(linearAnalysis, structuralMap) {
  const sections = structuralMap.sections;

  console.log('\n========== SECTION LABELING TEST ==========\n');
  console.log(`Total sections: ${sections.length}`);
  console.log(`Ground truth sections: ${groundTruth.length}`);

  // Run labeling
  const labeledSections = labelSectionsWithSemantics(
    sections,
    linearAnalysis?.metadata || {},
    linearAnalysis
  );

  let correct = 0;
  let total = 0;
  const results = [];

  for (const gtSection of groundTruth) {
    // Find matching detected section
    const detected = labeledSections.find(s => {
      const start = s.time_range?.start_time || 0;
      const end = s.time_range?.end_time || start + 10;
      const overlap = Math.min(end, gtSection.end) - Math.max(start, gtSection.start);
      const gtDuration = gtSection.end - gtSection.start;
      return overlap / gtDuration > 0.5; // 50% overlap
    });

    total++;

    if (detected) {
      const detectedLabel = normalizeLabel(detected.section_label);
      const expectedLabel = normalizeLabel(gtSection.label);
      const match = detectedLabel === expectedLabel;

      if (match) {
        correct++;
        results.push({
          time: gtSection.start.toFixed(1),
          expected: gtSection.label,
          detected: detected.section_label,
          confidence: (detected.label_confidence * 100).toFixed(0),
          status: '✓'
        });
        console.log(`✓ ${gtSection.start.toFixed(1)}s: ${gtSection.label} (confidence: ${(detected.label_confidence * 100).toFixed(0)}%)`);
      } else {
        results.push({
          time: gtSection.start.toFixed(1),
          expected: gtSection.label,
          detected: detected.section_label,
          confidence: (detected.label_confidence * 100).toFixed(0),
          reason: detected.label_reason,
          status: '✗'
        });
        console.log(`✗ ${gtSection.start.toFixed(1)}s: Expected "${gtSection.label}", got "${detected.section_label}" (${detected.label_reason})`);
      }
    } else {
      results.push({
        time: gtSection.start.toFixed(1),
        expected: gtSection.label,
        detected: 'MISSED',
        status: '✗'
      });
      console.log(`✗ ${gtSection.start.toFixed(1)}s: Expected "${gtSection.label}", got NOTHING (missed section)`);
    }
  }

  const accuracy = (correct / total) * 100;
  console.log(`\n========================================`);
  console.log(`Accuracy: ${accuracy.toFixed(1)}% (${correct}/${total})`);
  console.log(`========================================\n`);

  // Summary by label type
  const labelStats = {};
  results.forEach(r => {
    if (r.status === '✓') {
      labelStats[r.expected] = (labelStats[r.expected] || 0) + 1;
    }
  });

  console.log('Correct by label type:');
  Object.entries(labelStats).forEach(([label, count]) => {
    const totalForLabel = groundTruth.filter(gt => normalizeLabel(gt.label) === normalizeLabel(label)).length;
    console.log(`  ${label}: ${count}/${totalForLabel} (${((count / totalForLabel) * 100).toFixed(0)}%)`);
  });

  return {
    accuracy,
    correct,
    total,
    results,
    labeledSections
  };
}

// Example usage
async function runTest(analysisFilePath) {
  try {
    const data = JSON.parse(fs.readFileSync(analysisFilePath, 'utf8'));
    const linearAnalysis = data.linear_analysis || data;
    const structuralMap = data.structural_map || { sections: [] };

    if (!structuralMap.sections || structuralMap.sections.length === 0) {
      console.error('No sections found in analysis data');
      return;
    }

    const result = testSectionLabeling(linearAnalysis, structuralMap);

    // Save results
    const outputPath = path.join(path.dirname(analysisFilePath), 'labeling-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);

    return result;
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

module.exports = { testSectionLabeling, runTest };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node test-section-labeling.js <analysis-file.json>');
    process.exit(1);
  }

  runTest(args[0])
    .then(() => {
      console.log('\n✅ Test complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Test failed:', err);
      process.exit(1);
    });
}

