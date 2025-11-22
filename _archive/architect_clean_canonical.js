const theory = require('./theoryRules');
/**
 * Pass 2: The Architect (Structure Detection) - CANONICAL V2 (MFCC REFINEMENT)
 * * Features:
 * 1. Multi-Signal Fusion (Chroma + MFCC + RMS + Flux).
 * 2. Adaptive Thresholding (MAD).
 * 3. NEW: MFCC Second-Pass Refinement (Fixes under-segmentation).
 */

const { summarizeFrames } = require('./semanticUtils');
const fs = require('fs');
const path = require('path');

// --- TUNING CONSTANTS ---
const FRAME_HOP_SECONDS = 0.1;
const MIN_SECTION_SECONDS = 1.5; // Low to catch fast transitions
const MIN_SECTION_FRAMES = Math.round(MIN_SECTION_SECONDS / FRAME_HOP_SECONDS);
// Kernel size: higher -> slower transitions, lower -> faster
const NOVELTY_KERNEL_SIZE = 9;
// Force over-segmentation and disable min-length gating when true (debug)
const FORCE_OVER_SEG = false;
const FORCE_OVER_SEG_THRESHOLD = 0.01;

// Weights
const W_CHROMA = 0.3;
const W_MFCC = 0.2;
const W_RMS = 0.3;
const W_FLUX = 0.2;

function loadConfig() {
  try {
    const configPaths = [
      path.resolve(__dirname, 'audioAnalyzerConfig.json'),
      path.resolve(__dirname, '../../audioAnalyzerConfig.json'),
    ];
    for (const p of configPaths) {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    }
  } catch (e) {
    /* ignore */
  }
  return {};
}

// --- CORE ALGORITHMS ---

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    na += vecA[i] * vecA[i];
    nb += vecB[i] * vecB[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function downsampleFrames(frames, factor = 4) {
  if (!frames || !frames.length || !factor || factor <= 1) return frames;
  const out = [];
  for (let i = 0; i < frames.length; i += factor) out.push(frames[i]);
  return out;
}

function buildSimilarityMatrix(chroma, mfcc, rms, flux) {
  const n = chroma.length;
  const data = new Float32Array(n * n);
  const step = n > 4000 ? 2 : 1;

  for (let i = 0; i < n; i += step) {
    for (let j = 0; j < n; j += step) {
      const sChroma = cosineSimilarity(chroma[i] || [], chroma[j] || []);
      const sMfcc =
        mfcc && mfcc[i] ? cosineSimilarity(mfcc[i], mfcc[j]) : sChroma;
      const vRms =
        rms && rms[i] !== undefined ? 1.0 - Math.abs(rms[i] - rms[j]) : 1.0;
      const vFlux =
        flux && flux[i] !== undefined ? 1.0 - Math.abs(flux[i] - flux[j]) : 1.0;

      const val =
        sChroma * W_CHROMA + sMfcc * W_MFCC + vRms * W_RMS + vFlux * W_FLUX;
      data[i * n + j] = Math.max(0, Math.min(1, val));

      if (step > 1) {
        if (i + 1 < n) data[(i + 1) * n + j] = val;
        if (j + 1 < n) data[i * n + (j + 1)] = val;
      }
    }
  }
  return { data, size: n };
}

// --- MFCC SPECIFIC TOOLS ---

function computeMFCCNovelty(mfcc) {
  const n = mfcc.length;
  if (!n) return new Float32Array(0);
  const curve = new Float32Array(n);

  // Calculate cosine distance between adjacent frames (Flux)
  for (let i = 1; i < n; i++) {
    const sim = cosineSimilarity(mfcc[i], mfcc[i - 1]);
    curve[i] = 1.0 - sim;
  }

  // Smooth it
  return smoothSeries(curve, 6);
}

function refineWithTimbre(boundaries, mfcc, n, opts = {}) {
  if (!mfcc || !mfcc.length) return boundaries;

  const mfccCurve = computeMFCCNovelty(mfcc);
  const newBoundaries = new Set(boundaries);

  // Sort boundaries to iterate segments
  let sorted = Array.from(newBoundaries).sort((a, b) => a - b);

  // Find global max for scaling
  let globalMax = 0;
  for (let v of mfccCurve) if (v > globalMax) globalMax = v;

  const sensitivityFactor = opts.mfccSensitivity || 0.2;
  const absoluteFloor = opts.mfccFloor || 0.08;

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const duration = end - start;

    // Only check segments that are suspiciously long (> 2s) — more sensitive
    if (duration > 2.0 / FRAME_HOP_SECONDS) {
      // Look for peak inside this segment
      let localMaxVal = -1;
      let localMaxIdx = -1;

      for (
        let k = start + MIN_SECTION_FRAMES;
        k < end - MIN_SECTION_FRAMES;
        k++
      ) {
        if (mfccCurve[k] > localMaxVal) {
          localMaxVal = mfccCurve[k];
          localMaxIdx = k;
        }
      }

      // HEURISTIC: Split if the local peak is significant
      // 1. Must be > 25% of the segment's local max (Valley finding)
      // 2. Must be > 15% of global max (Noise floor)
      // 3. OVERRIDE: If > 40% global max, split even if close

      if (localMaxIdx !== -1) {
        const isSignificant = localMaxVal > globalMax * sensitivityFactor;
        const isSharp = localMaxVal > absoluteFloor; // Absolute floor

        if (isSignificant && isSharp) {
          console.log(
            `Architect: MFCC Split inserted at ${localMaxIdx} (Score: ${localMaxVal.toFixed(2)})`,
          );
          console.log(
            `Architect: MFCC Refinement -> Split at ${localMaxIdx} (Score: ${localMaxVal.toFixed(3)})`,
          );
          newBoundaries.add(localMaxIdx);
        }
      }
    }
  }

  return Array.from(newBoundaries).sort((a, b) => a - b);
}

// --- MAIN DETECTION ---

function computeAdaptiveThreshold(noveltyCurve, sensitivity) {
  const sorted = Array.from(noveltyCurve)
    .slice()
    .sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const deviations = sorted.map((v) => Math.abs(v - median));
  deviations.sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 0;
  return median + sensitivity * mad;
}

function avgVectorForSection(frames, startFrame, endFrame) {
  if (!frames || !frames.length) return null;
  const count = Math.max(0, endFrame - startFrame + 1);
  if (count <= 0) return null;
  const len = frames[0]?.length || 0;
  const acc = new Array(len).fill(0);
  let n = 0;
  for (let f = startFrame; f <= endFrame && f < frames.length; f++) {
    const vec = frames[f];
    if (!vec) continue;
    for (let i = 0; i < len; i++) acc[i] += vec[i] || 0;
    n++;
  }
  if (n === 0) return null;
  for (let i = 0; i < len; i++) acc[i] /= n;
  return acc;
}

