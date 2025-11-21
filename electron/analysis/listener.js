/**
 * Pass 1: The Listener (Dry Linear Scan)
 * Raw DSP output - analyzes audio without bias
 * Uses Essentia.js for audio analysis
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getEssentia, loadAudioFile } = require('./essentiaLoader');
const { prepareAudioFile, cleanupTempFile } = require('./fileProcessor');
const pythonEssentia = require('./pythonEssentia');
const simpleAnalyzer = require('./simpleAudioAnalyzer');
const {
  calculateRMS,
  calculateChromaFlux,
  calculateChromaEntropy,
  detectVocalPresence,
} = require('./semanticUtils');

// Attempt to load TypeScript ChordAnalyzer at runtime when available
let ChordAnalyzer = null;
try {
  try {
    require('ts-node').register({ transpileOnly: true });
  } catch (e) {
    // ts-node may not be available in production builds
  }
  const CA = require('./chordAnalyzer.ts');
  ChordAnalyzer = CA && CA.default ? CA.default : CA;
} catch (err) {
  try {
    const CA2 = require('./chordAnalyzer');
    ChordAnalyzer = CA2 && CA2.default ? CA2.default : CA2;
  } catch (err2) {
    console.warn(
      'ChordAnalyzer not loaded; TS analyzer disabled',
      err2?.message || err?.message,
    );
    ChordAnalyzer = null;
  }
}
console.log(
  '[ChordAnalyzer] status:',
  ChordAnalyzer ? 'loaded' : 'unavailable',
);

// Helper: run the TypeScript ChordAnalyzer on a linear_analysis object
function runTypeScriptChordAnalyzer(linearAnalysis, opts = {}) {
  if (!ChordAnalyzer || !linearAnalysis) return linearAnalysis;
  try {
    const analyzerInstance = new ChordAnalyzer({ include7ths: true });
    const keyHint = linearAnalysis?.metadata?.detected_key
      ? `${linearAnalysis.metadata.detected_key} ${linearAnalysis.metadata.detected_mode ?? 'major'}`
      : undefined;
    const detectOpts = {
      rootOnly: true,
      temperature: 0.1,
      transitionProb: 0.8,
      diatonicBonus: 0.1,
      rootPeakBias: 0.1,
      globalKey: keyHint,
    };
    // Merge provided opts with defaults
    const mergedOpts = { ...detectOpts, ...(opts || {}) };
    const beatLabels = analyzerInstance.detectChords(
      linearAnalysis,
      mergedOpts,
    );
    console.log('[ChordAnalyzer] detection result:', {
      chromaFrames: linearAnalysis?.chroma_frames?.length || 0,
      beatTimestamps: linearAnalysis?.beat_grid?.beat_timestamps?.length || 0,
      beatLabels: Array.isArray(beatLabels) ? beatLabels.length : 0,
    });
    if (Array.isArray(beatLabels) && beatLabels.length > 0) {
      const preMergeCount = (linearAnalysis.events || []).length;
      const preservedEvents = (linearAnalysis.events || []).filter(
        (e) => e?.event_type !== 'chord_candidate' && e?.event_type !== 'chord',
      );
      const postCleanCount = preservedEvents.length;
      console.log('[ChordAnalyzer] Pre-Merge Event Count:', preMergeCount);
      console.log(
        '[ChordAnalyzer] Post-Clean Event Count (chords removed):',
        postCleanCount,
      );
      const newChordEvents = beatLabels.map((b, idx) => {
        const duration =
          idx + 1 < beatLabels.length
            ? Math.max(0.001, beatLabels[idx + 1].timestamp - b.timestamp)
            : 1.0;
        return {
          timestamp: b.timestamp,
          event_type: 'chord_candidate',
          chord: b.chord || null,
          chord_candidate: {
            root_candidates: [
              { root: b.chord || 'N', probability: b.confidence || 1 },
            ],
            quality_candidates: [],
          },
          confidence: b.confidence || 0,
          duration,
          source: 'TS_Viterbi_Engine',
        };
      });
      linearAnalysis.events = [...preservedEvents, ...newChordEvents];
      console.log(
        `[ChordAnalyzer] Merged ${newChordEvents.length} chord events, preserved ${preservedEvents.length} non-chord events.`,
      );
      console.log(
        '[ChordAnalyzer] Final Event Count:',
        linearAnalysis.events.length,
      );
    }
  } catch (err) {
    console.warn('TS ChordAnalyzer invocation failed:', err?.message || err);
  }
  return linearAnalysis;
}

// Exported helper for recalculating chords for existing linear_analysis objects
function recalcChords(linearAnalysis, opts = {}) {
  // Return a shallow clone of the linear analysis with new chord events
  if (!linearAnalysis)
    return { success: false, error: 'Missing linear analysis' };
  try {
    const copy = JSON.parse(JSON.stringify(linearAnalysis));
    runTypeScriptChordAnalyzer(copy, opts);
    return { success: true, events: copy.events };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

function loadConfig() {
  const configPath = path.resolve(__dirname, 'audioAnalyzerConfig.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    return {
      rhythm_method: config.rhythm_method || 'multifeature',
      onset_sensitivity: config.onset_sensitivity || 0.5,
      spectral_whitening: config.spectral_whitening || 0.0,
      key_detection_major_bias: config.key_detection_major_bias || 0.0,
      chord_duration_min: config.chord_duration_min || 1.0,
    };
  } catch {
    return {
      rhythm_method: 'multifeature',
      onset_sensitivity: 0.5,
      spectral_whitening: 0.0,
      key_detection_major_bias: 0.0,
      chord_duration_min: 1.0,
    };
  }
}

/**
 * Calculate file hash for duplicate detection
 */
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Analyze audio file using Essentia
 * @param {string} filePath - Path to audio file
 * @param {Function} progressCallback - Callback for progress updates (0-100)
 * @returns {Promise<Object>} Linear analysis object per schema
 */
