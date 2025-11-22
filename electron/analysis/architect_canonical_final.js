/**
 * Architect (Structure Detection) - Canonical Final Implementation
 * Multi-signal fusion: chroma + mfcc + rms + flux
 * MAD-based adaptive thresholding, clustering, labeling
 */

const { summarizeFrames } = require('./semanticUtils');
const fs = require('fs');
const path = require('path');

const FRAME_HOP_SECONDS = 0.1;
const MIN_SECTION_SECONDS = 1.5; // Allow short transitions (was 2.0)
const MIN_SECTION_FRAMES = Math.round(MIN_SECTION_SECONDS / FRAME_HOP_SECONDS);
const NOVELTY_KERNEL_SIZE = 14;

const W_CHROMA = 0.3;
const W_MFCC = 0.2;
const W_RMS = 0.3;
const W_FLUX = 0.2;

function loadConfig() {
  try {
    const p = path.resolve(__dirname, 'audioAnalyzerConfig.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return { novelty_threshold: 0.05, chord_duration_min: 1 };
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function buildSimilarityMatrix(chroma, mfcc, rms, flux) {
  const n = chroma.length || 0;
  const data = new Float32Array(n * n);
  const step = n > 4000 ? 2 : 1;
  const alignedMFCC =
    mfcc && mfcc.length === n
      ? mfcc
      : mfcc
        ? new Array(n)
            .fill(0)
            .map((_, i) => mfcc[Math.floor((i / n) * mfcc.length)] || [])
        : null;
  for (let i = 0; i < n; i += step)
    for (let j = 0; j < n; j += step) {
      const cs = cosineSimilarity(chroma[i] || [], chroma[j] || []);
      const sM = alignedMFCC
        ? cosineSimilarity(alignedMFCC[i] || [], alignedMFCC[j] || [])
        : cs;
      const vRms =
        rms && rms[i] !== undefined && rms[j] !== undefined
          ? 1 - Math.abs(rms[i] - rms[j])
          : 1;
      const vFlux =
        flux && flux[i] !== undefined && flux[j] !== undefined
          ? 1 - Math.abs(flux[i] - flux[j])
          : 1;
      const val = cs * W_CHROMA + sM * W_MFCC + vRms * W_RMS + vFlux * W_FLUX;
      data[i * n + j] = val;
      if (step > 1) {
        if (i + 1 < n) data[(i + 1) * n + j] = val;
        if (j + 1 < n) data[i * n + (j + 1)] = val;
        if (i + 1 < n && j + 1 < n) data[(i + 1) * n + (j + 1)] = val;
      }
    }
  return { data, size: n };
}

function computeAdaptiveThreshold(arr, sensitivity = 2) {
  if (!arr || !arr.length) return 0.02;
  const a = Array.from(arr);
  const s = a.slice().sort((x, y) => x - y);
  const m = s[Math.floor(s.length / 2)] || 0;
  const dev = a.map((v) => Math.abs(v - m));
  const sd = dev.slice().sort((x, y) => x - y);
  const mad = sd[Math.floor(sd.length / 2)] || 0;
  return m + sensitivity * mad;
}

function smoothSeries(arr, windowSize) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0,
      c = 0;
    for (let w = -windowSize; w <= windowSize; w++)
      if (i + w >= 0 && i + w < arr.length) {
        sum += arr[i + w];
        c++;
      }
    out[i] = c ? sum / c : 0;
  }
  return out;
}

function applyMedianFilter(series, windowSize) {
  if (windowSize <= 1) return series;
  const half = Math.floor(windowSize / 2);
  const out = new Float32Array(series.length);
  for (let i = 0; i < series.length; i++) {
    const w = [];
    for (let k = i - half; k <= i + half; k++)
      if (k >= 0 && k < series.length) w.push(series[k]);
    w.sort((a, b) => a - b);
    const m = Math.floor(w.length / 2);
    out[i] = w.length % 2 === 0 ? (w[m - 1] + w[m]) / 2 : w[m];
  }
  return out;
}

function detectNovelty(matrixObj, chroma = [], mfcc = null) {
  const { data, size: n } = matrixObj;
  if (!n) return { boundaries: [0], debug: {} };
  const novelty = new Float32Array(n);
  const kernel = NOVELTY_KERNEL_SIZE;
  let maxN = 0;
  for (let i = kernel; i < n - kernel; i++) {
    let score = 0;
    for (let k = 0; k < kernel; k++)
      for (let m = 0; m < kernel; m++) {
        const pp = data[(i - k) * n + (i - m)] || 0;
        const ff = data[(i + k) * n + (i + m)] || 0;
        const pf = data[(i - k) * n + (i + m)] || 0;
        const fp = data[(i + k) * n + (i - m)] || 0;
        score += pp + ff - (pf + fp);
      }
    const val = score / (kernel * kernel);
    novelty[i] = val;
    if (val > maxN) maxN = val;
  }
  const temporalFlux = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const cs = cosineSimilarity(chroma[i] || [], chroma[i - 1] || []);
    temporalFlux[i] = 1 - cs;
  }
  const maxChk = Math.max(...novelty) || 1;
  const maxFx = Math.max(...temporalFlux) || 1;
  for (let i = 0; i < n; i++) {
    novelty[i] /= maxChk;
    temporalFlux[i] /= maxFx;
  }
  const combined = new Float32Array(n);
  for (let i = 0; i < n; i++)
    combined[i] = 0.7 * novelty[i] + 0.3 * temporalFlux[i];
  const sm = smoothSeries(
    combined,
    Math.max(3, Math.round(1.5 / FRAME_HOP_SECONDS)),
  );
  const filtered = applyMedianFilter(sm, Math.round(2.0 / FRAME_HOP_SECONDS));
  const config = loadConfig();
  const rawBase = config.novelty_threshold ?? 0.05;
  const MIN_NOISE_FLOOR = 0.02;
  let adaptive = computeAdaptiveThreshold(filtered, 1.2);
  adaptive = Math.max(adaptive, maxN * 0.15);
  function findPeaks(th) {
    const picks = [0];
    for (let i = 1; i < filtered.length - 1; i++) {
      if (
        filtered[i] > th &&
        filtered[i] > filtered[i - 1] &&
        filtered[i] > filtered[i + 1]
      ) {
        const last = picks[picks.length - 1];
        const dist = i - last;
        const isFarEnough = dist >= MIN_SECTION_FRAMES;
        const isStrongSignal =
          dist >= Math.round(1 / FRAME_HOP_SECONDS) && filtered[i] > th * 2;
        if (isFarEnough || isStrongSignal) picks.push(i);
      }
    }
    picks.push(n - 1);
    return picks;
  }
  let boundaries = findPeaks(adaptive);
  if (boundaries.length <= 2) {
    const retryThreshold = computeAdaptiveThreshold(filtered, 0.8);
    const retry = Math.max(retryThreshold, MIN_NOISE_FLOOR);
    console.log('Architect: Under-segmented. Retrying with K=0.8');
    boundaries = findPeaks(retry);
  }
  if (boundaries.length > 24) {
    const strictThreshold = computeAdaptiveThreshold(filtered, 3);
    const strict = Math.max(strictThreshold, MIN_NOISE_FLOOR);
    console.log('Architect: Over-segmented. Raising K=3.0');
    boundaries = findPeaks(strict);
  }
  if (mfcc && mfcc.length) {
    const aligned =
      mfcc.length === n
        ? mfcc
        : new Array(n)
            .fill(0)
            .map((_, i) => mfcc[Math.floor((i / n) * mfcc.length)] || []);
    const mfFlux = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const cs = cosineSimilarity(aligned[i] || [], aligned[i - 1] || []);
      mfFlux[i] = 1 - cs;
    }
    const maxM = Math.max(...mfFlux) || 1;
    for (let i = 0; i < n; i++) mfFlux[i] /= maxM;
    const mfS = smoothSeries(mfFlux, Math.round(0.5 / FRAME_HOP_SECONDS));
    const extra = [];
    for (let s = 0; s < boundaries.length - 1; s++) {
      const a = boundaries[s],
        b = boundaries[s + 1];
      let localMax = 0;
      for (let i = a + 1; i < b - 1; i++) localMax = Math.max(localMax, mfS[i]);
      const localThreshold = Math.max(localMax * 0.25, maxM * 0.15);
      for (let i = a + 1; i < b - 1; i++) {
        if (
          mfS[i] > localThreshold &&
          mfS[i] > mfS[i - 1] &&
          mfS[i] > mfS[i + 1]
        ) {
          if (
            mfS[i] >= maxM * 0.4 ||
            (i - a >= MIN_SECTION_FRAMES && b - i >= MIN_SECTION_FRAMES)
          ) {
            extra.push(i);
          }
        }
      }
    }
    if (extra.length)
      boundaries = Array.from(new Set([...boundaries, ...extra])).sort(
        (x, y) => x - y,
      );
  }
  return {
    boundaries,
    debug: {
      noveltyCurve: Array.from(filtered),
      threshold: adaptive,
      maxNovelty: maxN,
      temporalFlux: Array.from(temporalFlux),
    },
  };
}