// cosineSimilarity already defined earlier in this file; reuse it.

function mergeTwoSections(a, b) {
  const merged = {
    ...a,
    start_frame: Math.min(a.start_frame, b.start_frame),
    end_frame: Math.max(a.end_frame, b.end_frame),
    section_id: a.section_id || `${a.start_frame}-${b.end_frame}`,
    section_label: a.section_label || b.section_label || 'merged',
  };
  return merged;
}

function mergeSimilarSections(sections, linear, opts = {}) {
  // options: threshold (chroma sim), minSectionDurationSec, useMfccForShort
  // Advanced merge options
  const microSegmentSec = opts.microSegmentSec || 4;
  const smallSec = opts.minSectionDurationSec || opts.smallSec || 8; // medium/short threshold
  const longSec = opts.longSec || 30; // > 30s considered long
  const shortChromaThreshold =
    opts.mergeChromaThreshold || opts.shortChromaThreshold || 0.85;
  const exactChromaThreshold = opts.exactChromaThreshold || 0.95;
  const exactMfccThreshold = opts.exactMfccThreshold || 0.7;
  const longChromaRequired = opts.longChromaRequired || 0.98;
  const longMfccRequired = opts.longMfccRequired || 0.9;
  const minSectionsStop = opts.minSectionsStop || 8;

  const chromaFrames = linear.chroma_frames?.map((f) => f.chroma || []) || [];
  const mfccFrames = linear.mfcc_frames?.map((f) => f.mfcc || []) || [];
  const hardBoundaries = opts.hardBoundaries || new Set();

  // PASS 1: Aggressive micro-segment cleaning (merge fragments < microSegmentSec)
  const microFrames = Math.round(microSegmentSec / FRAME_HOP_SECONDS);
  let working = sections.slice();
  let changed = true;
  while (changed) {
    changed = false;
    const newWorking = [];
    let i = 0;
    while (i < working.length) {
      const cur = working[i];
      const next = working[i + 1];
      const curDurFrames = cur.end_frame - cur.start_frame;
      if (curDurFrames <= microFrames) {
        // micro-segment: merge with most similar MFCC neighbor (or right if none)
        const left = i - 1 >= 0 ? working[i - 1] : null;
        const right = next || null;
        let mergedIntoLeft = false;
        if (left) {
          const leftMfcc = avgVectorForSection(
            mfccFrames,
            left.start_frame,
            left.end_frame,
          );
          const curMfcc = avgVectorForSection(
            mfccFrames,
            cur.start_frame,
            cur.end_frame,
          );
          const rightMfcc = right
            ? avgVectorForSection(
                mfccFrames,
                right.start_frame,
                right.end_frame,
              )
            : null;
          const leftSim = leftMfcc ? cosineSimilarity(leftMfcc, curMfcc) : -1;
          const rightSim =
            right && rightMfcc ? cosineSimilarity(rightMfcc, curMfcc) : -1;
          // prefer higher sim, fallback to right if tie or absent
          if (leftSim >= rightSim && leftSim >= 0) {
            // merge left + cur
            if (
              !hardBoundaries ||
              !Array.from(hardBoundaries).some(
                (hb) => hb >= left.end_frame && hb <= cur.start_frame,
              )
            ) {
              const m = mergeTwoSections(left, cur);
              newWorking.pop(); // remove left
              newWorking.push(m);
              changed = true;
              mergedIntoLeft = true;
            }
          }
        }
        if (!mergedIntoLeft) {
          // merge with right if possible
          if (
            right &&
            !(
              hardBoundaries &&
              Array.from(hardBoundaries).some(
                (hb) => hb >= cur.end_frame && hb <= right.start_frame,
              )
            )
          ) {
            const m = mergeTwoSections(cur, right);
            newWorking.push(m);
            i += 2; // skip right
            changed = true;
            continue;
          } else {
            // no merge possible, just keep cur
            newWorking.push(cur);
          }
        }
      } else {
        newWorking.push(cur);
      }
      i++;
    }
    working = newWorking;
  }

  // PASS 2: Conservative semantic merging (repeat until stable)
  // re-use variables declared above

  let passChanged = true;
  while (passChanged && working.length > minSectionsStop) {
    passChanged = false;
    const newWorking = [];
    let i = 0;
    while (i < working.length) {
      if (i === working.length - 1) {
        newWorking.push(working[i]);
        break;
      }
      const cur = working[i];
      const next = working[i + 1];
      const curDur = (cur.end_frame - cur.start_frame) * FRAME_HOP_SECONDS;
      const nextDur = (next.end_frame - next.start_frame) * FRAME_HOP_SECONDS;
      const curChroma = avgVectorForSection(
        chromaFrames,
        cur.start_frame,
        cur.end_frame,
      );
      const nextChroma = avgVectorForSection(
        chromaFrames,
        next.start_frame,
        next.end_frame,
      );
      const curMfcc = avgVectorForSection(
        mfccFrames,
        cur.start_frame,
        cur.end_frame,
      );
      const nextMfcc = avgVectorForSection(
        mfccFrames,
        next.start_frame,
        next.end_frame,
      );
      const chromaSim = cosineSimilarity(curChroma, nextChroma);
      const mfccSim = cosineSimilarity(curMfcc, nextMfcc);

      // respect hard boundaries
      if (
        hardBoundaries &&
        Array.from(hardBoundaries).some(
          (hb) => hb >= cur.end_frame && hb <= next.start_frame,
        )
      ) {
        newWorking.push(cur);
        i++;
        continue;
      }

      const eitherLong = curDur > longSec || nextDur > longSec;
      const bothMedium = curDur > smallSec && nextDur > smallSec;
      const isShort = curDur < smallSec || nextDur < smallSec;

      // rule: if either long and not near-perfect similarity, skip
      if (eitherLong) {
        if (chromaSim > longChromaRequired && mfccSim > longMfccRequired) {
          const m = mergeTwoSections(cur, next);
          console.log(
            `Architect: mergeSimilarSections LONG-merge at ${cur.start_frame}-${next.end_frame} chroma=${chromaSim.toFixed(3)} mfcc=${mfccSim.toFixed(3)}`,
          );
          newWorking.push(m);
          i += 2; // skip next
          passChanged = true;
          continue;
        }
        newWorking.push(cur);
        i++;
        continue;
      }

      // both medium -> require very high similarity
      if (bothMedium) {
        if (chromaSim > exactChromaThreshold && mfccSim > exactMfccThreshold) {
          const m = mergeTwoSections(cur, next);
          console.log(
            `Architect: mergeSimilarSections MEDIUM-merge at ${cur.start_frame}-${next.end_frame} chroma=${chromaSim.toFixed(3)} mfcc=${mfccSim.toFixed(3)}`,
          );
          newWorking.push(m);
          i += 2; // skip next
          passChanged = true;
          continue;
        }
        newWorking.push(cur);
        i++;
        continue;
      }

      // otherwise, consider merge if identical or short and similar
      const isHarmonicallyIdentical = chromaSim > exactChromaThreshold;
      const isTimbrallySimilar = mfccSim > exactMfccThreshold;
      if (
        isHarmonicallyIdentical ||
        (isShort && chromaSim > shortChromaThreshold && isTimbrallySimilar)
      ) {
        const m = mergeTwoSections(cur, next);
        console.log(
          `Architect: mergeSimilarSections merge at ${cur.start_frame}-${next.end_frame} chroma=${chromaSim.toFixed(3)} mfcc=${mfccSim.toFixed(3)}`,
        );
        newWorking.push(m);
        i += 2; // skip next
        passChanged = true;
        continue;
      }

      newWorking.push(cur);
      i++;
    }
    working = newWorking;
  }
  return working;
}

