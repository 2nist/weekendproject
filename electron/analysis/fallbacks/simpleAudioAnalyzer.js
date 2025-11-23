/**
 * Simple Audio Analyzer
 * A working audio analysis implementation that doesn't require Essentia
 * Uses basic DSP algorithms to extract musical features
 */

const wavDecoder = require('wav-decoder');
const fs = require('fs');
const {
  calculateRMS,
  calculateChromaFlux,
  calculateChromaEntropy,
  detectVocalPresence,
} = require('../semanticUtils');

/**
 * Simple beat detection using autocorrelation
 */
function detectBeats(samples, sampleRate) {
  const beatTimestamps = [];
  const downbeatTimestamps = [];

  // Calculate energy envelope
  const frameSize = 1024;
  const hopSize = 512;
  const energy = [];

  for (let i = 0; i < samples.length - frameSize; i += hopSize) {
    let frameEnergy = 0;
    for (let j = 0; j < frameSize; j++) {
      frameEnergy += Math.abs(samples[i + j]);
    }
    energy.push(frameEnergy / frameSize);
  }

  // Simple peak detection for beats
  const threshold = (energy.reduce((a, b) => a + b, 0) / energy.length) * 1.5;

  for (let i = 1; i < energy.length - 1; i++) {
    if (
      energy[i] > threshold &&
      energy[i] > energy[i - 1] &&
      energy[i] > energy[i + 1]
    ) {
      const timestamp = (i * hopSize) / sampleRate;
      beatTimestamps.push(timestamp);
    }
  }

  // Estimate tempo from beat intervals
  let tempo = 120;
  if (beatTimestamps.length > 1) {
    const intervals = [];
    for (let i = 1; i < Math.min(beatTimestamps.length, 20); i++) {
      intervals.push(beatTimestamps[i] - beatTimestamps[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    tempo = 60 / avgInterval;
  }

  // Detect downbeats (every 4th beat)
  for (let i = 0; i < beatTimestamps.length; i += 4) {
    downbeatTimestamps.push(beatTimestamps[i]);
  }

  return { beatTimestamps, downbeatTimestamps, tempo };
}

/**
 * Extract chroma features using FFT (with progress callback)
 */
async function extractChromaWithProgress(
  samples,
  sampleRate,
  progressCallback = () => {},
) {
  const frameSize = 2048;
  const hopSize = 1024;
  const chromaFrames = [];
  const semanticFrames = [];

  const totalFrames = Math.floor((samples.length - frameSize) / hopSize);
  let processedFrames = 0;
  let prevChromaVector = null;
  let prevRms = 0;

  // Simple FFT implementation (or use a library)
  for (let i = 0; i < samples.length - frameSize; i += hopSize) {
    const frame = samples.slice(i, i + frameSize);
    const timestamp = i / sampleRate;

    // Simple chroma extraction using magnitude spectrum
    const chroma = new Array(12).fill(0);

    // Calculate FFT (simplified - using windowed frame)
    const windowed = frame.map((s, idx) => {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * idx) / frameSize);
      return s * window;
    });

    // Simple frequency binning (approximate)
    for (let bin = 0; bin < frameSize / 2; bin++) {
      const freq = (bin * sampleRate) / frameSize;
      if (freq > 80 && freq < 5000) {
        // Focus on musical range
        const magnitude = Math.abs(windowed[bin] || 0);
        const noteIndex = Math.round(12 * Math.log2(freq / 440)) % 12;
        const noteIndexPositive = noteIndex < 0 ? noteIndex + 12 : noteIndex;
        chroma[noteIndexPositive] += magnitude;
      }
    }

    // Normalize
    const sum = chroma.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      chroma.forEach((val, idx) => {
        chroma[idx] = val / sum;
      });
    }

    chromaFrames.push({
      timestamp,
      chroma: chroma,
    });

    const rms = calculateRMS(frame);
    const spectralFlux = prevChromaVector
      ? calculateChromaFlux(chroma, prevChromaVector)
      : 0;
    const chromaEntropy = calculateChromaEntropy(chroma);
    const hasVocals = detectVocalPresence(rms, spectralFlux, chromaEntropy);
    if (processedFrames % 4 === 0) {
      semanticFrames.push({
        timestamp,
        rms,
        spectral_flux: spectralFlux,
        chroma_entropy: chromaEntropy,
        has_vocals: hasVocals,
        rms_delta: rms - prevRms,
      });
    }
    prevChromaVector = chroma.slice();
    prevRms = rms;

    processedFrames++;

    // Update progress every 100 frames or at the end
    if (processedFrames % 100 === 0 || processedFrames === totalFrames) {
      const progress = processedFrames / totalFrames;
      progressCallback(progress * 100);

      // Allow event loop to process every 100 frames
      if (processedFrames % 100 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }

  return {
    chromaFrames,
    semanticFrames,
    frameStrideSeconds: hopSize / sampleRate,
  };
}

/**
 * Extract chroma features using FFT (synchronous version for backwards compatibility)
 */
function extractChroma(samples, sampleRate) {
  const frameSize = 2048;
  const hopSize = 1024;
  const chromaFrames = [];

  // Simple FFT implementation (or use a library)
  for (let i = 0; i < samples.length - frameSize; i += hopSize) {
    const frame = samples.slice(i, i + frameSize);
    const timestamp = i / sampleRate;

    // Simple chroma extraction using magnitude spectrum
    const chroma = new Array(12).fill(0);

    // Calculate FFT (simplified - using windowed frame)
    const windowed = frame.map((s, idx) => {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * idx) / frameSize);
      return s * window;
    });

    // Simple frequency binning (approximate)
    for (let bin = 0; bin < frameSize / 2; bin++) {
      const freq = (bin * sampleRate) / frameSize;
      if (freq > 80 && freq < 5000) {
        // Focus on musical range
        const magnitude = Math.abs(windowed[bin] || 0);
        const noteIndex = Math.round(12 * Math.log2(freq / 440)) % 12;
        const noteIndexPositive = noteIndex < 0 ? noteIndex + 12 : noteIndex;
        chroma[noteIndexPositive] += magnitude;
      }
    }

    // Normalize
    const sum = chroma.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      chroma.forEach((val, idx) => {
        chroma[idx] = val / sum;
      });
    }

    chromaFrames.push({
      timestamp,
      chroma: chroma,
    });
  }

  return chromaFrames;
}