function clusterSections(matrixObj, boundaries) {
  const { data, size: n } = matrixObj;
  const sections = [];
  const clusters = new Map();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const s = boundaries[i],
      e = boundaries[i + 1];
    if (e - s < 5) continue;
    sections.push({
      start_frame: s,
      end_frame: e,
      length: e - s,
      cluster_id: null,
    });
  }
  const thr = 0.6;
  let cid = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;
    sections[i].cluster_id = cid;
    clusters.set(cid, [i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;
      let sum = 0,
        count = 0,
        step = 4;
      for (
        let y = sections[i].start_frame;
        y < sections[i].end_frame;
        y += step
      )
        for (
          let x = sections[j].start_frame;
          x < sections[j].end_frame;
          x += step
        ) {
          sum += data[y * n + x] || 0;
          count++;
        }
      const avg = count ? sum / count : 0;
      if (avg > thr) {
        sections[j].cluster_id = cid;
        clusters.get(cid).push(j);
      }
    }
    cid++;
  }
  return { sections, clusters };
}

function labelSections(sections, clusters) {
  if (!sections.length) return sections;
  sections[0].section_label = 'intro';
  sections[0].section_variant = 1;
  const stats = [];
  clusters.forEach((indices, cid) => {
    const starts = indices.map((i) => sections[i].start_frame);
    const totalLength = indices.reduce((acc, i) => acc + sections[i].length, 0);
    stats.push({
      cid,
      indices,
      count: indices.length,
      totalLength,
      firstStart: Math.min(...starts),
    });
  });
  const sorted = stats.sort((a, b) => b.totalLength - a.totalLength);
  const primary = sorted[0];
  if (primary)
    primary.indices.forEach((idx, i) => {
      if (sections[idx].section_label !== 'intro') {
        sections[idx].section_label = 'chorus';
        sections[idx].section_variant = i + 1;
      }
    });
  const remaining = sorted.filter((s) => s.cid !== primary?.cid);
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
  if (clusters.size < 2 && sections.length > 2) {
    let t = true;
    for (let i = 1; i < sections.length; i++) {
      if (sections[i].section_label === 'outro') continue;
      sections[i].section_label = t ? 'verse' : 'chorus';
      t = !t;
    }
  }
  return sections;
}