function smoothSeries(series = [], windowSize = 5) {
  if (!series || !series.length) return series;
  if (windowSize <= 1) return series;
  const half = Math.floor(windowSize / 2);
  return series.map((value, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -half; offset <= half; offset++) {
      const sampleIndex = index + offset;
      if (sampleIndex >= 0 && sampleIndex < series.length) {
        sum += series[sampleIndex];
        count++;
      }
    }
    return count > 0 ? sum / count : value;
  });
}

// Levenshtein distance for array of tokens
function levenshteinDistanceSeq(a = [], b = []) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

function calculateProgressionSimilarity(seqA = [], seqB = []) {
  const a = seqA || [];
  const b = seqB || [];
  if (!a.length || !b.length) return 0;
  const dist = levenshteinDistanceSeq(a, b);
  const maxLen = Math.max(a.length, b.length);
  const normalized = 1 - dist / maxLen; // 0..1
  if (normalized < 0) return 0;
  return normalized;
}

// Map chord root string (C, C#, D, ...) to pitch class 0-11
function rootToPc(root) {
  if (!root) return null;
  const map = {
    C: 0,
    'C#': 1,
    DB: 1,
    D: 2,
    'D#': 3,
    EB: 3,
    E: 4,
    F: 5,
    'F#': 6,
    GB: 6,
    G: 7,
    'G#': 8,
    AB: 8,
    A: 9,
    'A#': 10,
    BB: 10,
    B: 11,
    H: 11,
    N: null,
  };
  const k = String(root)
    .toUpperCase()
    .replace(/[^A-G#B]/g, '');
  return map[k] !== undefined ? map[k] : null;
}

function rotatePitchClassSeq(seq, offset) {
  if (!seq || !seq.length) return [];
  return seq.map((v) => (v === null ? null : (v + offset + 12) % 12));
}

function sequenceToPcArray(seq) {
  return (seq || []).map((r) => rootToPc(r ?? 'N'));
}

function rotationNormalizedSimilarity(
  seqA = [],
  seqB = [],
  ignoreNulls = true,
) {
  const a = sequenceToPcArray(seqA);
  const b = sequenceToPcArray(seqB);
  if (!a.length || !b.length) return 0;
  let best = 0;
  for (let rot = 0; rot < 12; rot++) {
    const bRot = rotatePitchClassSeq(b, rot);
    // compute Levenshtein on tokens, turning null into 'N'
    const aTokens = a.map((v) => (v === null ? 'N' : String(v)));
    const bTokens = bRot.map((v) => (v === null ? 'N' : String(v)));
    const dist = levenshteinDistanceSeq(aTokens, bTokens);
    const norm = 1 - dist / Math.max(aTokens.length, bTokens.length);
    if (norm > best) best = norm;
  }
  return best;
}

function slidingWindowNormalizedSimilarity(seqA = [], seqB = [], opts = {}) {
  // Try sliding the shorter across the longer and compute max normalized similarity
  const a = (seqA || []).map((s) => String(s || 'N'));
  const b = (seqB || []).map((s) => String(s || 'N'));
  if (!a.length || !b.length) return 0;
  let shorter = a;
  let longer = b;
  if (a.length > b.length) {
    shorter = b;
    longer = a;
  }
  let best = 0;
  for (let i = 0; i <= longer.length - shorter.length; i++) {
    const slice = longer.slice(i, i + shorter.length);
    const dist = levenshteinDistanceSeq(shorter, slice);
    const norm = 1 - dist / Math.max(shorter.length, slice.length);
    if (norm > best) best = norm;
  }
  // Also try rotation-tolerant approach on pitch classes
  const rotBest = rotationNormalizedSimilarity(seqA, seqB);
  return Math.max(best, rotBest);
}

function calculateProgressionSimilarityAdvanced(
  seqA = [],
  seqB = [],
  opts = {},
) {
  const mode = opts.progressionSimilarityMode || 'rotationSliding';
  if (mode === 'normalized') return calculateProgressionSimilarity(seqA, seqB);
  if (mode === 'rotationOnly') return rotationNormalizedSimilarity(seqA, seqB);
  // default: rotationSliding tries sliding window and rotation
  const s1 = rotationNormalizedSimilarity(seqA, seqB);
  const s2 = slidingWindowNormalizedSimilarity(seqA, seqB, opts);
  return Math.max(s1, s2);
}

function applyMedianFilter(series = [], windowSize = 5) {
  if (!series || !series.length) return series;
  if (windowSize <= 1) return series;
  const half = Math.floor(windowSize / 2);
  return series.map((value, index) => {
    const window = [];
    for (let offset = -half; offset <= half; offset++) {
      const sampleIndex = index + offset;
      if (sampleIndex >= 0 && sampleIndex < series.length) {
        window.push(series[sampleIndex]);
      }
    }
    if (window.length === 0) return value;
    window.sort((a, b) => a - b);
    const mid = Math.floor(window.length / 2);
    return window.length % 2 === 0
      ? (window[mid - 1] + window[mid]) / 2
      : window[mid];
  });
}

function labelSections(sections, clusters) {
  if (!sections || !sections.length) return sections;
  sections[0].section_label = 'intro';
  sections[0].section_variant = 1;
  const stats = [];
  clusters.forEach((indices, id) => {
    const starts = indices.map((i) => sections[i].start_frame);
    const totalLength = indices.reduce((acc, i) => acc + sections[i].length, 0);
    stats.push({
      id,
      indices,
      count: indices.length,
      totalLength,
      firstStart: Math.min(...starts),
    });
  });
  const sorted = stats.sort((a, b) => b.totalLength - a.totalLength);
  const primary = sorted[0];
  if (primary) {
    primary.indices.forEach((idx, i) => {
      if (sections[idx].section_label !== 'intro') {
        sections[idx].section_label = 'chorus';
        sections[idx].section_variant = i + 1;
      }
    });
  }
  const remaining = sorted.filter((s) => s.id !== primary?.id);
  if (remaining.length > 0) {
    remaining.sort((a, b) => a.firstStart - b.firstStart);
    remaining[0].indices.forEach((idx, i) => {
      if (!sections[idx].section_label) {
        sections[idx].section_label = 'verse';
        sections[idx].section_variant = i + 1;
      }
    });
  }
  sections.forEach((section, idx) => {
    if (!section.section_label) {
      if (idx === sections.length - 1) section.section_label = 'outro';
      else if (section.length < sections[0].length * 0.6)
        section.section_label = 'bridge';
      else section.section_label = 'verse';
      section.section_variant = 1;
    }
    const L = section.section_label.toUpperCase().charAt(0);
    section.section_id = `SECTION_${L}${section.section_variant || idx + 1}`;
  });
  return sections;
}

function computeDurationBars(section, linear) {
  const tempo = linear?.beat_grid?.tempo_bpm || 120;
  const dur = (section.end_frame - section.start_frame) * FRAME_HOP_SECONDS;
  return dur / ((60 / tempo) * 4);
}

function attachSemanticSignatures(sections, clusters, linear) {
  const frames = linear?.semantic_features?.frames || [];
  const counts = new Map();
  clusters.forEach((idxs, id) => counts.set(id, idxs.length));
  return sections.map((s) => {
    const start = s.start_frame * FRAME_HOP_SECONDS;
    const end = s.end_frame * FRAME_HOP_SECONDS;
    const slice = frames.filter(
      (f) => f.timestamp >= start && f.timestamp < end,
    );
    const summary = summarizeFrames(slice || []);
    return {
      ...s,
      semantic_signature: {
        duration_seconds: end - start,
        repetition_score: Math.min(
          1,
          (counts.get(s.cluster_id) || 1) / Math.max(1, sections.length),
        ),
        avg_rms: summary.avg_rms || 0,
        max_rms: summary.max_rms || 0,
        has_vocals: summary.has_vocals || false,
      },
    };
  });
}

function mergeSemanticSignatures(a = {}, b = {}) {
  const durA = a.duration_seconds || 0,
    durB = b.duration_seconds || 0,
    total = durA + durB || 1;
  const w = (k) => ((a[k] || 0) * durA + (b[k] || 0) * durB) / total;
  return {
    repetition_score: Math.max(
      a.repetition_score || 0,
      b.repetition_score || 0,
    ),
    repetition_count: (a.repetition_count || 0) + (b.repetition_count || 0),
    avg_rms: w('avg_rms'),
    max_rms: Math.max(a.max_rms || 0, b.max_rms || 0),
    has_vocals: w('has_vocals') > 0.5,
    duration_seconds: total,
  };
}

function extractChromaFromEvents(events) {
  if (!events || !events.length) return [];
  return Array(100)
    .fill(0)
    .map(() =>
      Array(12)
        .fill(0)
        .map(() => Math.random()),
    );
}

function shouldMergeSections(a, b, forceOverSeg = false) {
  if (forceOverSeg || FORCE_OVER_SEG) return false;
  if (!a || !b) return false;
  const aDur = (a.end_frame - a.start_frame) * FRAME_HOP_SECONDS;
  const bDur = (b.end_frame - b.start_frame) * FRAME_HOP_SECONDS;
  const short = FORCE_OVER_SEG
    ? false
    : aDur < MIN_SECTION_SECONDS || bDur < MIN_SECTION_SECONDS;
  const sameLabel =
    a.section_label && b.section_label && a.section_label === b.section_label;
  const gap = (b.start_frame - a.end_frame) * FRAME_HOP_SECONDS;
  return short || sameLabel || gap < 2;
}

function snapBoundariesToGrid(boundaries, linear) {
  if (!linear?.beat_grid?.beat_timestamps) return boundaries;
  const beats = linear.beat_grid.beat_timestamps;
  return boundaries.map((frame) => {
    const t = frame * FRAME_HOP_SECONDS;
    let closest = beats[0],
      best = Math.abs(beats[0] - t);
    for (const b of beats) {
      const d = Math.abs(b - t);
      if (d < best) {
        best = d;
        closest = b;
      }
    }
    return Math.round(closest / FRAME_HOP_SECONDS);
  });
}

// Merge sections while respecting hard boundaries (e.g., MFCC-inserted splits)
// Accept forceOverSeg flag to disable merging during tuning
function mergeSemanticSections(
  sections,
  linear,
  hardBoundaries = new Set(),
  forceOverSeg = false,
) {
  if (!sections || !sections.length) return sections;
  const merged = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!merged.length) {
      merged.push({ ...s });
      continue;
    }
    const last = merged[merged.length - 1];
    if (shouldMergeSections(last, s, forceOverSeg)) {
      // Prevent merging across hard boundaries
      let spansHardBoundary = false;
      for (const hb of hardBoundaries) {
        if (hb >= last.end_frame && hb <= s.start_frame) {
          spansHardBoundary = true;
          break;
        }
      }
      if (spansHardBoundary) {
        const clone = { ...s };
        clone.time_range = {
          start_time: s.start_frame * FRAME_HOP_SECONDS,
          end_time: s.end_frame * FRAME_HOP_SECONDS,
          duration_bars: computeDurationBars(s, linear),
        };
        merged.push(clone);
        continue;
      }
      last.end_frame = s.end_frame;
      last.length = last.end_frame - last.start_frame;
      last.semantic_signature = mergeSemanticSignatures(
        last.semantic_signature || {},
        s.semantic_signature || {},
      );
      last.time_range = {
        start_time: last.start_frame * FRAME_HOP_SECONDS,
        end_time: last.end_frame * FRAME_HOP_SECONDS,
        duration_bars: computeDurationBars(last, linear),
      };
    } else {
      const clone = { ...s };
      clone.time_range = {
        start_time: s.start_frame * FRAME_HOP_SECONDS,
        end_time: s.end_frame * FRAME_HOP_SECONDS,
        duration_bars: computeDurationBars(s, linear),
      };
      merged.push(clone);
    }
  }
  return merged;
}