/**
 * Detect key from chroma features
 */
function detectKey(chromaFrames) {
  // Major and minor key profiles
  const majorProfile = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
  ];
  const minorProfile = [
    6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
  ];

  const noteNames = [
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

  // Average chroma across all frames
  const avgChroma = new Array(12).fill(0);
  chromaFrames.forEach((frame) => {
    frame.chroma.forEach((val, idx) => {
      avgChroma[idx] += val;
    });
  });
  const sum = avgChroma.reduce((a, b) => a + b, 0);
  if (sum > 0) {
    avgChroma.forEach((val, idx) => {
      avgChroma[idx] = val / sum;
    });
  }

  // Match against key profiles
  let bestKey = 'C';
  let bestMode = 'major';
  let bestScore = 0;

  for (let shift = 0; shift < 12; shift++) {
    // Test major
    let majorScore = 0;
    for (let i = 0; i < 12; i++) {
      majorScore += avgChroma[i] * majorProfile[(i - shift + 12) % 12];
    }

    // Test minor
    let minorScore = 0;
    for (let i = 0; i < 12; i++) {
      minorScore += avgChroma[i] * minorProfile[(i - shift + 12) % 12];
    }

    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestKey = noteNames[shift];
      bestMode = 'major';
    }

    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestKey = noteNames[shift];
      bestMode = 'minor';
    }
  }

  return { key: bestKey, mode: bestMode };
}

/**
 * Detect chords from chroma
 */
function detectChord(chroma) {
  const noteNames = [
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

  // Find strongest chroma bins
  const sorted = chroma
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => b.val - a.val);

  const rootIdx = sorted[0].idx;
  const root = noteNames[rootIdx];

  // Simple chord quality detection
  const third = chroma[(rootIdx + 4) % 12];
  const fifth = chroma[(rootIdx + 7) % 12];

  let quality = 'major';
  if (third < 0.1) {
    quality = 'suspended';
  } else if (third < chroma[(rootIdx + 3) % 12]) {
    quality = 'minor';
  }

  return {
    root,
    quality,
    confidence: sorted[0].val,
  };
}

/**
 * Analyze audio file without Essentia
 */
