#!/usr/bin/env node

/**
 * Test script for music data standardization
 */

const path = require('path');
const {
  convertLabKeyToUnified,
  convertLabChordToUnified,
} = require('../src/lib/unifiedAnnotationSchema');
const BIMMUDAProcessor = require('../electron/analysis/bimmudaProcessor');
const AITrainingDataManager = require('../electron/analysis/aiTrainingDataManager');

async function testStandardization() {
  const libraryPath = path.join(__dirname, '..', 'library');

  console.log('🧪 Testing Music Data Standardization\n');

  try {
    // Test 1: Convert a sample .lab file
    console.log('Test 1: Converting sample .lab files...');

    const fs = require('fs').promises;
    const sampleKeyLab = path.join(libraryPath, 'json', 'Beatleslabs', '01_-_Come_Together.lab');
    const sampleChordLab = path.join(
      libraryPath,
      'json',
      'Beatleslabs',
      '01_-_Come_Together_chord.lab',
    );

    // Test key annotation
    if (await fileExists(sampleKeyLab)) {
      const keyContent = await fs.readFile(sampleKeyLab, 'utf8');
      const keyData = convertLabKeyToUnified(keyContent, {
        title: 'Come Together',
        artist: 'The Beatles',
      });

      console.log('  ✓ Key annotation converted successfully');
      console.log(`    - ${keyData.sections.length} sections`);
      console.log(`    - Source: ${keyData.metadata.source}`);
    }

    // Test chord annotation
    if (await fileExists(sampleChordLab)) {
      const chordContent = await fs.readFile(sampleChordLab, 'utf8');
      const chordData = convertLabChordToUnified(chordContent, {
        title: 'Come Together',
        artist: 'The Beatles',
      });

      console.log('  ✓ Chord annotation converted successfully');
      console.log(`    - ${chordData.sections[0]?.chord_progression?.length || 0} chords`);
      console.log(`    - Source: ${chordData.metadata.source}`);
    }

    // Test 2: BIMMUDA processing (light test)
    console.log('\nTest 2: Testing BIMMUDA processor...');

    const processor = new BIMMUDAProcessor(libraryPath);
    const years = await processor.getYears();

    if (years.length > 0) {
      console.log(
        `  ✓ Found ${years.length} years in BIMMUDA dataset: ${years.slice(0, 5).join(', ')}${years.length > 5 ? '...' : ''}`,
      );

      // Test processing one song
      const testYear = years[0];
      const yearPath = path.join(libraryPath, 'midi', 'bimmuda_dataset', testYear);
      const entries = await fs.readdir(yearPath, { withFileTypes: true });
      const songDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

      if (songDirs.length > 0) {
        console.log(`  ✓ Found ${songDirs.length} songs in ${testYear}`);
        console.log('  ✓ BIMMUDA processor initialized successfully');
      }
    }

    // Test 3: AI Training Data Manager
    console.log('\nTest 3: Testing AI Training Data Manager...');

    const dataManager = new AITrainingDataManager(libraryPath);

    // Load BIMMUDA data
    await dataManager.loadBIMMUDAData();

    const stats = dataManager.getDataStatistics();

    console.log('  ✓ Data manager initialized');
    console.log(`    - Annotations: ${stats.annotations.total_files} files`);
    console.log(`    - BIMMUDA: ${stats.bimmuda.total_songs} songs`);

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

async function fileExists(filePath) {
  try {
    await require('fs').promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Run tests if called directly
if (require.main === module) {
  testStandardization();
}

module.exports = { testStandardization };