// Pass 3: Theory Glue - Cadence, Symmetry, Harmonic Rhythm checks
function getChordSequenceForSection(linear, section) {
  const events = linear.events || [];
  const startT = section.start_frame * FRAME_HOP_SECONDS;
  const endT = section.end_frame * FRAME_HOP_SECONDS;
  const chords = [];
  for (const e of events) {
    if (e.event_type !== 'chord_candidate') continue;
    if (e.timestamp < startT || e.timestamp > endT) continue;
    // Simplify: pick highest-prob root and quality
    const rootCand = e.chord_candidate?.root_candidates?.[0];
    const qualCand = e.chord_candidate?.quality_candidates?.[0];
    const chord = {
      root: rootCand?.root || null,
      quality: qualCand?.quality || 'maj',
      chord_tones: e.chord_candidate?.chord_tones || [],
    };
    chords.push(chord);
  }
  return chords;
}

function averageChordRoot(chords) {
  if (!chords || !chords.length) return null;
  const counts = {};
  for (const c of chords) {
    const r = c.root || 'N';
    counts[r] = (counts[r] || 0) + 1;
  }
  let best = null;
  let bestCount = 0;
  for (const k of Object.keys(counts)) {
    if (counts[k] > bestCount) {
      best = k;
      bestCount = counts[k];
    }
  }
  return best;
}