async function analyzeAudio(
  filePath,
  progressCallback = () => {},
  metadataOverrides = {},
) {
  // Prefer the Python sidecar using librosa for robust analysis.
  progressCallback(5);
  const fileInfo = require('./fileProcessor').getFileInfo(filePath);
  const fileHash = fileInfo.hash;

  progressCallback(10);

  // 2. Try Python analysis via bridge first
  try {
    const pythonAvailable = await pythonEssentia.checkPythonEssentia();
    if (pythonAvailable) {
      progressCallback(20);
      try {
        const result = await pythonEssentia.analyzeAudioWithPython(
          filePath,
          (p) => progressCallback(20 + p * 0.8),
        );
        if (result && result.source === 'python_librosa') {
          console.log(
            '✅ SUCCESS: Using Python+Librosa backend. No WASM memory limits!',
          );
        } else if (result) {
          console.warn('⚠️ WARNING: Python returned but missing source tag.');
        }
        if (result && (result.linear_analysis || result)) {
          const output = result.linear_analysis || result;
          // Run TypeScript ChordAnalyzer to generate beat-sync chord labels
          try {
            runTypeScriptChordAnalyzer(output);
          } catch (ex) {
            console.warn('TS ChordAnalyzer failed:', ex?.message || ex);
          }
          try {
            const sr = output?.metadata?.sample_rate;
            const fh =
              output?.metadata?.frame_hop_seconds ||
              output?.metadata?.hop_length / sr;
            const beatsCount = (output?.beat_grid?.beat_timestamps || [])
              .length;
            console.log(
              `[Analyzer] Python linear_analysis: sr=${sr} frame_hop_s=${fh} beats=${beatsCount} source=${result.source || 'python'} file=${filePath}`,
            );
          } catch (e) {
            // Swallow logging errors
          }
          if (metadataOverrides)
            applyMetadataOverrides(output, metadataOverrides);
          progressCallback(100);
          return { fileHash, linear_analysis: output };
        }
      } catch (err) {
        console.warn('Python analysis failed:', err.message);
      }
    } else {
      console.warn(
        '❌ Python not found in system PATH. Falling back to legacy JS (High Crash Risk).',
      );
    }
  } catch (err) {
    console.error('Error checking Python availability:', err.message);
  }

  // Continue to fallback chain (Essentia.js and simple analyzer)

  // Fallback: Try JavaScript Essentia.js (browser-based, may not work in main process)
  try {
    const essentia = await getEssentia();
    if (essentia) {
      console.log('Using JavaScript Essentia.js for analysis');

      // Prepare audio file
      let audioPathToAnalyze = filePath;
      let isTempFile = false;

      try {
        if (path.extname(filePath).toLowerCase() !== '.wav') {
          progressCallback(18);
          audioPathToAnalyze = await prepareAudioFile(filePath);
          isTempFile = true;
        }
      } catch (error) {
        console.warn('Audio conversion failed:', error);
      }

      progressCallback(20);

      // Load audio file
      const audioData = await loadAudioFile(audioPathToAnalyze);
      let { samples, sampleRate, duration } = audioData;

      // 🔴 CRITICAL: Normalize Volume (Peak Normalization)
      // Find the loudest sample and scale everything up to use full dynamic range
      // This prevents false "silence" detection on quiet intros
      let maxVal = 0;
      for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i]);
        if (abs > maxVal) maxVal = abs;
      }
      if (maxVal > 0) {
        // Normalize to use full dynamic range (scale to 1.0)
        // Only apply if audio is below 90% of full scale to avoid over-amplification
        if (maxVal < 0.9) {
          const scale = 0.9 / maxVal; // Scale to 90% to leave headroom
          console.log(
            `Normalizing audio: peak=${maxVal.toFixed(6)}, scale=${scale.toFixed(2)}`,
          );
          for (let i = 0; i < samples.length; i++) {
            samples[i] *= scale;
          }
        }
      }

      // Cleanup temp file if created
      if (isTempFile) {
        cleanupTempFile(audioPathToAnalyze);
      }

      progressCallback(25);

      // Process with Essentia.js
      const processed = await processWithEssentiaJS(
        essentia,
        samples,
        sampleRate,
        duration,
        fileHash,
        progressCallback,
      );
      applyMetadataOverrides(processed.linear_analysis, metadataOverrides);
      // Re-run TS ChordAnalyzer on Essentia.js results (overwrite raw events)
      try {
        runTypeScriptChordAnalyzer(processed.linear_analysis);
      } catch (e) {
        console.warn(
          'TS ChordAnalyzer on Essentia result failed',
          e?.message || e,
        );
      }
      return processed;
    }
  } catch (error) {
    console.warn('JavaScript Essentia.js failed:', error.message);
  }

  // Final fallback: Use simple audio analyzer (no Essentia required)
  console.log(
    'No Essentia available. Using simple audio analyzer (basic DSP algorithms).',
  );
  progressCallback(20);

  try {
    // Prepare audio file (convert to WAV if needed)
    let audioPathToAnalyze = filePath;
    let isTempFile = false;

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    try {
      if (path.extname(filePath).toLowerCase() !== '.wav') {
        console.log('Converting audio file to WAV...');
        progressCallback(25);
        audioPathToAnalyze = await prepareAudioFile(filePath);
        isTempFile = true;
        console.log('Audio conversion complete');
      }
    } catch (error) {
      console.warn('Audio conversion failed, trying direct WAV load:', error);
      // If conversion fails and it's not WAV, we can't proceed
      if (path.extname(filePath).toLowerCase() !== '.wav') {
        throw new Error(
          `Cannot process audio format: ${path.extname(filePath)}. Please convert to WAV first.`,
        );
      }
    }

    console.log('Starting simple audio analysis...');
    progressCallback(30);

    // Use simple analyzer
    const result = await simpleAnalyzer.analyzeAudioSimple(
      audioPathToAnalyze,
      (progress) => {
        // Scale simple analyzer progress to 30-100% range
        const scaledProgress = 30 + progress * 0.7;
        progressCallback(scaledProgress);
        console.log(`Analysis progress: ${Math.round(scaledProgress)}%`);
      },
    );

    console.log('Simple audio analysis complete');

    // Cleanup temp file if created
    if (isTempFile) {
      cleanupTempFile(audioPathToAnalyze);
    }

    progressCallback(100);
    applyMetadataOverrides(result.linear_analysis, metadataOverrides);
    try {
      runTypeScriptChordAnalyzer(result.linear_analysis);
    } catch (e) {
      console.warn('TS ChordAnalyzer on Simple result failed', e?.message || e);
    }
    return {
      fileHash,
      linear_analysis: result.linear_analysis,
    };
  } catch (error) {
    console.error('Simple audio analyzer failed:', error);
    // Last resort: Return placeholder
    console.warn(
      'All analysis methods failed. Returning placeholder structure.',
    );
    progressCallback(50);

    const placeholder = {
      fileHash,
      linear_analysis: {
        events: [],
        beat_grid: {
          tempo_bpm: 120.0,
          tempo_stability: 0.94,
          beat_timestamps: [],
          downbeat_timestamps: [],
          tempo_variations: [],
        },
        metadata: {
          duration_seconds: 0,
          sample_rate: 44100,
          detected_key: 'C',
          detected_mode: 'major',
        },
        chroma_frames: [],
        semantic_features: {
          frame_stride_seconds: 0,
          frames: [],
          feature_version: '1.0.0',
        },
      },
    };
    applyMetadataOverrides(placeholder.linear_analysis, metadataOverrides);
    return placeholder;
  }
}

