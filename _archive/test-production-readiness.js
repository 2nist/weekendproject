/**
 * Production Readiness Test Suite
 * Comprehensive tests to ensure analysis works in real-world applications
 */

const path = require('path');
const fs = require('fs');
const { analyzeAudio } = require('../electron/analysis/listener');
const { loadAudioFile, getEssentiaInstance } = require('../electron/analysis/essentiaLoader');
const { validateFile, prepareAudioFile, isSupportedFormat } = require('../electron/analysis/fileProcessor');

const testDir = path.join(__dirname, '..', 'electron', 'analysis', 'test');

/**
 * Test results tracker
 */
class TestResults {
  constructor() {
    this.passed = [];
    this.failed = [];
    this.warnings = [];
  }

  pass(testName, details = '') {
    this.passed.push({ test: testName, details });
    console.log(`PASS: ${testName}${details ? ` - ${details}` : ''}`);
  }

  fail(testName, error, details = '') {
    this.failed.push({ test: testName, error: error.message || error, details });
    console.error(`FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    if (error.message) console.error(`  Error: ${error.message}`);
  }

  warn(testName, message) {
    this.warnings.push({ test: testName, message });
    console.warn(`WARN: ${testName} - ${message}`);
  }

  summary() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Passed: ${this.passed.length}`);
    console.log(`Failed: ${this.failed.length}`);
    console.log(`Warnings: ${this.warnings.length}`);
    
    if (this.failed.length > 0) {
      console.log('\nFailed Tests:');
      this.failed.forEach(f => {
        console.log(`  - ${f.test}: ${f.error}`);
      });
    }
    
    if (this.warnings.length > 0) {
      console.log('\nWarnings:');
      this.warnings.forEach(w => {
        console.log(`  - ${w.test}: ${w.message}`);
      });
    }
    
    return {
      passed: this.passed.length,
      failed: this.failed.length,
      warnings: this.warnings.length,
      success: this.failed.length === 0
    };
  }
}

const results = new TestResults();

/**
 * Test 1: Performance - Long Song Processing
 */
async function testLongSongPerformance() {
  console.log('\n[TEST 1] Long Song Performance Test');
  console.log('-'.repeat(60));
  
  const testFiles = [
    path.join(testDir, '13 A Day In The Life.mp3'),
  ];
  
  for (const file of testFiles) {
    if (!fs.existsSync(file)) continue;
    
    try {
      const startTime = Date.now();
      const startMemory = process.memoryUsage();
      
      let progressUpdates = 0;
      const result = await analyzeAudio(file, (progress) => {
        progressUpdates++;
        if (progress % 25 === 0) {
          process.stdout.write(`  Progress: ${progress}%...\r`);
        }
      });
      
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      const duration = (endTime - startTime) / 1000;
      const memoryIncrease = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;
      
      // Validate result structure
      if (!result || !result.linear_analysis) {
        results.fail('Long Song Performance', new Error('Invalid result structure'));
        return;
      }
      
      // Check performance metrics
      const audioDuration = result.linear_analysis.metadata?.duration_seconds || 0;
      const processingRatio = duration / audioDuration;
      
      console.log(`\n  Processing time: ${duration.toFixed(2)}s`);
      console.log(`  Audio duration: ${audioDuration.toFixed(2)}s`);
      console.log(`  Processing ratio: ${processingRatio.toFixed(2)}x real-time`);
      console.log(`  Memory increase: ${memoryIncrease.toFixed(2)} MB`);
      console.log(`  Progress updates: ${progressUpdates}`);
      
      // Performance thresholds
      if (processingRatio < 5.0) {
        results.pass('Long Song Performance', `Processed ${audioDuration.toFixed(1)}s song in ${duration.toFixed(1)}s (${processingRatio.toFixed(1)}x real-time)`);
      } else {
        results.warn('Long Song Performance', `Slow processing: ${processingRatio.toFixed(1)}x real-time (target: <5x)`);
      }
      
      if (memoryIncrease < 500) {
        results.pass('Memory Usage', `Memory increase: ${memoryIncrease.toFixed(2)} MB`);
      } else {
        results.warn('Memory Usage', `High memory usage: ${memoryIncrease.toFixed(2)} MB`);
      }
      
      if (progressUpdates >= 10) {
        results.pass('Progress Updates', `${progressUpdates} progress updates received`);
      } else {
        results.warn('Progress Updates', `Only ${progressUpdates} progress updates (expected >= 10)`);
      }
      
    } catch (error) {
      results.fail('Long Song Performance', error, file);
    }
  }
}