function secondsFromFrames(frames) {
  return frames * FRAME_HOP_SECONDS;
}

function isStandardBarCount(bars) {
  const f = Math.round(bars);
  return f === 4 || f === 8 || f === 16;
}

function applyTheoryGlue(sections, linear, opts = {}) {
  const keyContext = { primary_key: linear.metadata?.detected_key || 'C' };
  const microMergeBar = opts.microMergeBar || 2; // 2 bars default
  const cadentialTolerance = opts.cadentialTolerance || 1; // number of chords at boundary
  const minSectionsStop = opts.minSectionsStop || 8;
  const progressionSimilarityThreshold =
    opts.progressionSimilarityThreshold || 0.75;
  const progressionSimilarityMode =
    opts.progressionSimilarityMode || 'rotationSliding';
  // Build chord sequences for each section
  // seqs not used as working changes

  // Pass A: Cadential check - merge boundaries with no cadence if short/predominant
  let working = sections.slice();
  let changed = true;
  while (changed && working.length > minSectionsStop) {
    changed = false;
    for (let i = 0; i < working.length - 1; i++) {
      const A = working[i];
      const B = working[i + 1];
      const rightSeq = getChordSequenceForSection(linear, B);
      const leftSeq = getChordSequenceForSection(linear, A);
      const lastTwoLeft = leftSeq.slice(-2);
      const firstTwoRight = rightSeq.slice(0, 2);
      const combined = [...lastTwoLeft, ...firstTwoRight].filter(Boolean);
      const cadence = theory.detectCadenceContext(combined, keyContext);
      const aBars = computeDurationBars(A, linear);
      const bBars = computeDurationBars(B, linear);
      const isShort = aBars < 4 || bBars < 4;
      const leftRoots = leftSeq.map((c) => c.root || 'N');
      const rightRoots = rightSeq.map((c) => c.root || 'N');
      const progSim = calculateProgressionSimilarityAdvanced(
        leftRoots,
        rightRoots,
        { progressionSimilarityMode },
      );
      // Prog-sim override: merge if sequences are highly similar
      if (progSim >= progressionSimilarityThreshold) {
        console.log(
          'Architect: TheoryGlue: Prog-sim merge (Pass A) at',
          A.start_frame,
          B.end_frame,
          'sim=',
          progSim.toFixed(3),
        );
        const m = mergeTwoSections(A, B);
        working.splice(i, 2, m);
        changed = true;
        break;
      }
      // If cadence is NONE and one side is short, merge by default
      if (cadence === 'NONE' && isShort) {
        console.log(
          'Architect: TheoryGlue: Cadential merge at',
          A.start_frame,
          B.end_frame,
          'aBars=',
          aBars,
          'bBars=',
          bBars,
        );
        const m = mergeTwoSections(A, B);
        working.splice(i, 2, m);
        changed = true;
        break;
      }
    }
  }

  // Pass B: Symmetry enforcer - join small tags into neighbors to reach typical bars
  changed = true;
  while (changed && working.length > minSectionsStop) {
    changed = false;
    for (let i = 0; i < working.length; i++) {
      const s = working[i];
      const bars = computeDurationBars(s, linear);
      if (bars <= microMergeBar) {
        // prefer merge into neighbor that creates a 4/8/16 bar count
        const left = i - 1 >= 0 ? working[i - 1] : null;
        const right = i + 1 < working.length ? working[i + 1] : null;
        let merged = false;
        if (left) {
          const mergedBars = computeDurationBars(left, linear) + bars;
          if (isStandardBarCount(mergedBars)) {
            console.log(
              'Architect: TheoryGlue: Symmetry merge into LEFT at',
              left.start_frame,
            );
            const m = mergeTwoSections(left, s);
            working.splice(i - 1, 2, m);
            changed = true;
            merged = true;
            break;
          }
        }
        if (!merged && right) {
          const mergedBars = computeDurationBars(right, linear) + bars;
          if (isStandardBarCount(mergedBars)) {
            console.log(
              'Architect: TheoryGlue: Symmetry merge into RIGHT at',
              right.start_frame,
            );
            const m = mergeTwoSections(s, right);
            working.splice(i, 2, m);
            changed = true;
            break;
          }
        }
        // fallback: merge with neighbor that keeps harmonic or progression similarity
        if (!merged) {
          const leftChroma = left
            ? avgVectorForSection(
                linear.chroma_frames?.map((f) => f.chroma || []),
                left.start_frame,
                left.end_frame,
              )
            : null;
          const rightChroma = right
            ? avgVectorForSection(
                linear.chroma_frames?.map((f) => f.chroma || []),
                right.start_frame,
                right.end_frame,
              )
            : null;
          const curChroma = avgVectorForSection(
            linear.chroma_frames?.map((f) => f.chroma || []),
            s.start_frame,
            s.end_frame,
          );
          const leftSim = leftChroma
            ? cosineSimilarity(leftChroma, curChroma)
            : -1;
          const rightSim = rightChroma
            ? cosineSimilarity(rightChroma, curChroma)
            : -1;
          const leftProg = left
            ? calculateProgressionSimilarityAdvanced(
                getChordSequenceForSection(linear, left).map(
                  (c) => c.root || 'N',
                ),
                getChordSequenceForSection(linear, s).map((c) => c.root || 'N'),
                { progressionSimilarityMode },
              )
            : -1;
          const rightProg = right
            ? calculateProgressionSimilarityAdvanced(
                getChordSequenceForSection(linear, right).map(
                  (c) => c.root || 'N',
                ),
                getChordSequenceForSection(linear, s).map((c) => c.root || 'N'),
                { progressionSimilarityMode },
              )
            : -1;
          // prefer progression similarity then chroma
          if (
            leftProg >= rightProg &&
            leftProg >= progressionSimilarityThreshold &&
            left
          ) {
            const m = mergeTwoSections(left, s);
            working.splice(i - 1, 2, m);
            changed = true;
            break;
          } else if (
            rightProg > leftProg &&
            rightProg >= progressionSimilarityThreshold &&
            right
          ) {
            const m = mergeTwoSections(s, right);
            working.splice(i, 2, m);
            changed = true;
            break;
          }
          if (leftSim >= rightSim && left) {
            const m = mergeTwoSections(left, s);
            working.splice(i - 1, 2, m);
            changed = true;
            break;
          } else if (right) {
            const m = mergeTwoSections(s, right);
            working.splice(i, 2, m);
            changed = true;
            break;
          }
        }
      }
    }
  }

  // Pass C: Harmonic Rhythm scan: group repeated progressions under parent
  // This is a soft grouping; keep sections separate but add parent meta optionally
  // For now we will compress trivial repeated progressions into a single combined section if identical across neighbors
  changed = true;
  while (changed && working.length > minSectionsStop) {
    changed = false;
    for (let i = 0; i < working.length - 1; i++) {
      const cur = working[i];
      const next = working[i + 1];
      const curSeq = getChordSequenceForSection(linear, cur).map(
        (c) => c.root || 'N',
      );
      const nextSeq = getChordSequenceForSection(linear, next).map(
        (c) => c.root || 'N',
      );
      if (!curSeq.length || !nextSeq.length) continue;
      // Compare normalized sequences - fuzzy grouping if progression similarity is high
      const progSim = calculateProgressionSimilarityAdvanced(curSeq, nextSeq, {
        progressionSimilarityMode,
      });
      if (progSim > (opts.groupProgressionThreshold || 0.9)) {
        // Merge as an instrumental grouping
        console.log(
          'Architect: TheoryGlue: Harmonic rhythm group at',
          cur.start_frame,
          next.end_frame,
        );
        const m = mergeTwoSections(cur, next);
        m.section_label = (m.section_label || 'instrumental') + '_group';
        working.splice(i, 2, m);
        changed = true;
        break;
      }
    }
  }

  // Optional Pass D: Aggressive progression-based merges (tuneable)
  if (opts.aggressiveProgMerge) {
    const aggressiveThreshold =
      opts.progressionSimilarityThresholdAggressive ||
      Math.max(0.55, progressionSimilarityThreshold - 0.15);
    let dChanged = true;
    while (dChanged && working.length > minSectionsStop) {
      dChanged = false;
      for (let i = 0; i < working.length - 1; i++) {
        const cur = working[i];
        const next = working[i + 1];
        const curSeq = getChordSequenceForSection(linear, cur).map(
          (c) => c.root || 'N',
        );
        const nextSeq = getChordSequenceForSection(linear, next).map(
          (c) => c.root || 'N',
        );
        if (!curSeq.length || !nextSeq.length) continue;
        const progSim = calculateProgressionSimilarityAdvanced(
          curSeq,
          nextSeq,
          { progressionSimilarityMode },
        );
        if (progSim >= aggressiveThreshold) {
          console.log(
            'Architect: TheoryGlue: Aggressive prog-sim merge at',
            cur.start_frame,
            next.end_frame,
            'sim=',
            progSim.toFixed(3),
          );
          const m = mergeTwoSections(cur, next);
          working.splice(i, 2, m);
          dChanged = true;
          break;
        }
      }
    }
  }

  return working;
}

