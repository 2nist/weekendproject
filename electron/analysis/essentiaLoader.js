/**
 * Essentia.js Loader - Optimized
 * Handles Essentia WASM initialization and audio processing
 */

let essentiaInstance = null;
let isEssentiaLoaded = false;
let EssentiaVersion = 'unknown';

/**
 * Load Essentia library components
 */
function loadEssentia() {
  try {
    const essentiaModule = require('essentia.js');
    
    // Handle different export structures (npm vs dist)
    const EssentiaWASM = essentiaModule.EssentiaWASM || essentiaModule.default?.EssentiaWASM;
    const EssentiaFactory = essentiaModule.Essentia || essentiaModule.default?.Essentia;

    if (!EssentiaFactory) {
      throw new Error('Essentia constructor not found in module exports');
    }
    
    // Store version if available
    if (essentiaModule.version) EssentiaVersion = essentiaModule.version;

    return { EssentiaWASM, EssentiaFactory };
  } catch (e) {
    throw new Error(`Could not require('essentia.js'): ${e.message}`);
  }
}

/**
 * Initialize Essentia.js instance
 */
async function getEssentiaInstance() {
  if (isEssentiaLoaded && essentiaInstance) {
    return essentiaInstance;
  }

  try {
    console.log('Initializing Essentia...');
    const { EssentiaWASM, EssentiaFactory } = loadEssentia();

    let wasmModule = EssentiaWASM;
    
    // Modern Emscripten builds return a Promise
    if (typeof EssentiaWASM === 'function') {
      // Locate the WASM file manually if needed for Electron packing
      // (This helps if the .wasm file is packed inside .asar)
      const path = require('path');
      const wasmPath = path.resolve(require.resolve('essentia.js'), '..', 'essentia-wasm.wasm');
      
      // Pass locateFile overrides if your specific version requires it
      // Otherwise, call standard init
      wasmModule = await EssentiaWASM({
         // locateFile: (path) => wasmPath // Uncomment if Electron fails to find WASM
      });
    }

    if (!wasmModule) {
      throw new Error('Failed to initialize WASM backend');
    }

    essentiaInstance = new EssentiaFactory(wasmModule);
    isEssentiaLoaded = true;

    console.log(`Essentia.js initialized (v${essentiaInstance?.version || EssentiaVersion})`);
    return essentiaInstance;
  } catch (error) {
    console.error('CRITICAL: Failed to load Essentia.js:', error.message);
    return null;
  }
}

async function getEssentia() {
  if (!essentiaInstance) await getEssentiaInstance();
  return essentiaInstance;
}

/**
 * Load audio file and convert to Float32Array
 * Optimized for memory usage (no .map())
 */
async function loadAudioFile(filePath, targetSampleRate = 44100) {
  const fs = require('fs');
  const wavDecoder = require('wav-decoder');
  const path = require('path');

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.wav') {
    const buffer = fs.readFileSync(filePath);
    const audioData = await wavDecoder.decode(buffer);
    
    // Check sample rate mismatch
    if (audioData.sampleRate !== targetSampleRate) {
        console.warn(`Warning: Audio file is ${audioData.sampleRate}Hz, but analysis expects ${targetSampleRate}Hz. Results may be frequency-shifted.`);
    }

    let samples;
    const left = audioData.channelData[0];

    // OPTIMIZED: Stereo to Mono conversion
    // Using a for-loop is significantly faster and uses less memory than .map()
    if (audioData.channelData.length > 1) {
      const right = audioData.channelData[1];
      const length = left.length;
      samples = new Float32Array(length);
      
      // Fast mixdown
      for (let i = 0; i < length; i++) {
        samples[i] = (left[i] + right[i]) * 0.5;
      }
    } else {
      // Already mono - just cast to Float32Array if it isn't already
      samples = left instanceof Float32Array ? left : new Float32Array(left);
    }

    return {
      samples: samples,
      sampleRate: audioData.sampleRate, // Return actual rate
      duration: audioData.length / audioData.sampleRate,
    };
  }

  throw new Error(`Format ${ext} not supported directly. Convert to WAV.`);
}

module.exports = {
  loadEssentia,
  getEssentia,
  loadAudioFile,
  getEssentiaInstance,
};