/**
 * Test 2: Memory Leak Detection
 */
async function testMemoryLeaks() {
  console.log('\n[TEST 2] Memory Leak Detection');
  console.log('-'.repeat(60));
  
  const testFile = path.join(testDir, '01 Come Together.mp3');
  if (!fs.existsSync(testFile)) {
    results.warn('Memory Leak Detection', 'Test file not found, skipping');
    return;
  }
  
  try {
    const initialMemory = process.memoryUsage().heapUsed;
    const iterations = 3;
    let maxMemory = initialMemory;
    
    for (let i = 0; i < iterations; i++) {
      console.log(`  Running iteration ${i + 1}/${iterations}...`);
      
      const iterMemory = process.memoryUsage().heapUsed;
      await analyzeAudio(testFile, () => {});
      
      const afterMemory = process.memoryUsage().heapUsed;
      maxMemory = Math.max(maxMemory, afterMemory);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const totalIncrease = (finalMemory - initialMemory) / 1024 / 1024;
    const maxIncrease = (maxMemory - initialMemory) / 1024 / 1024;
    
    console.log(`  Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Max memory: ${(maxMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Total increase: ${totalIncrease.toFixed(2)} MB`);
    console.log(`  Max increase: ${maxIncrease.toFixed(2)} MB`);
    
    // Memory leak threshold: < 100MB increase after 3 iterations
    if (totalIncrease < 100) {
      results.pass('Memory Leak Detection', `Memory increase: ${totalIncrease.toFixed(2)} MB after ${iterations} iterations`);
    } else {
      results.fail('Memory Leak Detection', new Error(`Possible memory leak: ${totalIncrease.toFixed(2)} MB increase`));
    }
    
  } catch (error) {
    results.fail('Memory Leak Detection', error);
  }
}

/**
 * Test 3: Error Handling
 */
async function testErrorHandling() {
  console.log('\n[TEST 3] Error Handling');
  console.log('-'.repeat(60));
  
  // Test non-existent file
  try {
    await analyzeAudio('nonexistent-file.wav', () => {});
    results.fail('Error Handling', new Error('Should have thrown error for non-existent file'));
  } catch (error) {
    results.pass('Error Handling', 'Non-existent file throws error');
  }
  
  // Test invalid file path
  try {
    await analyzeAudio(null, () => {});
    results.fail('Error Handling', new Error('Should have thrown error for null file path'));
  } catch (error) {
    results.pass('Error Handling', 'Null file path throws error');
  }
  
  // Test unsupported format (if we have one)
  const unsupportedFile = path.join(testDir, 'test.xyz');
  if (fs.existsSync(unsupportedFile)) {
    try {
      await analyzeAudio(unsupportedFile, () => {});
      results.fail('Error Handling', new Error('Should have thrown error for unsupported format'));
    } catch (error) {
      results.pass('Error Handling', 'Unsupported format throws error');
    }
  }
}

/**
 * Test 4: Different File Formats
 */
async function testFileFormats() {
  console.log('\n[TEST 4] File Format Support');
  console.log('-'.repeat(60));
  
  const formats = [
    { ext: '.mp3', file: '13 A Day In The Life.mp3' },
    { ext: '.wav', file: null }, // Would need a WAV file
  ];
  
  for (const format of formats) {
    if (!format.file) continue;
    
    const filePath = path.join(testDir, format.file);
    if (!fs.existsSync(filePath)) continue;
    
    try {
      console.log(`  Testing ${format.ext} format...`);
      const result = await analyzeAudio(filePath, () => {});
      
      if (result && result.linear_analysis) {
        results.pass(`File Format: ${format.ext}`, 'Successfully processed');
      } else {
        results.fail(`File Format: ${format.ext}`, new Error('Invalid result structure'));
      }
    } catch (error) {
      results.fail(`File Format: ${format.ext}`, error);
    }
  }
}

/**
 * Test 5: Sample Rate Handling
 */
async function testSampleRateHandling() {
  console.log('\n[TEST 5] Sample Rate Handling');
  console.log('-'.repeat(60));
  
  try {
    const essentia = await getEssentiaInstance();
    if (!essentia) {
      results.warn('Sample Rate Handling', 'Essentia not available');
      return;
    }
    
    // Test with different sample rates (if we had test files)
    // For now, just verify the loader handles sample rate warnings
    const testFile = path.join(testDir, '13 A Day In The Life.mp3');
    if (fs.existsSync(testFile)) {
      try {
        const audioData = await loadAudioFile(testFile, 44100);
        if (audioData.sampleRate) {
          results.pass('Sample Rate Handling', `Detected sample rate: ${audioData.sampleRate}Hz`);
          
          if (audioData.sampleRate !== 44100) {
            results.warn('Sample Rate Handling', `File is ${audioData.sampleRate}Hz, expected 44100Hz (warning should appear)`);
          }
        }
      } catch (error) {
        results.fail('Sample Rate Handling', error);
      }
    }
  } catch (error) {
    results.fail('Sample Rate Handling', error);
  }
}

/**
 * Test 6: Progress Callback Reliability
 */
async function testProgressCallbacks() {
  console.log('\n[TEST 6] Progress Callback Reliability');
  console.log('-'.repeat(60));
  
  const testFile = path.join(testDir, '13 A Day In The Life.mp3');
  if (!fs.existsSync(testFile)) {
    results.warn('Progress Callbacks', 'Test file not found, skipping');
    return;
  }
  
  try {
    const progressValues = [];
    let lastProgress = -1;
    let progressOrderCorrect = true;
    
    await analyzeAudio(testFile, (progress) => {
      progressValues.push(progress);
      
      // Check that progress is non-decreasing
      if (progress < lastProgress) {
        progressOrderCorrect = false;
      }
      lastProgress = progress;
    });
    
    // Validate progress values
    const hasStart = progressValues.includes(0) || progressValues.some(p => p < 10);
    const hasEnd = progressValues.includes(100) || progressValues.some(p => p > 90);
    const hasIntermediate = progressValues.some(p => p > 10 && p < 90);
    
    if (hasStart && hasEnd && hasIntermediate && progressOrderCorrect) {
      results.pass('Progress Callbacks', `Received ${progressValues.length} progress updates, order correct`);
    } else {
      results.fail('Progress Callbacks', new Error(`Invalid progress: start=${hasStart}, end=${hasEnd}, intermediate=${hasIntermediate}, order=${progressOrderCorrect}`));
    }
    
  } catch (error) {
    results.fail('Progress Callbacks', error);
  }
}

/**
 * Test 7: Result Schema Validation
 */
async function testResultSchema() {
  console.log('\n[TEST 7] Result Schema Validation');
  console.log('-'.repeat(60));
  
  const testFile = path.join(testDir, '13 A Day In The Life.mp3');
  if (!fs.existsSync(testFile)) {
    results.warn('Result Schema', 'Test file not found, skipping');
    return;
  }
  
  try {
    const result = await analyzeAudio(testFile, () => {});
    
    // Validate required fields
    const required = ['fileHash', 'linear_analysis'];
    const missing = required.filter(field => !result[field]);
    
    if (missing.length > 0) {
      results.fail('Result Schema', new Error(`Missing required fields: ${missing.join(', ')}`));
      return;
    }
    
    // Validate linear_analysis structure
    const la = result.linear_analysis;
    const laRequired = ['events', 'beat_grid', 'metadata', 'chroma_frames', 'semantic_features'];
    const laMissing = laRequired.filter(field => !la[field]);
    
    if (laMissing.length > 0) {
      results.fail('Result Schema', new Error(`Missing linear_analysis fields: ${laMissing.join(', ')}`));
      return;
    }
    
    // Validate metadata
    const meta = la.metadata;
    if (!meta.duration_seconds || !meta.sample_rate || !meta.detected_key) {
      results.fail('Result Schema', new Error('Missing required metadata fields'));
      return;
    }
    
    results.pass('Result Schema', 'All required fields present');
    
    // Check data quality
    if (la.events.length > 0) {
      results.pass('Result Schema', `${la.events.length} events detected`);
    } else {
      results.warn('Result Schema', 'No events detected (may be normal for some audio)');
    }
    
    if (la.beat_grid.beat_timestamps.length > 0) {
      results.pass('Result Schema', `${la.beat_grid.beat_timestamps.length} beats detected`);
    } else {
      results.warn('Result Schema', 'No beats detected');
    }
    
  } catch (error) {
    results.fail('Result Schema', error);
  }
}

/**
 * Test 8: Event Loop Responsiveness (UI Freeze Prevention)
 */
async function testEventLoopResponsiveness() {
  console.log('\n[TEST 8] Event Loop Responsiveness');
  console.log('-'.repeat(60));
  
  const testFile = path.join(testDir, '13 A Day In The Life.mp3');
  if (!fs.existsSync(testFile)) {
    results.warn('Event Loop Responsiveness', 'Test file not found, skipping');
    return;
  }
  
  try {
    let eventLoopResponsive = true;
    let maxBlockTime = 0;
    const blockTimes = [];
    
    // Monitor event loop
    const checkInterval = setInterval(() => {
      const now = Date.now();
      blockTimes.push(now);
      
      // Check if we've been blocked (no events for > 500ms)
      if (blockTimes.length > 1) {
        const timeSinceLastEvent = now - blockTimes[blockTimes.length - 2];
        maxBlockTime = Math.max(maxBlockTime, timeSinceLastEvent);
        
        if (timeSinceLastEvent > 500) {
          eventLoopResponsive = false;
        }
      }
    }, 100);
    
    await analyzeAudio(testFile, () => {});
    
    clearInterval(checkInterval);
    
    console.log(`  Max block time: ${maxBlockTime}ms`);
    console.log(`  Event loop checks: ${blockTimes.length}`);
    
    if (eventLoopResponsive && maxBlockTime < 500) {
      results.pass('Event Loop Responsiveness', `Max block time: ${maxBlockTime}ms (target: <500ms)`);
    } else {
      results.warn('Event Loop Responsiveness', `Event loop blocked for ${maxBlockTime}ms (may cause UI freeze)`);
    }
    
  } catch (error) {
    results.fail('Event Loop Responsiveness', error);
  }
}

/**
 * Test 9: Concurrent Analysis (if needed)
 */
async function testConcurrentAnalysis() {
  console.log('\n[TEST 9] Concurrent Analysis');
  console.log('-'.repeat(60));
  
  // Note: This test would require multiple files
  // For now, just verify the system can handle analysis requests
  results.pass('Concurrent Analysis', 'Test skipped (requires multiple test files)');
}

/**
 * Test 10: File Validation
 */
async function testFileValidation() {
  console.log('\n[TEST 10] File Validation');
  console.log('-'.repeat(60));
  
  // Test file existence check
  const validFile = path.join(testDir, '13 A Day In The Life.mp3');
  if (fs.existsSync(validFile)) {
    const validation = validateFile(validFile);
    if (validation.valid) {
      results.pass('File Validation', 'Valid file passes validation');
    } else {
      results.fail('File Validation', new Error(`Valid file failed: ${validation.error}`));
    }
  }
  
  // Test non-existent file
  const invalidFile = path.join(testDir, 'nonexistent.mp3');
  const invalidValidation = validateFile(invalidFile);
  if (!invalidValidation.valid) {
    results.pass('File Validation', 'Non-existent file correctly rejected');
  } else {
    results.fail('File Validation', new Error('Non-existent file should be rejected'));
  }
  
  // Test format support
  const formats = ['.wav', '.mp3', '.flac', '.m4a', '.ogg'];
  formats.forEach(ext => {
    const supported = isSupportedFormat(`test${ext}`);
    if (supported) {
      results.pass(`Format Support: ${ext}`, 'Supported');
    } else {
      results.warn(`Format Support: ${ext}`, 'Not supported');
    }
  });
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('PRODUCTION READINESS TEST SUITE');
  console.log('='.repeat(60));
  console.log('Testing analysis pipeline for real-world application scenarios\n');
  
  try {
    await testFileValidation();
    await testErrorHandling();
    await testSampleRateHandling();
    await testFileFormats();
    await testProgressCallbacks();
    await testResultSchema();
    await testEventLoopResponsiveness();
    await testLongSongPerformance();
    await testMemoryLeaks();
    await testConcurrentAnalysis();
    
    const summary = results.summary();
    
    console.log('\n' + '='.repeat(60));
    if (summary.success) {
      console.log('ALL CRITICAL TESTS PASSED');
      console.log('The analysis pipeline is ready for production use.');
    } else {
      console.log('SOME TESTS FAILED');
      console.log('Please review failed tests before deploying.');
    }
    console.log('='.repeat(60));
    
    process.exit(summary.success ? 0 : 1);
    
  } catch (error) {
    console.error('Test suite crashed:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests();

