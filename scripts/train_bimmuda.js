#!/usr/bin/env node

/**
 * BIMMUDA Training Runner
 * Node.js wrapper to run BIMMUDA model training
 */

const { spawn } = require('child_process');
const path = require('path');

class BIMMUDA_Trainer {
  constructor() {
    this.pythonScript = path.join(__dirname, 'train_bimmuda_models.py');
    this.libraryPath = path.join(__dirname, '..', 'library');
  }

  /**
   * Run the training pipeline
   */
  async train(tasks = ['chord_progression', 'style_classification', 'melody_generation']) {
    return new Promise((resolve, reject) => {
      console.log('🎵 Starting BIMMUDA model training...');
      console.log(`📚 Library path: ${this.libraryPath}`);
      console.log(`🎯 Training tasks: ${tasks.join(', ')}`);

      const args = [this.pythonScript, '--library-path', this.libraryPath, '--tasks', ...tasks];

      const pythonProcess = spawn('python', args, {
        cwd: __dirname,
        stdio: 'inherit', // Show output directly
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Training completed successfully!');
          resolve({ success: true, code });
        } else {
          console.error(`❌ Training failed with exit code ${code}`);
          reject(new Error(`Training failed with code ${code}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('Failed to start training process:', error);
        reject(error);
      });
    });
  }

  /**
   * Check if training data exists
   */
  checkTrainingData() {
    const fs = require('fs');
    const requiredFiles = [
      'processed_bimmuda_training_data.json',
      'chord_progression_prediction_dataset.json',
      'style_classification_dataset.json',
      'melody_generation_dataset.json',
    ];

    console.log('🔍 Checking training data...');

    let missingFiles = [];
    for (const file of requiredFiles) {
      const filePath = path.join(this.libraryPath, file);
      if (!fs.existsSync(filePath)) {
        missingFiles.push(file);
      } else {
        console.log(`✅ Found: ${file}`);
      }
    }

    if (missingFiles.length > 0) {
      console.error('❌ Missing training data files:');
      missingFiles.forEach((file) => console.error(`   - ${file}`));
      console.error('\nPlease run the BIMMUDA data processing first.');
      return false;
    }

    console.log('✅ All training data files found!');
    return true;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const trainer = new BIMMUDA_Trainer();

  // Check training data first
  if (!trainer.checkTrainingData()) {
    process.exit(1);
  }

  // Parse tasks argument
  let tasks = ['chord_progression', 'style_classification', 'melody_generation'];
  const taskIndex = args.indexOf('--tasks');
  if (taskIndex !== -1 && taskIndex + 1 < args.length) {
    tasks = args[taskIndex + 1].split(',');
  }

  try {
    const result = await trainer.train(tasks);
    console.log('\n🎉 BIMMUDA training completed successfully!');
    console.log('📁 Models saved to: library/models/');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Training failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = BIMMUDA_Trainer;
