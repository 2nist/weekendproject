/**
 * Python Essentia Bridge
 * Alternative approach: Use Python Essentia via child process
 * This is more reliable for Electron main process
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let pythonEssentiaAvailable = false;

/**
 * Check if Python Essentia is available
 * Note: Essentia is difficult to build on Windows. This will gracefully fail
 * and the system will use JavaScript Essentia.js instead.
 */
function checkPythonEssentia() {
  return new Promise((resolve) => {
    // Try python3 first, then python
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const python = spawn(pythonCmd, ['-c', 'import essentia.standard; print("OK")']);
    
    let errorOutput = '';
    
    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    python.on('close', (code) => {
      if (code === 0) {
        pythonEssentiaAvailable = true;
        console.log('Python Essentia is available');
      } else {
        pythonEssentiaAvailable = false;
        if (process.platform === 'win32') {
          console.log('Python Essentia not available on Windows (requires building from source). Using JavaScript Essentia.js instead.');
        } else {
          console.log('Python Essentia not available. Using JavaScript Essentia.js instead.');
        }
      }
      resolve(pythonEssentiaAvailable);
    });

    python.on('error', (error) => {
      pythonEssentiaAvailable = false;
      if (process.platform === 'win32') {
        console.log('Python not found or Essentia not installed. Using JavaScript Essentia.js instead.');
      } else {
        console.log('Python Essentia check failed:', error.message);
      }
      resolve(false);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      if (!pythonEssentiaAvailable) {
        python.kill();
        pythonEssentiaAvailable = false;
        resolve(false);
      }
    }, 5000);
  });
}

/**
 * Analyze audio using Python Essentia
 * Creates a Python script, runs it, and parses JSON output
 */
async function analyzeAudioWithPython(filePath, progressCallback = () => {}) {
  if (!pythonEssentiaAvailable) {
    await checkPythonEssentia();
    if (!pythonEssentiaAvailable) {
      throw new Error('Python Essentia not available. Please install: pip install essentia');
    }
  }

  progressCallback(10);

  // Create Python analysis script
  const scriptPath = path.join(os.tmpdir(), `essentia_analysis_${Date.now()}.py`);
  const outputPath = path.join(os.tmpdir(), `essentia_output_${Date.now()}.json`);

  const pythonScript = `
import essentia.standard as es
import json
import sys
import numpy as np

file_path = "${filePath.replace(/\\/g, '/')}"
output_path = "${outputPath.replace(/\\/g, '/')}"

try:
    # Load audio
    audio = es.MonoLoader(filename=file_path)()
    sample_rate = 44100  # Assume standard rate
    
    # Extract features
    extractor = es.MusicExtractor()
    features, _ = extractor(file_path)
    
    # Beat tracking
    beat_tracker = es.BeatTrackerMultiFeature()
    beats = beat_tracker(audio)
    tempo = features.get('rhythm.bpm', 120.0)
    
    # Key detection
    key = features.get('tonal.key_key', 'C')
    scale = features.get('tonal.key_scale', 'major')
    
    # Chroma extraction
    chroma_extractor = es.Chromagram()
    chroma_frames = []
    frame_size = 2048
    hop_size = 1024
    
    for i in range(0, len(audio) - frame_size, hop_size):
        frame = audio[i:i+frame_size]
        chroma = chroma_extractor(frame)
        if len(chroma) > 0:
            chroma_frames.append({
                'timestamp': i / sample_rate,
                'chroma': chroma[0].tolist() if hasattr(chroma[0], 'tolist') else list(chroma[0])
            })
    
    # Build output
    result = {
        'beat_grid': {
            'tempo_bpm': float(tempo),
            'tempo_stability': 0.94,
            'beat_timestamps': beats.tolist() if hasattr(beats, 'tolist') else list(beats),
            'downbeat_timestamps': beats[::4].tolist() if hasattr(beats, 'tolist') else list(beats[::4]),
            'tempo_variations': []
        },
        'metadata': {
            'duration_seconds': len(audio) / sample_rate,
            'sample_rate': sample_rate,
            'detected_key': key,
            'detected_mode': scale
        },
        'chroma_frames': chroma_frames
    }
    
    # Write output
    with open(output_path, 'w') as f:
        json.dump(result, f)
    
    print('SUCCESS')
except Exception as e:
    print(f'ERROR: {str(e)}', file=sys.stderr)
    sys.exit(1)
`;

  fs.writeFileSync(scriptPath, pythonScript);
  progressCallback(20);

  // Run Python script
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath]);
    let errorOutput = '';

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    python.on('close', async (code) => {
      try {
        // Cleanup script
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
        }

        if (code !== 0) {
          reject(new Error(`Python Essentia analysis failed: ${errorOutput}`));
          return;
        }

        // Read output
        if (!fs.existsSync(outputPath)) {
          reject(new Error('Python script did not produce output file'));
          return;
        }

        progressCallback(90);
        const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        
        // Cleanup output
        fs.unlinkSync(outputPath);

        // Build events from chroma frames
        const events = [];
        output.chroma_frames.forEach((frame) => {
          if (output.beat_grid.beat_timestamps.some((beat) => Math.abs(beat - frame.timestamp) < 0.1)) {
            // At a beat - detect chord
            events.push({
              timestamp: frame.timestamp,
              event_type: 'chord_candidate',
              chord_candidate: detectChordFromChromaPython(frame.chroma),
              confidence: 0.7,
              spectral_data: {
                dominant_frequencies: [],
                spectral_centroid: 0,
              },
            });
          }
        });

        progressCallback(100);

        resolve({
          linear_analysis: {
            events,
            beat_grid: output.beat_grid,
            metadata: output.metadata,
            chroma_frames: output.chroma_frames,
          },
        });
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${error.message}`));
      }
    });

    python.on('error', (error) => {
      reject(new Error(`Failed to run Python: ${error.message}`));
    });
  });
}

/**
 * Detect chord from chroma vector (Python version)
 */
function detectChordFromChromaPython(chromaVector) {
  // Simplified chord detection - same as JavaScript version
  if (!chromaVector || chromaVector.length !== 12) {
    return {
      root_candidates: [{ root: 'C', probability: 0.5 }],
      quality_candidates: [{ quality: 'major', probability: 0.5 }],
      bass_note: 'C',
      bass_ambiguity_flag: true,
    };
  }

  const sum = chromaVector.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    return {
      root_candidates: [{ root: 'C', probability: 0.5 }],
      quality_candidates: [{ quality: 'major', probability: 0.5 }],
      bass_note: 'C',
      bass_ambiguity_flag: true,
    };
  }

  // Find strongest chroma bin
  const maxIndex = chromaVector.indexOf(Math.max(...chromaVector));
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const root = noteNames[maxIndex];

  return {
    root_candidates: [{ root, probability: Math.min(chromaVector[maxIndex] / sum, 1.0) }],
    quality_candidates: [{ quality: 'major', probability: 0.7 }],
    bass_note: root,
    bass_ambiguity_flag: chromaVector[maxIndex] / sum < 0.6,
  };
}

module.exports = {
  checkPythonEssentia,
  analyzeAudioWithPython,
};

