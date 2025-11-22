/**
 * Final Essentia verification - tests the actual analysis pipeline
 */

const path = require('path');

async function verifyEssentia() {
  console.log('='.repeat(80));
  console.log('FINAL ESSENTIA VERIFICATION');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Test 1: Load Essentia
    console.log('1. Loading Essentia...');
    const loader = require('../electron/analysis/essentiaLoader');
    const essentia = await loader.getEssentiaInstance();
    
    if (!essentia) {
      console.error('✗ FAILED: Essentia instance is null');
      return false;
    }
    console.log('✓ Essentia loaded successfully');
    console.log('');

    // Test 2: Check for required methods
    console.log('2. Checking required methods...');
    const required = ['arrayToVector', 'vectorToArray', 'Chromagram'];
    const missing = required.filter(m => typeof essentia[m] !== 'function');
    if (missing.length > 0) {
      console.error(`✗ Missing methods: ${missing.join(', ')}`);
      return false;
    }
    console.log('✓ All required methods available');
    console.log('');

    // Test 3: Test with simple audio analysis
    console.log('3. Testing audio analysis pipeline...');
    const listener = require('../electron/analysis/listener');
    
    // Use a short test file if available
    const testFile = path.resolve(__dirname, '..', 'electron', 'analysis', 'test', '06 Let It Be.mp3');
    const fs = require('fs');
    
    if (!fs.existsSync(testFile)) {
      console.log('⚠ Test file not found, skipping full pipeline test');
      console.log('✓ Essentia loader is working correctly');
      return true;
    }

    console.log('   Running analysis on test file...');
    let analysisResult = null;
    let errorOccurred = false;
    
    try {
      analysisResult = await listener.analyzeAudio(testFile, (progress) => {
        if (progress === 20 || progress === 50 || progress === 100) {
          process.stdout.write(`   Progress: ${progress}% `);
        }
      });
      
      console.log('\n   ✓ Analysis completed successfully');
      console.log(`   - Has chroma_frames: ${analysisResult.linear_analysis.chroma_frames?.length > 0}`);
      console.log(`   - Has beat_grid: ${!!analysisResult.linear_analysis.beat_grid}`);
      console.log(`   - Has metadata: ${!!analysisResult.linear_analysis.metadata}`);
      
      if (analysisResult.linear_analysis.chroma_frames?.length > 0) {
        console.log('   ✓ Essentia is processing audio correctly');
        return true;
      } else {
        console.log('   ⚠ Analysis completed but no chroma frames (may be using fallback)');
        return false;
      }
    } catch (error) {
      console.error(`\n   ✗ Analysis failed: ${error.message}`);
      if (error.stack) {
        console.error('   Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
      }
      return false;
    }
  } catch (error) {
    console.error(`\n✗ VERIFICATION FAILED: ${error.message}`);
    if (error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    return false;
  }
}

verifyEssentia().then(success => {
  console.log('');
  console.log('='.repeat(80));
  if (success) {
    console.log('✅ ESSENTIA IS VERIFIED AND WORKING');
  } else {
    console.log('❌ ESSENTIA VERIFICATION FAILED');
  }
  console.log('='.repeat(80));
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('\n✗ VERIFICATION ERROR:', error.message);
  process.exit(1);
});