/**
 * Process audio with Essentia.js (JavaScript version)
 */
async function processWithEssentiaJS(
  essentia,
  samples,
  sampleRate,
  duration,
  fileHash,
  progressCallback,
) {
  // Process audio in frames for analysis
  const frameSize = 2048;
  const hopSize = 1024;
  const events = [];
  const beatTimestamps = [];
  const downbeatTimestamps = [];
  const chromaFrames = [];
  const mfccFrames = []; // MFCC features for timbre tracking
  const semanticFrameFeatures = [];

  // Extract features frame by frame
  const totalFrames = Math.ceil((samples.length - frameSize) / hopSize);

  progressCallback(30); // Starting feature extraction

  // Beat tracking with robust error handling and multiple algorithm fallbacks
  progressCallback(35);
  try {
    // ✅ CRITICAL: Convert JS Array -> C++ VectorFloat
    if (!samples || samples.length === 0) {
      throw new Error('Invalid audio samples');
    }

    console.log(
      `Processing ${samples.length} samples (${(samples.length / sampleRate).toFixed(2)}s) for beat tracking`,
    );

    // Validate and normalize samples
    const samplesToProcess = new Float32Array(samples.length);
    let hasInvalid = false;
    for (let i = 0; i < samples.length; i++) {
      let val = samples[i];
      // Clamp to valid range [-1, 1] and check for NaN/Infinity
      if (isNaN(val) || !isFinite(val)) {
        val = 0;
        hasInvalid = true;
      } else if (val > 1.0) {
        val = 1.0;
      } else if (val < -1.0) {
        val = -1.0;
      }
      samplesToProcess[i] = val;
    }

    if (hasInvalid) {
      console.warn(
        'Audio samples contained invalid values (NaN/Infinity), clamped to 0',
      );
    }

    // Process in smaller chunks (30 seconds max per chunk) to avoid memory issues
    const chunkSize = 30 * sampleRate; // 30 seconds
    const chunks = [];
    for (let i = 0; i < samplesToProcess.length; i += chunkSize) {
      chunks.push({
        data: samplesToProcess.slice(i, i + chunkSize),
        offset: i / sampleRate, // Time offset in seconds
      });
    }

    console.log(`Processing ${chunks.length} chunk(s) for beat tracking`);

    // Process each chunk with multiple algorithm fallbacks
    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      let chunkVector = null;
      let chunkSuccess = false;

      // Load config to determine algorithm priority
      const config = loadConfig();
      const rhythmMethod = config.rhythm_method || 'multifeature';

      // Prioritize algorithm based on config
      // 'degara' is better for non-percussive rhythm (e.g., Eleanor Rigby strings)
      // 'multifeature' is better for standard pop/rock with drums
      let algorithms = [];
      if (rhythmMethod === 'degara') {
        algorithms = [
          {
            name: 'BeatTrackerDegara',
            fn: (vec) => essentia.BeatTrackerDegara(vec),
          },
          {
            name: 'RhythmExtractor2013',
            fn: (vec) => essentia.RhythmExtractor2013(vec),
          },
          {
            name: 'BeatTrackerMultiFeature',
            fn: (vec) => essentia.BeatTrackerMultiFeature(vec),
          },
          { name: 'TempoTap', fn: (vec) => essentia.TempoTap(vec) },
        ];
      } else {
        // Default: multifeature first
        algorithms = [
          {
            name: 'RhythmExtractor2013',
            fn: (vec) => essentia.RhythmExtractor2013(vec),
          },
          {
            name: 'BeatTrackerMultiFeature',
            fn: (vec) => essentia.BeatTrackerMultiFeature(vec),
          },
          {
            name: 'BeatTrackerDegara',
            fn: (vec) => essentia.BeatTrackerDegara(vec),
          },
          { name: 'TempoTap', fn: (vec) => essentia.TempoTap(vec) },
        ];
      }

      // Try each algorithm until one succeeds
      for (const algo of algorithms) {
        if (chunkSuccess) break;

        try {
          // Check if algorithm exists
          if (typeof essentia[algo.name] !== 'function') {
            console.log(`Algorithm ${algo.name} not available, skipping...`);
            continue;
          }

          chunkVector = essentia.arrayToVector(chunk.data);

          if (!chunkVector) {
            console.warn(`Failed to create vector for chunk ${chunkIdx + 1}`);
            continue;
          }

          console.log(`Trying ${algo.name} for chunk ${chunkIdx + 1}...`);
          const rhythmData = algo.fn(chunkVector);

          // Extract ticks based on algorithm output format
          let ticks = [];
          let ticksVector = null;
          let tempo = null;

          try {
            // Different algorithms return different structures
            if (algo.name === 'RhythmExtractor2013') {
              if (rhythmData && rhythmData.ticks) {
                ticksVector = rhythmData.ticks;
                tempo = rhythmData.bpm || null;
              }
            } else if (algo.name === 'BeatTrackerMultiFeature') {
              if (rhythmData && rhythmData.beats) {
                ticksVector = rhythmData.beats;
                tempo = rhythmData.tempo || null;
              }
            } else if (algo.name === 'BeatTrackerDegara') {
              if (rhythmData && rhythmData.beats) {
                ticksVector = rhythmData.beats;
                tempo = rhythmData.tempo || null;
              }
            } else if (algo.name === 'TempoTap') {
              if (rhythmData && rhythmData.ticks) {
                ticksVector = rhythmData.ticks;
                tempo = rhythmData.tempo || null;
              }
            }

            // Convert VectorFloat -> JS Array
            if (ticksVector) {
              if (Array.isArray(ticksVector)) {
                ticks = ticksVector;
              } else if (
                typeof ticksVector === 'object' &&
                essentia.vectorToArray
              ) {
                ticks = essentia.vectorToArray(ticksVector);
              } else {
                ticks = Array.from(ticksVector || []);
              }

              // Validate ticks
              if (
                ticks.length > 0 &&
                ticks.every((t) => typeof t === 'number' && isFinite(t))
              ) {
                // Adjust tick timestamps by chunk offset
                const adjustedTicks = ticks.map((tick) => tick + chunk.offset);
                beatTimestamps.push(...adjustedTicks);

                console.log(
                  `✓ ${algo.name} succeeded for chunk ${chunkIdx + 1}: Extracted ${ticks.length} beats${tempo ? `, tempo: ${tempo.toFixed(1)} BPM` : ''}`,
                );
                chunkSuccess = true;
              } else {
                console.warn(
                  `Invalid ticks from ${algo.name} for chunk ${chunkIdx + 1}`,
                );
              }
            } else {
              console.warn(
                `No ticks found in ${algo.name} result for chunk ${chunkIdx + 1}`,
              );
            }
          } catch (extractError) {
            console.warn(
              `Error extracting ticks from ${algo.name} for chunk ${chunkIdx + 1}:`,
              extractError.message,
            );
          } finally {
            // 🧹 MEMORY CLEANUP: Delete the ticks vector if it was created
            if (
              ticksVector &&
              ticksVector.delete &&
              typeof ticksVector.delete === 'function'
            ) {
              try {
                ticksVector.delete();
              } catch (e) {
                // Ignore cleanup errors
              }
            }
          }

          if (chunkSuccess) break;
        } catch (error) {
          const errorMsg = error.message || String(error);
          // Don't log "abort" errors for every algorithm, just note which one failed
          if (!errorMsg.includes('abort') && !errorMsg.includes('emval')) {
            console.warn(
              `${algo.name} failed for chunk ${chunkIdx + 1}:`,
              errorMsg,
            );
          }

          // Clean up vector before trying next algorithm
          if (chunkVector) {
            try {
              chunkVector.delete();
              chunkVector = null;
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      }

      // Final cleanup
      if (chunkVector && !chunkSuccess) {
        try {
          chunkVector.delete();
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      if (!chunkSuccess) {
        console.warn(
          `All beat tracking algorithms failed for chunk ${chunkIdx + 1}`,
        );
      }
    }

    // Sort and deduplicate beat timestamps
    beatTimestamps.sort((a, b) => a - b);
    const uniqueBeats = [];
    for (let i = 0; i < beatTimestamps.length; i++) {
      if (
        i === 0 ||
        Math.abs(beatTimestamps[i] - beatTimestamps[i - 1]) > 0.01
      ) {
        uniqueBeats.push(beatTimestamps[i]);
      }
    }
    beatTimestamps.length = 0;
    beatTimestamps.push(...uniqueBeats);

    // Detect downbeats (simplified - first beat of every 4-beat measure)
    for (let i = 0; i < beatTimestamps.length; i += 4) {
      if (beatTimestamps[i] !== undefined) {
        downbeatTimestamps.push(beatTimestamps[i]);
      }
    }

    console.log(`Total beats extracted: ${beatTimestamps.length}`);

    if (beatTimestamps.length === 0) {
      console.warn(
        'No beats extracted from any algorithm. Audio may be too quiet or have no clear rhythm.',
      );
    }
  } catch (error) {
    console.warn('Beat tracking failed completely:', error.message || error);
    if (error.stack) {
      console.warn('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
  }

  progressCallback(50); // Beat tracking complete

  // Chroma extraction with correct DSP pipeline: Windowing → Spectrum → SpectralPeaks → HPCP
  progressCallback(55);
  let frameIndex = 0;
  let prevChromaVector = null;
  let prevRms = 0;
  let chromaFailures = 0;
  const maxChromaFailures = 10;

  // Check if algorithms are available
  let algorithmsInitialized = false;
  try {
    if (
      typeof essentia.Windowing === 'function' &&
      typeof essentia.Spectrum === 'function' &&
      typeof essentia.SpectralPeaks === 'function' &&
      typeof essentia.HPCP === 'function'
    ) {
      algorithmsInitialized = true;
      console.log('Essentia DSP pipeline initialized for chroma extraction');
    } else {
      console.warn('Essentia DSP algorithms not available, will use fallback');
    }
  } catch (initError) {
    console.warn(
      'Failed to initialize Essentia DSP pipeline:',
      initError.message,
    );
  }

  // Create the main audio vector once
  let audioVector = null;
  if (samples && samples.length > 0) {
    audioVector = essentia.arrayToVector(samples);
  }

  const totalSamples = samples.length;
  const chromaTotalFrames = Math.ceil((totalSamples - frameSize) / hopSize);

  console.log(
    `Starting robust chroma extraction: ${chromaTotalFrames} frames, frameSize=${frameSize}, hopSize=${hopSize}`,
  );

  // ===========================================================================
  // OPTIMIZED CHROMA EXTRACTION LOOP (Memory & Silence Fix)
  // ===========================================================================
  if (algorithmsInitialized && audioVector) {
    try {
      for (let i = 0; i < totalSamples - frameSize; i += hopSize) {
        const timestamp = i / sampleRate;
        const frame = samples.slice(i, i + frameSize);

        // 1. Silence Detection (JS Side) - Fixes ReferenceError & Saves Memory
        let frameSumSquares = 0;
        for (let j = 0; j < frame.length; j++) {
          frameSumSquares += frame[j] * frame[j];
        }
        const frameRMS = Math.sqrt(frameSumSquares / frame.length);
        const isSilence = frameRMS < 0.002; // Silence threshold

        if (isSilence) {
          // Push zero chroma for silence
          chromaFrames.push({ timestamp, chroma: new Array(12).fill(0) });

          // Track semantic data for silence
          if (frameIndex % 4 === 0) {
            semanticFrameFeatures.push({
              timestamp,
              rms: frameRMS,
              spectral_flux: 0,
              chroma_entropy: 0,
              has_vocals: false,
              rms_delta: frameRMS - prevRms,
            });
          }
          prevRms = frameRMS;

          // Skip DSP
          frameIndex++;

          // --- EVENT LOOP YIELD (Prevents "Stuck" console) ---
          // More frequent yields for better responsiveness
          if (frameIndex % 50 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            const progress = 55 + (frameIndex / chromaTotalFrames) * 30;
            progressCallback(Math.min(progress, 90));

            // Log progress every 1000 frames for visibility
            if (frameIndex % 1000 === 0) {
              console.log(
                `[DSP] Processed ${frameIndex} / ${chromaTotalFrames} frames (${((frameIndex / chromaTotalFrames) * 100).toFixed(1)}%)`,
              );
            }
          }

          continue;
        }

        // 2. DSP Processing (Only for non-silent frames)
        let frameVector = null;
        try {
          frameVector = essentia.arrayToVector(frame);

          // Windowing
          const windowed = essentia.Windowing(frameVector, 'hann', frameSize);
          if (!windowed.frame) throw new Error('Windowing failed');

          // Spectrum
          const spectrum = essentia.Spectrum(windowed.frame, frameSize);
          if (!spectrum.spectrum) {
            windowed.frame.delete();
            throw new Error('Spectrum failed');
          }

          // Peaks
          let peaks = null;
          try {
            peaks = essentia.SpectralPeaks(
              spectrum.spectrum,
              60,
              5000,
              100,
              sampleRate,
              'magnitude',
            );
          } catch (e) {
            peaks = essentia.SpectralPeaks(spectrum.spectrum, 60, 5000);
          }

          if (!peaks.frequencies || !peaks.magnitudes) {
            windowed.frame.delete();
            spectrum.spectrum.delete();
            throw new Error('Peaks failed');
          }

          // HPCP (Chroma)
          let chromaVector = null;

          // Safety: Check if peaks exist to avoid WASM crash
          let peaksSize = 0;
          try {
            if (peaks.frequencies.size) peaksSize = peaks.frequencies.size();
            else if (peaks.frequencies.length)
              peaksSize = peaks.frequencies.length;
          } catch (e) {
            peaksSize = 1;
          }

          if (peaksSize < 3) {
            chromaVector = new Array(12).fill(0);
          } else {
            const hpcpOutput = essentia.HPCP(
              peaks.frequencies,
              peaks.magnitudes,
            );
            if (hpcpOutput.hpcp) {
              chromaVector = essentia.vectorToArray
                ? essentia.vectorToArray(hpcpOutput.hpcp)
                : Array.from(hpcpOutput.hpcp);
              hpcpOutput.hpcp.delete();
            }
          }

          if (!chromaVector) chromaVector = new Array(12).fill(0);

          chromaFrames.push({ timestamp, chroma: chromaVector });

          // MFCC (Optional) - Disabled for performance (can be enabled if needed)
          // MFCC is computationally expensive and doubles processing time
          // Uncomment if MFCC features are required:
          // try {
          //     if (typeof essentia.MFCC === 'function') {
          //         const mfccRes = essentia.MFCC(frameVector, sampleRate);
          //         if (mfccRes.bands) {
          //             const mfccArr = essentia.vectorToArray ? essentia.vectorToArray(mfccRes.bands) : Array.from(mfccRes.bands);
          //             mfccFrames.push({ timestamp, mfcc: mfccArr.slice(0, 13) });
          //             mfccRes.bands.delete();
          //         }
          //     }
          // } catch (e) {}

          // Semantic Features
          const spectralFlux = prevChromaVector
            ? calculateChromaFlux(chromaVector, prevChromaVector)
            : 0;
          const chromaEntropy = calculateChromaEntropy(chromaVector);

          if (frameIndex % 4 === 0) {
            semanticFrameFeatures.push({
              timestamp,
              rms: frameRMS,
              spectral_flux: spectralFlux,
              chroma_entropy: chromaEntropy,
              has_vocals: detectVocalPresence(
                frameRMS,
                spectralFlux,
                chromaEntropy,
              ),
              rms_delta: frameRMS - prevRms,
            });
          }

          // Chord Detection (Beat Sync) - Only check if we have beats
          // Optimize: Pre-filter beats to avoid expensive .some() on every frame
          if (beatTimestamps.length > 0) {
            // Only check if timestamp is near a beat (within 0.1s)
            const nearBeat = beatTimestamps.some(
              (beat) => Math.abs(beat - timestamp) < 0.1,
            );
            if (nearBeat) {
              try {
                const chordDetection = detectChordFromChroma(
                  chromaVector,
                  essentia,
                );
                if (chordDetection) {
                  events.push({
                    timestamp,
                    event_type: 'chord_candidate',
                    chord_candidate: chordDetection.chord_candidate,
                    confidence: chordDetection.confidence,
                    spectral_data: {
                      dominant_frequencies: [],
                      spectral_centroid: 0,
                    },
                    ambiguity_flags: chordDetection.ambiguity_flags || [],
                  });
                }
              } catch (e) {}
            }
          }

          prevChromaVector = chromaVector;
          prevRms = frameRMS;

          // Cleanup C++ objects for this frame
          windowed.frame.delete();
          spectrum.spectrum.delete();
          peaks.frequencies.delete();
          peaks.magnitudes.delete();
        } catch (frameError) {
          chromaFailures++;
          if (chromaFailures <= maxChromaFailures) {
            console.warn(`Frame ${frameIndex} error: ${frameError.message}`);
          }
          chromaFrames.push({ timestamp, chroma: new Array(12).fill(0) });
        } finally {
          if (frameVector && frameVector.delete) frameVector.delete();
        }

        frameIndex++;

        // --- EVENT LOOP YIELD (Prevents "Stuck" console) ---
        // More frequent yields for better responsiveness (every 50 frames instead of 100)
        if (frameIndex % 50 === 0) {
          // This yield is critical for Node.js to flush stdout and keep UI responsive
          await new Promise((resolve) => setTimeout(resolve, 0));

          const progress = 55 + (frameIndex / chromaTotalFrames) * 30;
          progressCallback(Math.min(progress, 90));

          // Log progress every 1000 frames for visibility
          if (frameIndex % 1000 === 0) {
            console.log(
              `[DSP] Processed ${frameIndex} / ${chromaTotalFrames} frames (${((frameIndex / chromaTotalFrames) * 100).toFixed(1)}%)`,
            );
          }
        }
      }
    } catch (loopError) {
      console.error('Chroma extraction loop crashed:', loopError.message);
    } finally {
      if (audioVector && audioVector.delete) {
        try {
          audioVector.delete();
        } catch (e) {}
      }
    }
  } else {
    // Fallback: Use simple analyzer if Essentia DSP pipeline not available
    console.warn(
      'Essentia DSP pipeline not available, using simple analyzer for chroma',
    );
    try {
      const simpleAnalyzer = require('./simpleAudioAnalyzer');
      const simpleChromaFrames = await simpleAnalyzer.extractChromaWithProgress(
        samples,
        sampleRate,
        (progress) => {
          const overallProgress = 55 + progress * 0.3;
          progressCallback(Math.min(overallProgress, 85));
        },
      );

      if (
        simpleChromaFrames &&
        simpleChromaFrames.chromaFrames &&
        simpleChromaFrames.chromaFrames.length > 0
      ) {
        chromaFrames.push(...simpleChromaFrames.chromaFrames);
        if (simpleChromaFrames.semanticFrames) {
          semanticFrameFeatures.push(...simpleChromaFrames.semanticFrames);
        }
        console.log(
          `Created ${chromaFrames.length} chroma frames using simple analyzer fallback`,
        );
      }
    } catch (fallbackError) {
      console.warn(
        'Simple analyzer chroma fallback also failed:',
        fallbackError.message,
      );
    }
  }

  console.log(
    `Chroma extraction complete: ${chromaFrames.length} frames extracted`,
  );
  progressCallback(85);

  // If chroma extraction completely failed, use simple analyzer's chroma extraction as fallback
  if (
    chromaFrames.length === 0 &&
    beatTimestamps.length > 0 &&
    samples.length > 0
  ) {
    console.warn(
      'Essentia chroma extraction failed, using simple analyzer fallback',
    );
    try {
      const simpleAnalyzer = require('./simpleAudioAnalyzer');
      const simpleChromaFrames = await simpleAnalyzer.extractChromaWithProgress(
        samples,
        sampleRate,
        (p) => {},
      );

      if (simpleChromaFrames && simpleChromaFrames.length > 0) {
        chromaFrames.push(...simpleChromaFrames);
      } else {
        throw new Error('Simple analyzer chroma also returned empty');
      }
    } catch (fallbackError) {
      console.warn('Creating minimal chroma from beats as last resort');
      for (const beatTime of beatTimestamps.slice(
        0,
        Math.min(beatTimestamps.length, 500),
      )) {
        chromaFrames.push({
          timestamp: beatTime,
          chroma: new Array(12).fill(0.1),
        });
      }
    }
  }

  // Key detection setup
  progressCallback(90);
  let detectedKey = 'C';
  let detectedMode = 'major';
  let keyDetectionSuccess = false;
  const config = loadConfig();
  const majorBias = config.key_detection_major_bias || 0.0;

  const keyAlgorithms = [
    { name: 'KeyExtractor', fn: (vec, sr) => essentia.KeyExtractor(vec, sr) },
    { name: 'Key', fn: (vec, sr) => essentia.Key(vec, sr) },
    {
      name: 'TonalExtractor',
      fn: (vec, sr) => essentia.TonalExtractor(vec, sr),
    },
  ];

  for (const algo of keyAlgorithms) {
    if (keyDetectionSuccess) break;
    let keySignalVector = null;
    try {
      if (typeof essentia[algo.name] !== 'function') continue;

      const maxKeySamples = Math.min(samples.length, 60 * sampleRate);
      const keySamples = samples.slice(0, maxKeySamples);
      keySignalVector = essentia.arrayToVector(keySamples);

      if (!keySignalVector) continue;

      const keyDetection = algo.fn(keySignalVector, sampleRate);
      if (keyDetection) {
        let key = null;
        let scale = null;
        if (algo.name === 'KeyExtractor') {
          key = keyDetection.key;
          scale = keyDetection.scale || keyDetection.mode;
        } else if (algo.name === 'Key') {
          key = keyDetection.key;
          scale = keyDetection.scale || keyDetection.mode;
        } else if (algo.name === 'TonalExtractor') {
          key = keyDetection.key_key;
          scale = keyDetection.key_scale || keyDetection.key_mode;
        }

        if (key && typeof key === 'string' && key.length > 0) {
          detectedKey = key;
          if (!scale && majorBias > 0) {
            detectedMode = 'major';
          } else {
            detectedMode = scale || 'major';
          }
          keyDetectionSuccess = true;
          console.log(
            `✓ ${algo.name} succeeded: ${detectedKey} ${detectedMode}`,
          );
        }
      }
    } catch (error) {
      // ignore individual key algo failures
    } finally {
      if (keySignalVector) {
        try {
          keySignalVector.delete();
        } catch (e) {}
      }
    }
  }

  if (!keyDetectionSuccess && chromaFrames.length > 0) {
    // Simple fallback key detection
    try {
      const chromaSum = new Array(12).fill(0);
      chromaFrames.forEach((f) => {
        if (f.chroma) f.chroma.forEach((v, i) => (chromaSum[i] += v));
      });
      const maxIdx = chromaSum.indexOf(Math.max(...chromaSum));
      const keyNames = [
        'C',
        'C#',
        'D',
        'D#',
        'E',
        'F',
        'F#',
        'G',
        'G#',
        'A',
        'A#',
        'B',
      ];
      detectedKey = keyNames[maxIdx];
      console.log(`Fallback key from chroma: ${detectedKey}`);
    } catch (e) {}
  }

  progressCallback(95);

  // Build result
  const linear_analysis = {
    events: events.sort((a, b) => a.timestamp - b.timestamp),
    beat_grid: {
      tempo_bpm:
        beatTimestamps.length > 1
          ? 60 / (beatTimestamps[1] - beatTimestamps[0] || 0.5)
          : 120,
      tempo_stability: calculateTempoStability(beatTimestamps),
      beat_timestamps: beatTimestamps,
      downbeat_timestamps: downbeatTimestamps,
      tempo_variations: [],
    },
    metadata: {
      duration_seconds: duration,
      sample_rate: sampleRate,
      detected_key: detectedKey,
      detected_mode: detectedMode,
    },
    chroma_frames: chromaFrames,
    mfcc_frames: mfccFrames,
    semantic_features: {
      frame_stride_seconds: hopSize / sampleRate,
      frames: semanticFrameFeatures,
      feature_version: '1.0.0',
    },
  };

  progressCallback(100);

  return {
    fileHash,
    linear_analysis,
  };
}

/**
 * Detect chord from chroma vector
 * Simplified chord detection using chroma template matching
 */
function detectChordFromChroma(chromaVector, essentia) {
  if (!chromaVector || chromaVector.length !== 12) {
    return null;
  }

  // Chord templates (chroma patterns)
  const chordTemplates = {
    C: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], // C-E-G
    Dm: [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0], // D-F-A
    Em: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1], // E-G-B
    F: [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0], // F-A-C
    G: [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], // G-B-D
    Am: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], // A-C-E
    Bdim: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0], // B-D-F
  };

  // Normalize chroma vector
  const sum = chromaVector.reduce((a, b) => a + b, 0);
  if (sum === 0) return null;

  const normalizedChroma = chromaVector.map((v) => v / sum);

  // Match against templates
  let bestMatch = null;
  let bestScore = 0;

  for (const [chordName, template] of Object.entries(chordTemplates)) {
    let score = 0;
    for (let i = 0; i < 12; i++) {
      score += normalizedChroma[i] * template[i];
    }

    // Try different roots (circular shift)
    for (let shift = 1; shift < 12; shift++) {
      let shiftedScore = 0;
      for (let i = 0; i < 12; i++) {
        shiftedScore += normalizedChroma[i] * template[(i + shift) % 12];
      }
      if (shiftedScore > score) {
        score = shiftedScore;
      }
    }

    if (score > bestScore && score > 0.3) {
      // Threshold for chord detection
      bestScore = score;
      bestMatch = chordName;
    }
  }

  if (!bestMatch) return null;

  // Extract root and quality
  const root = bestMatch.replace(/m|dim|aug|sus|7/gi, '').trim();
  let quality = 'major';
  if (bestMatch.includes('m')) quality = 'minor';
  if (bestMatch.includes('dim')) quality = 'diminished';
  if (bestMatch.includes('aug')) quality = 'augmented';

  return {
    chord_candidate: {
      root_candidates: [{ root, probability: bestScore }],
      quality_candidates: [{ quality, probability: bestScore }],
      bass_note: root,
      bass_ambiguity_flag: bestScore < 0.6,
    },
    confidence: Math.min(bestScore, 1.0),
    dominant_frequencies: [], // Would extract from spectral analysis
    ambiguity_flags: bestScore < 0.6 ? ['weak_fundamental'] : [],
  };
}

function applyMetadataOverrides(linearAnalysis, metadataOverrides = {}) {
  if (!linearAnalysis) {
    return;
  }

  linearAnalysis.metadata = linearAnalysis.metadata || {};
  linearAnalysis.beat_grid = linearAnalysis.beat_grid || {};

  const overrides = metadataOverrides || {};
  const beatGrid = linearAnalysis.beat_grid;

  if (overrides.key_hint) {
    linearAnalysis.metadata.detected_key = overrides.key_hint;
    linearAnalysis.metadata.key_source = 'metadata_hint';
  }

  if (overrides.mode_hint) {
    linearAnalysis.metadata.detected_mode = overrides.mode_hint;
    linearAnalysis.metadata.mode_source = 'metadata_hint';
  }

  if (overrides.tempo_hint) {
    const measuredTempo = beatGrid.tempo_bpm || overrides.tempo_hint;
    const ratio = measuredTempo > 0 ? measuredTempo / overrides.tempo_hint : 1;

    if (
      Array.isArray(beatGrid.beat_timestamps) &&
      beatGrid.beat_timestamps.length > 0 &&
      ratio > 1.25
    ) {
      const dropEvery = Math.max(2, Math.round(ratio));
      beatGrid.beat_timestamps = beatGrid.beat_timestamps.filter(
        (_, idx) => idx % dropEvery === 0,
      );
      if (Array.isArray(beatGrid.downbeat_timestamps)) {
        beatGrid.downbeat_timestamps = beatGrid.downbeat_timestamps.filter(
          (_, idx) => idx % dropEvery === 0,
        );
      }
    }

    beatGrid.tempo_bpm = overrides.tempo_hint;
    beatGrid.tempo_source = 'metadata_hint';
  }

  if (overrides.genre_hint) {
    linearAnalysis.metadata.genre_hint = overrides.genre_hint;
  }
}

/**
 * Calculate tempo stability from beat timestamps
 */
function calculateTempoStability(beatTimestamps) {
  if (beatTimestamps.length < 2) return 0.5;

  const intervals = [];
  for (let i = 1; i < beatTimestamps.length; i++) {
    intervals.push(beatTimestamps[i] - beatTimestamps[i - 1]);
  }

  if (intervals.length === 0) return 0.5;

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  // Stability is inverse of coefficient of variation
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;
  const stability = Math.max(0, 1 - coefficientOfVariation);

  return Math.min(stability, 1.0);
}

/**
 * Extract note onsets from audio (helper function)
 */
async function extractNoteOnsets(audioSamples, sampleRate, essentia) {
  const onsets = [];
  const frameSize = 2048;
  const hopSize = 1024;

  for (let i = 0; i < audioSamples.length - frameSize; i += hopSize) {
    const frame = audioSamples.slice(i, i + frameSize);
    const timestamp = i / sampleRate;

    const onsetDetection = essentia.OnsetRate(frame, sampleRate);
    if (onsetDetection && onsetDetection.onsetRate > 0.5) {
      onsets.push({
        timestamp,
        confidence: Math.min(onsetDetection.onsetRate, 1.0),
      });
    }
  }

  return onsets;
}

/**
 * Extract chroma features (helper function)
 */
async function extractChromaFeatures(audioSamples, sampleRate, essentia) {
  const chromaFrames = [];
  const frameSize = 2048;
  const hopSize = 1024;

  for (let i = 0; i < audioSamples.length - frameSize; i += hopSize) {
    const frame = audioSamples.slice(i, i + frameSize);
    const timestamp = i / sampleRate;

    const chroma = essentia.Chromagram(frame, sampleRate);
    if (chroma && chroma.chromagram) {
      chromaFrames.push({
        timestamp,
        chroma: Array.from(chroma.chromagram),
      });
    }
  }

  return chromaFrames;
}

module.exports = {
  analyzeAudio,
  calculateFileHash,
  extractNoteOnsets,
  extractChromaFeatures,
  detectChordFromChroma,
  calculateTempoStability,
  recalcChords,
};