// Note: This aggressive progression-based merge is optional and can be enabled
// with opts.aggressiveProgMerge = true and tuned with
// opts.progressionSimilarityThresholdAggressive

function detectNovelty(matrixObj, opts = {}) {
  const { data, size: n } = matrixObj;
  if (!n) return { boundaries: [0], debug: {} };

  const novelty = new Float32Array(n);
  const kernel = opts.noveltyKernel || NOVELTY_KERNEL_SIZE;
  let maxNovelty = 0;

  for (let i = kernel; i < n - kernel; i++) {
    let score = 0;
    for (let k = 0; k < kernel; k++) {
      for (let m = 0; m < kernel; m++) {
        const pp = data[(i - k) * n + (i - m)] || 0;
        const ff = data[(i + k) * n + (i + m)] || 0;
        const pf = data[(i - k) * n + (i + m)] || 0;
        const fp = data[(i + k) * n + (i - m)] || 0;
        score += pp + ff - (pf + fp);
      }
    }
    const val = score / (kernel * kernel);
    novelty[i] = val;
    if (val > maxNovelty) maxNovelty = val;
  }

  const smoothed = smoothSeries(
    novelty,
    Math.max(3, Math.round(1.5 / FRAME_HOP_SECONDS)),
  );
  const filtered = applyMedianFilter(
    smoothed,
    Math.round(2.0 / FRAME_HOP_SECONDS),
  );

  const sensitivity = opts.sensitivity || 1.2;
  let adaptiveThreshold = computeAdaptiveThreshold(filtered, sensitivity);
  if (FORCE_OVER_SEG)
    adaptiveThreshold = Math.min(adaptiveThreshold, FORCE_OVER_SEG_THRESHOLD);
  adaptiveThreshold = Math.max(adaptiveThreshold, maxNovelty * 0.15);

  function findPeaks(thresh, allowOverride = false) {
    const picks = [0];
    const localThresh =
      opts.forceOverSeg || FORCE_OVER_SEG
        ? Math.min(
            thresh,
            opts.forceThreshold || FORCE_OVER_SEG_THRESHOLD,
            0.05,
          )
        : thresh;
    for (let i = 1; i < filtered.length - 1; i++) {
      if (
        (filtered[i] > localThresh || (FORCE_OVER_SEG && filtered[i] > 0.01)) &&
        filtered[i] > filtered[i - 1] &&
        filtered[i] > filtered[i + 1]
      ) {
        const last = picks[picks.length - 1];
        const dist = i - last;

        // Smart Gating: Allow close peaks if they are HUGE
        const isFar =
          opts.forceOverSeg || FORCE_OVER_SEG
            ? true
            : dist >= MIN_SECTION_FRAMES;
        const isHuge = allowOverride && filtered[i] > thresh * 2 && dist > 10;

        // Log all candidate peaks pre-filtering for debug
        if (filtered[i] > localThresh * 0.25 || filtered[i] > 0.05) {
          console.log(
            `Architect: Candidate split at ${i} (Score: ${filtered[i].toFixed(3)})`,
          );
        }

        if (isFar || isHuge) picks.push(i);
      }
    }
    picks.push(n - 1);
    return picks;
  }

  let boundaries = findPeaks(adaptiveThreshold, true);
  console.log(
    `Architect: Candidate boundaries (pre-snap): ${boundaries.length - 2} + endpoints`,
    boundaries.slice(1, -1),
  );

  // Retry
  if (boundaries.length <= 2) {
    const lowerThresh = computeAdaptiveThreshold(filtered, 0.8);
    console.log(
      `Architect: Under-segmented. Retry K=0.8 (Thresh: ${lowerThresh.toFixed(3)})`,
    );
    boundaries = findPeaks(lowerThresh, true);
  }

  // FORCE_OVER_SEG: If in force mode and current picks are fewer than desired, hallucinate uniform picks to over-segment
  if (opts.forceOverSeg || FORCE_OVER_SEG) {
    const desired = opts.forceDesired || 40;
    if (boundaries.length - 2 < desired) {
      const spacing = Math.max(1, Math.round(n / desired));
      const picks = [0];
      for (let i = spacing; i < n - 1; i += spacing) picks.push(i);
      picks.push(n - 1);
      boundaries = picks;
      console.log(
        `Architect: FORCE_OVER_SEG created ${boundaries.length - 2} uniform picks (${spacing} frame spacing)`,
      );
    }
  }

  if (!(opts.forceOverSeg || FORCE_OVER_SEG) && boundaries.length > 30) {
    console.log('Architect: Over-segmented. Raising K=3.0');
    boundaries = findPeaks(computeAdaptiveThreshold(filtered, 3.0), false);
  }

  return {
    boundaries,
    debug: {
      noveltyCurve: Array.from(filtered),
      threshold: adaptiveThreshold,
      maxNovelty,
    },
  };
}

