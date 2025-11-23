/**
 * BIMMUDA ML Integration Module
 * Provides Node.js interface to Python ML models trained on BIMMUDA dataset
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class BIMMUDA_ML_Integration {
  constructor() {
    this.pythonScript = path.join(__dirname, '..', 'scripts', 'bimmuda_inference.py');
    this.modelsPath = path.join(__dirname, '..', 'library', 'models');
    this.isInitialized = false;
  }

  /**
   * Initialize the ML integration by checking if models are available
   */
  async initialize() {
    try {
      // Check if inference script exists
      if (!fs.existsSync(this.pythonScript)) {
        throw new Error('BIMMUDA inference script not found');
      }

      // Check if models directory exists and has models
      if (!fs.existsSync(this.modelsPath)) {
        console.warn('Models directory not found - models need to be trained first');
        this.isInitialized = false;
        return false;
      }

      // Check for model files
      const modelFiles = fs.readdirSync(this.modelsPath);
      const hasModels = modelFiles.some((file) => file.endsWith('.h5'));

      if (!hasModels) {
        console.warn('No trained models found - please run training first');
        this.isInitialized = false;
        return false;
      }

      this.isInitialized = true;
      console.log('✅ BIMMUDA ML integration initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize BIMMUDA ML integration:', error);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Execute Python inference script with given arguments
   */
  async runInference(method, args = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isInitialized) {
        reject(new Error('BIMMUDA ML integration not initialized'));
        return;
      }

      // Prepare command arguments
      const scriptArgs = [this.pythonScript, method, JSON.stringify(args)];

      // Spawn Python process
      const pythonProcess = spawn('python', scriptArgs, {
        cwd: path.dirname(this.pythonScript),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse Python output: ${parseError.message}`));
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }

  /**
   * Predict next chords in a progression
   */
  async predictChordProgression(chordSequence, maxPredictions = 5) {
    try {
      const result = await this.runInference('predict_chords', {
        chord_sequence: chordSequence,
        max_predictions: maxPredictions,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.predictions || [];
    } catch (error) {
      console.error('Chord progression prediction failed:', error);
      return [];
    }
  }

  /**
   * Classify musical style/genre
   */
  async classifyStyle(audioFeatures) {
    try {
      const result = await this.runInference('classify_style', {
        features: audioFeatures,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.classification || null;
    } catch (error) {
      console.error('Style classification failed:', error);
      return null;
    }
  }

  /**
   * Generate melody continuation
   */
  async generateMelody(seedSequence, length = 16) {
    try {
      const result = await this.runInference('generate_melody', {
        seed_sequence: seedSequence,
        length: length,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.melody || null;
    } catch (error) {
      console.error('Melody generation failed:', error);
      return null;
    }
  }

  /**
   * Analyze audio file using ML models
   */
  async analyzeAudioFile(audioPath) {
    try {
      const result = await this.runInference('analyze_audio', {
        audio_path: audioPath,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      console.error('Audio analysis failed:', error);
      return { error: error.message };
    }
  }

  /**
   * Get ML integration status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      modelsPath: this.modelsPath,
      scriptPath: this.pythonScript,
      modelsExist: fs.existsSync(this.modelsPath)
        ? fs.readdirSync(this.modelsPath).filter((f) => f.endsWith('.h5')).length
        : 0,
    };
  }
}

// Export singleton instance
const bimmudaML = new BIMMUDA_ML_Integration();

module.exports = bimmudaML;
