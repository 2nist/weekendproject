#!/usr/bin/env node

/**
 * Music Data Standardization and BIMMUDA Processing Script
 * Standardizes .lab and JSON formats and processes BIMMUDA for AI training
 */

const fs = require('fs').promises;
const path = require('path');
const {
  convertLabKeyToUnified,
  convertLabChordToUnified,
  convertMcGillToUnified,
} = require('../src/lib/unifiedAnnotationSchema');
const BIMMUDAProcessor = require('../electron/analysis/bimmudaProcessor');

async function main() {
  const libraryPath = path.join(__dirname, '..', 'library');

  console.log('🎵 Starting Music Data Standardization and BIMMUDA Processing\n');

  try {
    // 1. Standardize .lab files
    console.log('📝 Standardizing .lab annotation files...');
    await standardizeLabFiles(libraryPath);

    // 2. Standardize JSON files
    console.log('📄 Standardizing JSON annotation files...');
    await standardizeJsonFiles(libraryPath);

    // 3. Process BIMMUDA dataset
    console.log('🎼 Processing BIMMUDA dataset for AI training...');
    await processBIMMUDA(libraryPath);

    console.log('\n✅ All processing complete!');
  } catch (error) {
    console.error('❌ Processing failed:', error);
    process.exit(1);
  }
}

/**
 * Standardize .lab files to unified JSON format
 */
async function standardizeLabFiles(libraryPath) {
  const jsonPath = path.join(libraryPath, 'json');
  const beatlesPath = path.join(jsonPath, 'Beatleslabs');

  // Get all .lab files
  const labFiles = await findFiles(beatlesPath, '.lab');

  console.log(`Found ${labFiles.length} .lab files to process`);

  for (const labFile of labFiles) {
    try {
      const content = await fs.readFile(labFile, 'utf8');
      const fileName = path.basename(labFile, '.lab');

      // Extract metadata from filename
      const metadata = extractMetadataFromFilename(fileName);

      let unifiedData;
      if (fileName.includes('_chord')) {
        unifiedData = convertLabChordToUnified(content, metadata);
      } else {
        unifiedData = convertLabKeyToUnified(content, metadata);
      }

      // Save as unified JSON
      const outputFile = labFile.replace('.lab', '_unified.json');
      await fs.writeFile(outputFile, JSON.stringify(unifiedData, null, 2));

      console.log(`  ✓ Processed ${fileName}`);
    } catch (error) {
      console.warn(`  ⚠️ Failed to process ${labFile}:`, error.message);
    }
  }
}

/**
 * Standardize existing JSON files to unified format
 */
async function standardizeJsonFiles(libraryPath) {
  const jsonPath = path.join(libraryPath, 'json');

  // Process McGill Billboard dataset
  const mcgillPath = path.join(jsonPath, 'mcgill_jcrd_salami_Billboard');
  const mcgillFiles = await findFiles(mcgillPath, '.json');

  console.log(`Found ${mcgillFiles.length} McGill JSON files to process`);

  for (const jsonFile of mcgillFiles) {
    try {
      const content = await fs.readFile(jsonFile, 'utf8');
      const mcgillData = JSON.parse(content);

      const unifiedData = convertMcGillToUnified(mcgillData);

      // Save as unified JSON
      const outputFile = jsonFile.replace('.json', '_unified.json');
      await fs.writeFile(outputFile, JSON.stringify(unifiedData, null, 2));

      console.log(`  ✓ Processed McGill: ${mcgillData.title}`);
    } catch (error) {
      console.warn(`  ⚠️ Failed to process ${jsonFile}:`, error.message);
    }
  }

  // Process other JSON datasets as needed
  // Add more dataset processors here
}

/**
 * Process BIMMUDA dataset for AI training
 */
async function processBIMMUDA(libraryPath) {
  const processor = new BIMMUDAProcessor(libraryPath);

  // Process the dataset
  const trainingData = await processor.processDataset();

  // Save processed data
  const outputPath = path.join(libraryPath, 'processed_bimmuda_training_data.json');
  await processor.saveProcessedData(outputPath);

  // Generate specific training datasets
  const datasets = processor.generateTrainingDatasets();

  // Save individual training datasets
  for (const [datasetName, data] of Object.entries(datasets)) {
    const datasetPath = path.join(libraryPath, `${datasetName}_dataset.json`);
    await fs.writeFile(
      datasetPath,
      JSON.stringify(
        {
          dataset_name: datasetName,
          created_date: new Date().toISOString(),
          total_samples: data.length,
          data: data,
        },
        null,
        2,
      ),
    );

    console.log(`  ✓ Generated ${datasetName} dataset with ${data.length} samples`);
  }

  console.log(`  ✓ Processed ${trainingData.length} BIMMUDA songs`);
}

/**
 * Extract metadata from Beatles filename
 */
function extractMetadataFromFilename(filename) {
  // Example: "01_-_Come_Together" -> title: "Come Together", track: 1
  const match = filename.match(/^(\d+)_-_(.+)$/);
  if (!match) return {};

  const trackNumber = parseInt(match[1]);
  const title = match[2].replace(/_/g, ' ');

  return {
    title: title,
    artist: 'The Beatles',
    track_number: trackNumber,
  };
}

/**
 * Recursively find files with specific extension
 */
async function findFiles(dirPath, extension) {
  const files = [];

  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }

  await scan(dirPath);
  return files;
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, standardizeLabFiles, standardizeJsonFiles, processBIMMUDA };
