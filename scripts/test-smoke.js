/**
 * Quick Smoke Test
 * Fast validation that critical functionality works
 * Run this before deployment or after major changes
 */

const path = require('path');
const { getEssentiaInstance, loadAudioFile } = require('../electron/analysis/essentiaLoader');
const { analyzeAudio } = require('../electron/analysis/listener');

async function smokeTest() {
  console.log('Running smoke tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Essentia loads
  try {
    const essentia = await getEssentiaInstance();
    if (essentia) {
      console.log('✓ Essentia loads');
      passed++;
    } else {
      console.error('✗ Essentia failed to load');
      failed++;
    }
  } catch (error) {
    console.error('✗ Essentia load error:', error.message);
    failed++;
  }
  
  // Test 2: Audio file loads
  const testDir = path.join(__dirname, '..', 'electron', 'analysis', 'test');
  const testFile = path.join(testDir, '13 A Day In The Life.mp3');
  
  if (require('fs').existsSync(testFile)) {
    try {
      const audioData = await loadAudioFile(testFile);
      if (audioData && audioData.samples && audioData.samples.length > 0) {
        console.log('✓ Audio file loads');
        passed++;
      } else {
        console.error('✗ Audio file load returned invalid data');
        failed++;
      }
    } catch (error) {
      console.error('✗ Audio file load error:', error.message);
      failed++;
    }
  } else {
    console.warn('⚠ Test file not found, skipping audio load test');
  }
  
  // Test 3: Quick analysis (first 10 seconds)
  if (require('fs').existsSync(testFile)) {
    try {
      let analysisStarted = false;
      const timeout = setTimeout(() => {
        if (!analysisStarted) {
          console.error('✗ Analysis timeout (30s)');
          failed++;
          process.exit(1);
        }
      }, 30000);
      
      analysisStarted = true;
      const result = await analyzeAudio(testFile, () => {});
      clearTimeout(timeout);
      
      if (result && result.linear_analysis) {
        console.log('✓ Analysis completes');
        passed++;
      } else {
        console.error('✗ Analysis returned invalid result');
        failed++;
      }
    } catch (error) {
      console.error('✗ Analysis error:', error.message);
      failed++;
    }
  }
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✅ All smoke tests passed');
    process.exit(0);
  } else {
    console.error('❌ Some smoke tests failed');
    process.exit(1);
  }
}

smokeTest();