// CLUSTER/LABEL/MERGE - Keep previous implementations (unchanged)
function clusterSections(
  matrixObj,
  boundaries,
  hardBoundaries = new Set(),
  forceOverSeg = false,
  similarityThreshold = 0.6,
) {
  const { data, size: n } = matrixObj;
  const sections = [];
  const clusters = new Map();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (!forceOverSeg && end - start < 5) continue;
    sections.push({
      start_frame: start,
      end_frame: end,
      length: end - start,
      cluster_id: null,
    });
  }
  // const similarityThreshold = 0.6; // overridden by parameter
  let clusterId = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;
    sections[i].cluster_id = clusterId;
    clusters.set(clusterId, [i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;
      let sum = 0,
        count = 0;
      const step = 4;
      for (
        let y = sections[i].start_frame;
        y < sections[i].end_frame;
        y += step
      ) {
        for (
          let x = sections[j].start_frame;
          x < sections[j].end_frame;
          x += step
        ) {
          sum += data[y * n + x] || 0;
          count++;
        }
      }
      const avg = count ? sum / count : 0;
      // Respect hard boundaries: Do not allow sections that span a hard boundary to be merged
      const minFrame = Math.min(
        sections[i].start_frame,
        sections[j].start_frame,
      );
      const maxFrame = Math.max(sections[i].end_frame, sections[j].end_frame);
      let spansHardBoundary = false;
      for (const hb of hardBoundaries) {
        if (hb > minFrame && hb < maxFrame) {
          spansHardBoundary = true;
          break;
        }
      }
      if (spansHardBoundary) continue;

      if (avg > similarityThreshold) {
        sections[j].cluster_id = clusterId;
        clusters.get(clusterId).push(j);
      }
    }
    clusterId++;
  }
  return { sections, clusters };
}
async function analyzeStructure(
  linear,
  progressCallback = () => {},
  opts = {},
) {
  progressCallback(10);
  await new Promise((r) => setTimeout(r, 0));

  // Extract features from linear analysis (original resolution)
  const chromaRaw =
    linear.chroma_frames?.map((f) => f.chroma || []) ||
    extractChromaFromEvents(linear.events || []);
  const mfccRaw = linear.mfcc_frames?.map((f) => f.mfcc || []) || null;
  const rmsRaw = linear.chroma_frames?.map((f) => f.rms || 0) || [];
  const fluxRaw = linear.chroma_frames?.map((f) => f.flux || 0) || [];

  // Helper: compute beat-synchronous chroma (averaged within beat stable window)
  function computeBeatSynchronousChroma(linearAnalysis) {
    const beats = linearAnalysis.beat_grid?.beat_timestamps || [];
    const frameHopSeconds =
      linearAnalysis.metadata?.frame_hop_seconds || linearAnalysis.metadata?.hop_length / linearAnalysis.metadata?.sample_rate || 0.0232;
    const chromaFramesLocal = linearAnalysis.chroma_frames?.map((f) => f.chroma || []) || [];
    const beatChroma = [];
    const frameIndexForTime = (t) => Math.round(t / frameHopSeconds);
    for (let i = 0; i < beats.length; i++) {
      const beatStart = beats[i];
      const beatEnd = i + 1 < beats.length ? beats[i + 1] : beatStart + 0.5;
      const duration = Math.max(0.001, beatEnd - beatStart);
      const stableStart = beatStart + duration * 0.2;
      const stableEnd = beatEnd - duration * 0.2;
      const startFrame = frameIndexForTime(stableStart);
      const endFrame = frameIndexForTime(stableEnd);
      const avg = new Array(12).fill(0);
      let count = 0;
      for (let f = startFrame; f <= endFrame && f < chromaFramesLocal.length; f++) {
        const vec = chromaFramesLocal[f] || [];
        for (let k = 0; k < 12; k++) avg[k] += vec[k] || 0;
        count++;
      }
      if (count === 0) {
        beatChroma.push(new Array(12).fill(0));
      } else {
        for (let k = 0; k < 12; k++) avg[k] /= count;
        beatChroma.push(avg);
      }
    }
    return beatChroma;
  }

  // Downsample heavy signals for similarity matrix calculation to avoid OOM
  const dsFactor = Math.max(1, opts.downsampleFactor || 4);
  console.log(`Architect: using downsampleFactor=${dsFactor}`);
  // Use beat-synchronous chroma for the recurrence/novelty analysis (smaller matrix)
  const beatChromaRaw = computeBeatSynchronousChroma(linear);
  const chroma = dsFactor > 1 ? downsampleFrames(beatChromaRaw, dsFactor) : beatChromaRaw;
  const mfcc = mfccRaw && dsFactor > 1 ? downsampleFrames(mfccRaw, dsFactor) : mfccRaw;
  const rms = dsFactor > 1 ? downsampleFrames(rmsRaw, dsFactor) : rmsRaw;
  const flux = dsFactor > 1 ? downsampleFrames(fluxRaw, dsFactor) : fluxRaw;

  console.log(
    `Architect: Extracted frames chroma=${chroma.length} mfcc=${mfcc?.length || 0}`,
  );
  progressCallback(30);

  // Build similarity matrix with combined signals
  const matrixObj = buildSimilarityMatrix(chroma, mfcc, rms, flux);

  progressCallback(50);

  // Primary detection using checkerboard novelty
  // Run novelty on downsampled matrix and then map picks back to original frame indices
  const noveltyResult = detectNovelty(matrixObj, opts);
  const boundariesDs = noveltyResult.boundaries;
  let boundaries = boundariesDs.map((b) => Math.min(Math.round(b * dsFactor), chromaRaw.length - 1));

  // MFCC refinement pass: add timbre-based splits inside long sections
  let hardBoundarySet = new Set();
  const treatMfccAsHard =
    opts.mfccHardBoundaries === undefined ? true : !!opts.mfccHardBoundaries;
  // Use original MFCC frames for refinement to keep precision
  if (mfccRaw && mfccRaw.length) {
    console.log('Architect: Running MFCC Refinement Pass...');
    const beforeBoundaries = Array.from(boundaries);
    boundaries = refineWithTimbre(boundaries, mfccRaw, matrixObj.size, opts || {});
    // Compute inserted boundaries by MFCC refine
    const inserted = boundaries.filter((b) => !beforeBoundaries.includes(b));
    // We'll map inserted boundaries to snapped positions later
    hardBoundarySet = treatMfccAsHard ? new Set(inserted) : new Set();
  }

  // Snap to grid (beats) if available
  // Snap to beats if available unless forcing over-seg (preserve artificial picks)
  let snapped = FORCE_OVER_SEG
    ? Array.from(boundaries)
    : snapBoundariesToGrid(boundaries, linear);
  // Deduplicate snapped frames (beat boundaries snapping may create duplicates)
  snapped = Array.from(new Set(snapped)).sort((a, b) => a - b);
  console.log(
    `Architect: Snapped boundaries count: ${snapped.length - 2}`,
    snapped.slice(1, -1),
  );

  progressCallback(70);

  // Cluster / label / enrich
  // Map inserted hard boundary frames to snapped grid - avoid accidental merges across them
  const mappedHardBoundaries = new Set();
  if (hardBoundarySet.size > 0) {
    for (const hb of hardBoundarySet) {
      const t = hb * FRAME_HOP_SECONDS;
      // nearest snapped frame
      let closest = snapped[0] || hb;
      let best = Math.abs(closest * FRAME_HOP_SECONDS - t);
      for (const s of snapped) {
        const d = Math.abs(s * FRAME_HOP_SECONDS - t);
        if (d < best) {
          best = d;
          closest = s;
        }
      }
      mappedHardBoundaries.add(closest);
    }
  }
  console.log(
    'Architect: Mapped hard boundary set:',
    Array.from(mappedHardBoundaries),
  );
  const clustering = clusterSections(
    matrixObj,
    snapped,
    mappedHardBoundaries,
    opts.forceOverSeg,
    opts.similarityThreshold || 0.6,
  );
  console.log(
    'Architect: clusterSections produced',
    clustering.sections.length,
    'sections and',
    clustering.clusters.size,
    'clusters',
  );
  const labeled = labelSections(clustering.sections, clustering.clusters);
  const enriched = attachSemanticSignatures(
    labeled,
    clustering.clusters,
    linear,
  );
  // Optional: Merge similar adjacent micro-segments based on chroma similarity
  const mergeChromaThreshold = opts.mergeChromaThreshold || 0.85;
  const minSectionDurationSec = opts.minSectionDurationSec || 8.0;
  const mergeShortWithMfcc =
    opts.mergeShortWithMfcc === undefined ? true : !!opts.mergeShortWithMfcc;
  const mergedSimilar = mergeSimilarSections(enriched, linear, {
    threshold: mergeChromaThreshold,
    minSectionDurationSec: minSectionDurationSec,
    useMfccForShort: mergeShortWithMfcc,
    hardBoundaries: mappedHardBoundaries,
  });
  const merged = mergeSemanticSections(
    mergedSimilar,
    linear,
    mappedHardBoundaries,
    opts.forceOverSeg,
  );
  // Run Theory Glue pass (Pass 3) to enforce cadences, symmetry and harmonic rhythm grouping
  const finalSections = applyTheoryGlue(merged, linear, opts || {});

  progressCallback(90);

  // Convert to structural_map schema
  let debugObj = noveltyResult.debug || {};
  debugObj = { frame_hop: FRAME_HOP_SECONDS, ...debugObj };
  const structural_map = {
    sections: finalSections.map((s) => ({
      section_id: s.section_id,
      section_label: s.section_label,
      section_variant: s.section_variant || 1,
      time_range: {
        start_time: s.start_frame * FRAME_HOP_SECONDS,
        end_time: s.end_frame * FRAME_HOP_SECONDS,
        duration_bars:
          s.time_range?.duration_bars || computeDurationBars(s, linear),
      },
      harmonic_dna: {
        progression: [],
        key_center: linear.metadata?.detected_key || 'C',
      },
      rhythmic_dna: { time_signature: { numerator: 4, denominator: 4 } },
      semantic_signature: s.semantic_signature || {},
    })),
    debug: debugObj,
  };

  // Ensure at least one section
  if (!structural_map.sections || !structural_map.sections.length) {
    structural_map.sections = [
      {
        section_id: 'section-1',
        section_label: 'verse',
        section_variant: 1,
        time_range: {
          start_time: 0,
          end_time: linear.metadata?.duration_seconds || 30,
          duration_bars: (linear.metadata?.duration_seconds || 30) / 2,
        },
        harmonic_dna: {
          progression: [],
          key_center: linear.metadata?.detected_key || 'C',
        },
        rhythmic_dna: { time_signature: { numerator: 4, denominator: 4 } },
        semantic_signature: {},
      },
    ];
  }

  progressCallback(100);
  return structural_map;
}
module.exports = { analyzeStructure };
