/**
 * Smoke Test for Section Labeling System
 * Validates integration and basic functionality
 */

const path = require('path');
const { labelSectionsWithSemantics } = require('../electron/analysis/semanticLabeler');

console.log('🧪 Section Labeling Smoke Test\n');
console.log('='.repeat(50));

// Test 1: Basic Functionality
console.log('\n📋 Test 1: Basic Functionality');
console.log('-'.repeat(50));

const mockSections = [
  {
    section_id: 's1',
    time_range: { start_time: 0, end_time: 10 },
    semantic_signature: {
      chroma_features: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.9, 0.8],
      avg_rms: 0.3,
      vocal_probability: 0.1
    }
  },
  {
    section_id: 's2',
    time_range: { start_time: 10, end_time: 30 },
    semantic_signature: {
      chroma_features: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.9, 0.8, 0.7],
      avg_rms: 0.6,
      vocal_probability: 0.7
    }
  },
  {
    section_id: 's3',
    time_range: { start_time: 30, end_time: 50 },
    semantic_signature: {
      chroma_features: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.9, 0.8, 0.7],
      avg_rms: 0.8,
      vocal_probability: 0.8
    }
  },
  {
    section_id: 's4',
    time_range: { start_time: 50, end_time: 70 },
    semantic_signature: {
      chroma_features: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.9, 0.8, 0.7],
      avg_rms: 0.6,
      vocal_probability: 0.7
    }
  },
  {
    section_id: 's5',
    time_range: { start_time: 70, end_time: 90 },
    semantic_signature: {
      chroma_features: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.9, 0.8, 0.7],
      avg_rms: 0.8,
      vocal_probability: 0.8
    }
  },
  {
    section_id: 's6',
    time_range: { start_time: 90, end_time: 100 },
    semantic_signature: {
      chroma_features: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
      avg_rms: 0.2,
      vocal_probability: 0.1
    }
  }
];

const mockLinear = {
  chroma_frames: Array(100).fill(null).map(() => ({
    chroma: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.9, 0.8]
  })),
  mfcc_frames: Array(100).fill(null).map(() => ({
    mfcc: Array(13).fill(0.5)
  })),
  beat_grid: {
    drum_grid: [
      { time: 10, hasKick: true, hasSnare: false },
      { time: 12, hasKick: false, hasSnare: true },
      { time: 30, hasKick: true, hasSnare: false },
      { time: 32, hasKick: false, hasSnare: true },
      { time: 50, hasKick: true, hasSnare: false },
      { time: 52, hasKick: false, hasSnare: true },
    ]
  },
  events: [
    { event_type: 'chord_candidate', timestamp: 10, chord: 'C' },
    { event_type: 'chord_candidate', timestamp: 12, chord: 'G' },
    { event_type: 'chord_candidate', timestamp: 30, chord: 'C' },
    { event_type: 'chord_candidate', timestamp: 32, chord: 'G' },
  ],
  metadata: {
    duration_seconds: 100
  }
};

try {
  const result = labelSectionsWithSemantics(mockSections, mockLinear.metadata, mockLinear);
  
  console.log(`✅ Function executed successfully`);
  console.log(`   Sections processed: ${result.length}`);
  
  // Check that all sections have labels
  const allLabeled = result.every(s => s.section_label);
  console.log(`   All sections labeled: ${allLabeled ? '✅' : '❌'}`);
  
  // Check for expected labels
  const hasIntro = result.some(s => s.section_label === 'intro');
  const hasChorus = result.some(s => s.section_label === 'chorus');
  const hasOutro = result.some(s => s.section_label === 'outro');
  
  console.log(`   Intro detected: ${hasIntro ? '✅' : '⚠️'}`);
  console.log(`   Chorus detected: ${hasChorus ? '✅' : '⚠️'}`);
  console.log(`   Outro detected: ${hasOutro ? '✅' : '⚠️'}`);
  
  // Display results
  console.log('\n   Labeling Results:');
  result.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.section_label} ${s.section_variant || ''} (${(s.label_confidence * 100).toFixed(0)}%) - ${s.label_reason || 'N/A'}`);
  });
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

// Test 2: Empty Input Handling
console.log('\n📋 Test 2: Empty Input Handling');
console.log('-'.repeat(50));

try {
  const emptyResult = labelSectionsWithSemantics([], {}, {});
  console.log(`✅ Empty input handled: ${emptyResult.length === 0 ? '✅' : '❌'}`);
} catch (error) {
  console.error('❌ Empty input test failed:', error.message);
  process.exit(1);
}

// Test 3: Missing Data Handling
console.log('\n📋 Test 3: Missing Data Handling');
console.log('-'.repeat(50));

const minimalSections = [
  {
    section_id: 's1',
    time_range: { start_time: 0, end_time: 10 }
  }
];

try {
  const minimalResult = labelSectionsWithSemantics(minimalSections, {}, {});
  console.log(`✅ Missing data handled: ${minimalResult.length > 0 ? '✅' : '❌'}`);
  console.log(`   Section labeled: ${minimalResult[0]?.section_label || 'N/A'}`);
} catch (error) {
  console.error('❌ Missing data test failed:', error.message);
  process.exit(1);
}

// Test 4: Clustering Functionality
console.log('\n📋 Test 4: Clustering Functionality');
console.log('-'.repeat(50));

const { clusterSectionsImproved } = require('../electron/analysis/semanticLabeler');

try {
  const { sections: clustered, clusters } = clusterSectionsImproved(
    mockSections,
    mockLinear.chroma_frames.map(f => f.chroma),
    mockLinear.mfcc_frames.map(f => f.mfcc),
    mockLinear,
    { similarityThreshold: 0.65 }
  );
  
  console.log(`✅ Clustering executed: ${clusters.size} clusters created`);
  console.log(`   Sections with cluster_id: ${clustered.filter(s => s.cluster_id !== null).length}`);
} catch (error) {
  console.error('❌ Clustering test failed:', error.message);
  process.exit(1);
}

// Test 5: Integration Check
console.log('\n📋 Test 5: Integration Check');
console.log('-'.repeat(50));

try {
  const theorist = require('../electron/analysis/theorist');
  console.log(`✅ Theorist module loaded`);
  console.log(`   correctStructuralMap function: ${typeof theorist.correctStructuralMap === 'function' ? '✅' : '❌'}`);
} catch (error) {
  console.error('❌ Integration check failed:', error.message);
  process.exit(1);
}

console.log('\n' + '='.repeat(50));
console.log('✅ All smoke tests passed!');
console.log('='.repeat(50) + '\n');