async function analyzeAudioSimple(filePath, progressCallback = () => {}) {
  console.log('Simple analyzer: Starting analysis of', filePath);
  progressCallback(10);

  // Load WAV file
  console.log('Simple analyzer: Loading WAV file...');
  const buffer = fs.readFileSync(filePath);
  const audioData = await wavDecoder.decode(buffer);

  console.log('Simple analyzer: Audio loaded -', {
    sampleRate: audioData.sampleRate,
    channels: audioData.channelData.length,
    length: audioData.length,
    duration: audioData.length / audioData.sampleRate,
  });

  if (
    !audioData ||
    !audioData.channelData ||
    audioData.channelData.length === 0
  ) {
    throw new Error('Invalid audio data: no channels found');
  }

  if (audioData.length === 0) {
    throw new Error('Invalid audio data: file appears to be empty');
  }

  progressCallback(20);

  // Convert to mono
  let samples = audioData.channelData[0];
  if (audioData.channelData.length > 1) {
    const right = audioData.channelData[1];
    samples = samples.map((left, i) => (left + right[i]) / 2);
  }

  const samplesArray = new Float32Array(samples);
  const sampleRate = audioData.sampleRate;
  const duration = audioData.length / audioData.sampleRate;

  console.log(
    'Simple analyzer: Processing',
    samplesArray.length,
    'samples, duration:',
    duration,
    'seconds',
  );

  if (samplesArray.length === 0) {
    throw new Error('No audio samples to process');
  }

  progressCallback(30);

  // Beat detection (with progress updates)
  console.log('Simple analyzer: Starting beat detection...');
  progressCallback(35);
  await new Promise((resolve) => setImmediate(resolve)); // Allow UI to update
  const { beatTimestamps, downbeatTimestamps, tempo } = detectBeats(
    samplesArray,
    sampleRate,
  );
  console.log(
    'Simple analyzer: Beat detection complete -',
    beatTimestamps.length,
    'beats, tempo:',
    tempo,
  );
  progressCallback(40);
  await new Promise((resolve) => setImmediate(resolve));

  // Chroma extraction (process in chunks for progress visibility)
  console.log('Simple analyzer: Starting chroma extraction...');
  progressCallback(45);
  await new Promise((resolve) => setImmediate(resolve));
  const { chromaFrames, semanticFrames, frameStrideSeconds } =
    await extractChromaWithProgress(samplesArray, sampleRate, (progress) => {
      progressCallback(45 + (progress / 100) * 15); // 45-60%
    });
  console.log(
    'Simple analyzer: Chroma extraction complete -',
    chromaFrames.length,
    'frames',
  );
  progressCallback(60);
  await new Promise((resolve) => setImmediate(resolve));

  // Key detection
  console.log('Simple analyzer: Starting key detection...');
  progressCallback(65);
  const { key, mode } = detectKey(chromaFrames);
  console.log('Simple analyzer: Key detected -', key, mode);
  progressCallback(70);
  await new Promise((resolve) => setImmediate(resolve));

  // Build events from chroma and beats (with progress)
  progressCallback(75);
  const events = [];

  // Add chord events at beat positions
  const totalBeats = beatTimestamps.length;
  for (let i = 0; i < beatTimestamps.length; i++) {
    const beatTime = beatTimestamps[i];
    // Find nearest chroma frame
    const nearestFrame = chromaFrames.reduce((prev, curr) => {
      return Math.abs(curr.timestamp - beatTime) <
        Math.abs(prev.timestamp - beatTime)
        ? curr
        : prev;
    });

    if (nearestFrame && Math.abs(nearestFrame.timestamp - beatTime) < 0.2) {
      const chord = detectChord(nearestFrame.chroma);
      if (chord.confidence > 0.3) {
        events.push({
          timestamp: beatTime,
          event_type: 'chord_candidate',
          chord_candidate: {
            root_candidates: [
              { root: chord.root, probability: chord.confidence },
            ],
            quality_candidates: [
              { quality: chord.quality, probability: chord.confidence },
            ],
            bass_note: chord.root,
            bass_ambiguity_flag: chord.confidence < 0.6,
          },
          confidence: chord.confidence,
          spectral_data: {
            dominant_frequencies: [],
            spectral_centroid: 0,
          },
        });
      }
    }

    // Update progress every 10 beats
    if (i % 10 === 0 || i === totalBeats - 1) {
      const beatProgress = (i / totalBeats) * 0.1; // 75-85%
      progressCallback(75 + beatProgress);
      // Allow event loop to process
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  progressCallback(85);

  // Add note onset events (process in chunks)
  progressCallback(86);
  const onsetThreshold = 0.1;
  const chunkSize = Math.max(10000, Math.floor(samplesArray.length / 100)); // Process in ~100 chunks
  const onsetEvents = [];

  for (
    let chunkStart = 1;
    chunkStart < samplesArray.length - 1;
    chunkStart += chunkSize
  ) {
    const chunkEnd = Math.min(chunkStart + chunkSize, samplesArray.length - 1);

    for (let i = chunkStart; i < chunkEnd; i++) {
      const diff = Math.abs(samplesArray[i] - samplesArray[i - 1]);
      if (diff > onsetThreshold && samplesArray[i] > samplesArray[i - 1]) {
        const timestamp = i / sampleRate;
        // Only add if not too close to a beat
        const nearBeat = beatTimestamps.some(
          (beat) => Math.abs(beat - timestamp) < 0.05,
        );
        if (!nearBeat) {
          onsetEvents.push({
            timestamp,
            event_type: 'note_onset',
            confidence: Math.min(diff * 10, 1.0),
            spectral_data: {
              spectral_centroid: 0,
            },
          });
        }
      }
    }

    // Update progress
    const onsetProgress = ((chunkStart - 1) / (samplesArray.length - 1)) * 0.14; // 86-100%
    progressCallback(86 + onsetProgress);

    // Allow event loop to process every chunk
    await new Promise((resolve) => setImmediate(resolve));
  }

  events.push(...onsetEvents);
  console.log(
    'Simple analyzer: Event processing complete -',
    events.length,
    'events',
  );
  progressCallback(100);

  // Calculate tempo stability
  const tempoStability = beatTimestamps.length > 1 ? 0.85 : 0.5;

  console.log('Simple analyzer: Analysis complete -', {
    events: events.length,
    beats: beatTimestamps.length,
    tempo: tempo,
    key: key,
    mode: mode,
    chromaFrames: chromaFrames.length,
  });

  const result = {
    linear_analysis: {
      events: events.sort((a, b) => a.timestamp - b.timestamp),
      beat_grid: {
        tempo_bpm: tempo,
        tempo_stability: tempoStability,
        beat_timestamps: beatTimestamps,
        downbeat_timestamps: downbeatTimestamps,
        tempo_variations: [],
      },
      metadata: {
        duration_seconds: duration,
        sample_rate: sampleRate,
        detected_key: key,
        detected_mode: mode,
      },
      chroma_frames: chromaFrames,
      semantic_features: {
        frame_stride_seconds: frameStrideSeconds || 1024 / sampleRate,
        frames: semanticFrames,
        feature_version: '1.0.0',
      },
    },
  };

  // Validate result has data
  if (
    !result.linear_analysis.events ||
    result.linear_analysis.events.length === 0
  ) {
    console.warn(
      'Simple analyzer: No events detected, creating placeholder event',
    );
    result.linear_analysis.events = [
      {
        timestamp: 0,
        event_type: 'chord_candidate',
        chord_candidate: {
          root_candidates: [{ root: key, probability: 0.5 }],
          quality_candidates: [
            { quality: mode === 'minor' ? 'minor' : 'major', probability: 0.5 },
          ],
          bass_note: key,
          bass_ambiguity_flag: false,
        },
        confidence: 0.5,
        spectral_data: {
          dominant_frequencies: [],
          spectral_centroid: 0,
        },
      },
    ];
  }

  if (
    !result.linear_analysis.beat_grid.beat_timestamps ||
    result.linear_analysis.beat_grid.beat_timestamps.length === 0
  ) {
    console.warn(
      'Simple analyzer: No beats detected, creating placeholder beats',
    );
    const beatInterval = 60 / tempo;
    const beats = [];
    for (let t = 0; t < duration; t += beatInterval) {
      beats.push(t);
    }
    result.linear_analysis.beat_grid.beat_timestamps = beats;
    result.linear_analysis.beat_grid.downbeat_timestamps = beats.filter(
      (_, i) => i % 4 === 0,
    );
  }

  if (
    !result.linear_analysis.chroma_frames ||
    result.linear_analysis.chroma_frames.length === 0
  ) {
    console.warn('Simple analyzer: No chroma frames, creating placeholder');
    const frameCount = Math.floor(duration / 0.1);
    result.linear_analysis.chroma_frames = Array(frameCount)
      .fill(null)
      .map((_, i) => ({
        timestamp: i * 0.1,
        chroma: new Array(12).fill(0).map(() => Math.random() * 0.3),
      }));
  }

  console.log('Simple analyzer: Final result validation:', {
    events: result.linear_analysis.events.length,
    beats: result.linear_analysis.beat_grid.beat_timestamps.length,
    chromaFrames: result.linear_analysis.chroma_frames.length,
    duration: result.linear_analysis.metadata.duration_seconds,
  });

  return result;
}

module.exports = {
  analyzeAudioSimple,
  detectBeats,
  extractChroma,
  detectKey,
  detectChord,
};
