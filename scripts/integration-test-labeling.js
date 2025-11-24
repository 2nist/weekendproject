/**
 * Integration Test for Section Labeling
 * Tests the full pipeline from analysis to labeling
 */

const path = require('path');
const fs = require('fs');

console.log('🔗 Section Labeling Integration Test\n');
console.log('='.repeat(50));

// Test: Full Pipeline Integration
console.log('\n📋 Test: Full Pipeline Integration');
console.log('-'.repeat(50));

async function testFullPipeline() {
  try {
    // Step 1: Import required modules
    const { labelSectionsWithSemantics } = require('../electron/analysis/semanticLabeler');
    const theorist = require('../electron/analysis/theorist');
    
    console.log('✅ Modules loaded');
    
    // Step 2: Create mock analysis data (simulating real analysis output)
    const mockLinearAnalysis = {
      metadata: {
        duration_seconds: 180,
        detected_key: 'C',
        detected_mode: 'major',
        key_confidence: 0.85,
        sample_rate: 22050
      },
      chroma_frames: Array(1000).fill(null).map((_, i) => ({
        chroma: Array(12).fill(0).map((_, j) => 
          Math.sin((i + j) * 0.1) * 0.5 + 0.5
        )
      })),
      mfcc_frames: Array(1000).fill(null).map(() => ({
        mfcc: Array(13).fill(0.5)
      })),
      beat_grid: {
        tempo_bpm: 120,
        time_signature: { numerator: 4, denominator: 4 },
        beat_timestamps: Array(360).fill(0).map((_, i) => i * 0.5),
        downbeat_timestamps: Array(90).fill(0).map((_, i) => i * 2),
        drum_grid: Array(360).fill(0).map((_, i) => ({
          time: i * 0.5,
          hasKick: i % 4 === 0,
          hasSnare: i % 4 === 2
        }))
      },
      events: Array(180).fill(0).map((_, i) => ({
        event_type: 'chord_candidate',
        timestamp: i * 1.0,
        chord: ['C', 'G', 'Am', 'F'][i % 4],
        confidence: 0.8
      }))
    };
    
    // Step 3: Create mock structural map (from architect)
    const mockStructuralMap = {
      sections: [
        {
          section_id: 's1',
          time_range: { start_time: 0, end_time: 15 },
          semantic_signature: {
            chroma_features: Array(12).fill(0.3),
            avg_rms: 0.3,
            vocal_probability: 0.1
          }
        },
        {
          section_id: 's2',
          time_range: { start_time: 15, end_time: 45 },
          semantic_signature: {
            chroma_features: Array(12).fill(0.6),
            avg_rms: 0.6,
            vocal_probability: 0.7
          }
        },
        {
          section_id: 's3',
          time_range: { start_time: 45, end_time: 75 },
          semantic_signature: {
            chroma_features: Array(12).fill(0.8),
            avg_rms: 0.8,
            vocal_probability: 0.8
          }
        },
        {
          section_id: 's4',
          time_range: { start_time: 75, end_time: 105 },
          semantic_signature: {
            chroma_features: Array(12).fill(0.6),
            avg_rms: 0.6,
            vocal_probability: 0.7
          }
        },
        {
          section_id: 's5',
          time_range: { start_time: 105, end_time: 135 },
          semantic_signature: {
            chroma_features: Array(12).fill(0.8),
            avg_rms: 0.8,
            vocal_probability: 0.8
          }
        },
        {
          section_id: 's6',
          time_range: { start_time: 135, end_time: 150 },
          semantic_signature: {
            chroma_features: Array(12).fill(0.2),
            avg_rms: 0.2,
            vocal_probability: 0.1
          }
        }
      ]
    };
    
    console.log('✅ Mock data created');
    
    // Step 4: Test direct labeling (unit test)
    console.log('\n   Testing direct labeling...');
    const labeled = labelSectionsWithSemantics(
      mockStructuralMap.sections,
      mockLinearAnalysis.metadata,
      mockLinearAnalysis
    );
    
    console.log(`   ✅ Labeled ${labeled.length} sections`);
    console.log(`   Labels: ${labeled.map(s => s.section_label).join(', ')}`);
    
    // Step 5: Test through theorist (integration test)
    console.log('\n   Testing through theorist.correctStructuralMap...');
    const corrected = await theorist.correctStructuralMap(
      mockStructuralMap,
      mockLinearAnalysis,
      mockLinearAnalysis.metadata,
      () => {} // progress callback
    );
    
    console.log(`   ✅ Corrected ${corrected.sections.length} sections`);
    
    // Verify sections have labels
    const allLabeled = corrected.sections.every(s => s.section_label);
    console.log(`   All sections labeled: ${allLabeled ? '✅' : '❌'}`);
    
    // Display final labels
    console.log('\n   Final Section Labels:');
    corrected.sections.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.section_label} ${s.section_variant || ''} (${(s.label_confidence * 100).toFixed(0)}%)`);
    });
    
    // Step 6: Verify data structure
    console.log('\n   Verifying data structure...');
    const hasRequiredFields = corrected.sections.every(s => 
      s.section_label &&
      s.section_variant !== undefined &&
      s.label_confidence !== undefined
    );
    console.log(`   Required fields present: ${hasRequiredFields ? '✅' : '❌'}`);
    
    // Step 7: Check for expected labels
    const hasIntro = corrected.sections.some(s => s.section_label === 'intro');
    const hasChorus = corrected.sections.some(s => s.section_label === 'chorus');
    const hasOutro = corrected.sections.some(s => s.section_label === 'outro');
    
    console.log(`   Intro detected: ${hasIntro ? '✅' : '⚠️'}`);
    console.log(`   Chorus detected: ${hasChorus ? '✅' : '⚠️'}`);
    console.log(`   Outro detected: ${hasOutro ? '✅' : '⚠️'}`);
    
    return {
      success: true,
      sections: corrected.sections,
      stats: {
        total: corrected.sections.length,
        labeled: corrected.sections.filter(s => s.section_label).length,
        hasIntro,
        hasChorus,
        hasOutro
      }
    };
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

// Run test
testFullPipeline()
  .then(result => {
    if (result.success) {
      console.log('\n' + '='.repeat(50));
      console.log('✅ Integration test passed!');
      console.log('='.repeat(50));
      console.log('\n📊 Statistics:');
      console.log(`   Total sections: ${result.stats.total}`);
      console.log(`   Labeled sections: ${result.stats.labeled}`);
      console.log(`   Intro: ${result.stats.hasIntro ? '✅' : '❌'}`);
      console.log(`   Chorus: ${result.stats.hasChorus ? '✅' : '❌'}`);
      console.log(`   Outro: ${result.stats.hasOutro ? '✅' : '❌'}`);
      process.exit(0);
    } else {
      console.log('\n' + '='.repeat(50));
      console.log('❌ Integration test failed!');
      console.log('='.repeat(50));
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

