/**
 * Shared helpers for semantic audio features and section analysis
 */

function calculateRMS(frame = []) {
  if (!frame.length) return 0;
  const sumSquares = frame.reduce((acc, sample) => acc + sample * sample, 0);
  return Math.sqrt(sumSquares / frame.length);
}

function calculateChromaFlux(current, previous) {
  if (!previous || !current || previous.length !== current.length) return 0;
  let sum = 0;
  for (let i = 0; i < current.length; i++) {
    const diff = current[i] - previous[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum / current.length);
}

function calculateChromaEntropy(chromaVector = []) {
  const total = chromaVector.reduce((acc, val) => acc + Math.max(val, 0), 0) || 1;
  return chromaVector
    .map((val) => {
      const p = Math.max(val, 0) / total;
      return p > 0 ? -p * Math.log(p) : 0;
    })
    .reduce((acc, val) => acc + val, 0);
}

function detectVocalPresence(rms, spectralFlux, chromaEntropy) {
  const rmsThreshold = 0.01;
  const entropyThreshold = 1.2;
  const fluxUpperBound = 1.5;

  if (rms < rmsThreshold) {
    return false;
  }

  if (chromaEntropy < entropyThreshold) {
    return false;
  }

  return spectralFlux < fluxUpperBound;
}

function summarizeFrames(frames = []) {
  if (!frames.length) {
    return {
      avg_rms: 0,
      max_rms: 0,
      spectral_flux_mean: 0,
      spectral_flux_trend: 0,
      chroma_entropy_mean: 0,
      vocal_ratio: 0,
      has_vocals: false,
      energy_slope: 0,
    };
  }

  const avg_rms = frames.reduce((sum, f) => sum + (f.rms || 0), 0) / frames.length;
  const max_rms = Math.max(...frames.map((f) => f.rms || 0));
  const spectral_flux_mean =
    frames.reduce((sum, f) => sum + (f.spectral_flux || 0), 0) / frames.length;
  const chroma_entropy_mean =
    frames.reduce((sum, f) => sum + (f.chroma_entropy || 0), 0) / frames.length;
  const vocal_frames = frames.filter((f) => f.has_vocals).length;
  const vocal_ratio = frames.length ? vocal_frames / frames.length : 0;
  const has_vocals = vocal_ratio > 0.35;
  const firstRms = frames[0]?.rms || 0;
  const lastRms = frames[frames.length - 1]?.rms || 0;
  const energy_slope = lastRms - firstRms;
  const firstFlux = frames[0]?.spectral_flux || 0;
  const lastFlux = frames[frames.length - 1]?.spectral_flux || 0;
  const spectral_flux_trend = lastFlux - firstFlux;

  return {
    avg_rms,
    max_rms,
    spectral_flux_mean,
    spectral_flux_trend,
    chroma_entropy_mean,
    vocal_ratio,
    has_vocals,
    energy_slope,
  };
}

module.exports = {
  calculateRMS,
  calculateChromaFlux,
  calculateChromaEntropy,
  detectVocalPresence,
  summarizeFrames,
};