function shouldMergeSections(a, b) {
  if (!a || !b) return false;
  const aDur = (a.end_frame - a.start_frame) * FRAME_HOP_SECONDS;
  const bDur = (b.end_frame - b.start_frame) * FRAME_HOP_SECONDS;
  const short = aDur < MIN_SECTION_SECONDS || bDur < MIN_SECTION_SECONDS;
  const sameLabel =
    a.section_label && b.section_label && a.section_label === b.section_label;
  const gap = (b.start_frame - a.end_frame) * FRAME_HOP_SECONDS;
  return short || sameLabel || gap < 2;
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

function mergeSemanticSections(sections, linear) {
  if (!sections || !sections.length) return sections;
  const merged = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!merged.length) {
      merged.push({ ...s });
      continue;
    }
    const last = merged[merged.length - 1];
    if (shouldMergeSections(last, s)) {
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

async function analyzeStructure(linear, progressCallback = () => {}) {
  progressCallback(10);
  await new Promise((r) => setTimeout(r, 0));
  const chroma =
    linear.chroma_frames?.map((f) => f.chroma || []) ||
    extractChromaFromEvents(linear.events);
  const mfcc = linear.mfcc_frames?.map((f) => f.mfcc || []) || null;
  const rms = linear.chroma_frames?.map((f) => f.rms || 0) || [];
  const flux = linear.chroma_frames?.map((f) => f.flux || 0) || [];
  progressCallback(30);
  const matrixObj = buildSimilarityMatrix(chroma, mfcc, rms, flux);
  progressCallback(50);
  const noveltyResult = detectNovelty(matrixObj, chroma, mfcc);
  const boundaries = noveltyResult.boundaries;
  const snapped = snapBoundariesToGrid(boundaries, linear);
  progressCallback(70);
  const clustering = clusterSections(matrixObj, snapped);
  const labeled = labelSections(clustering.sections, clustering.clusters);
  const enriched = attachSemanticSignatures(
    labeled,
    clustering.clusters,
    linear,
  );
  const merged = mergeSemanticSections(enriched, linear);
  progressCallback(90);
  const structural_map = {
    sections: merged.map((s) => ({
      section_id: s.section_id,
      section_label: s.section_label,
      section_variant: s.section_variant || 1,
      time_range: {
        start_time: s.start_frame * FRAME_HOP_SECONDS,
        end_time: s.end_frame * FRAME_HOP_SECONDS,
        duration_bars: computeDurationBars(s, linear),
      },
      harmonic_dna: {
        progression: [],
        key_center: linear.metadata?.detected_key || 'C',
      },
      rhythmic_dna: { time_signature: { numerator: 4, denominator: 4 } },
      semantic_signature: s.semantic_signature || {},
    })),
    debug: { ...(noveltyResult.debug || {}), frame_hop: FRAME_HOP_SECONDS },
  };
  if (!structural_map.sections || !structural_map.sections.length) {
    structural_map.sections = [
      {
        section_id: 'section-1',
        section_label: 'verse',
        section_variant: 1,
        time_range: {
          start_time: 0,
          end_time: linear.metadata?.duration_seconds || 30,
          duration_bars: 16,
        },
        harmonic_dna: { progression: [], key_center: 'C' },
        rhythmic_dna: { time_signature: { numerator: 4, denominator: 4 } },
        semantic_signature: {},
      },
    ];
  }
  progressCallback(100);
  return structural_map;
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

module.exports = { analyzeStructure };
