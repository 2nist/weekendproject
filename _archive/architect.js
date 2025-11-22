// Thin wrapper to re-export the consolidated architect implementation
module.exports = require('./architect_clean');
// Minimal wrapper for the clean architect implementation
module.exports = require('./architect_clean');
// wrapper for the clean Architect implementation
module.exports = require('./architect_clean');
// architect.js wrapper - re-export clean implementation
module.exports = require('./architect_clean');
// SINGLE-CLEAN-ARCHITECT - final minimal implementation
// (import summarized from semanticUtils)

const FRAME_HOP = 0.1;
const MIN_SECTION_SECONDS = 5.0;
const MIN_SECTION_FRAMES = Math.round(MIN_SECTION_SECONDS / FRAME_HOP);

function cosineSim(a = [], b = []) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return d / (Math.sqrt(na) * Math.sqrt(nb));
}

function smooth(series = [], w = 5) {
  if (w <= 1) return series;
  const half = Math.floor(w / 2);
  return series.map((v, i) => {
    let s = 0,
      c = 0;
    for (let k = i - half; k <= i + half; k++)
      if (k >= 0 && k < series.length) {
        s += series[k];
        c++;
      }
    return c ? s / c : v;
  });
}

function medianFilter(series = [], w = 5) {
  if (w <= 1) return series;
  const half = Math.floor(w / 2);
  return series.map((v, i) => {
    const win = [];
    for (let k = i - half; k <= i + half; k++)
      if (k >= 0 && k < series.length) win.push(series[k]);
    win.sort((a, b) => a - b);
    const mid = Math.floor(win.length / 2);
    return win.length % 2 === 0 ? (win[mid - 1] + win[mid]) / 2 : win[mid];
  });
}

function buildSimilarityMatrix(chroma = [], mfcc = null) {
  const n = chroma.length;
  const useT = mfcc && mfcc.length === n;
  const step = n > 3000 ? 2 : 1;
  const mat = new Array(n);
  for (let i = 0; i < n; i += step) {
    const r = new Array(n);
    for (let j = 0; j < n; j += step) {
      const cs = cosineSim(chroma[i] || [], chroma[j] || []);
      const ms = useT ? cosineSim(mfcc[i] || [], mfcc[j] || []) : 0;
      r[j] = useT ? 0.6 * cs + 0.4 * ms : cs;
    }
    mat[i] = r;
  }
  return mat;
}

function detectNovelty(matrix) {
  const n = matrix.length;
  if (!n) return [0];
  const kernel = 30;
  const novelty = Array(n).fill(0);
  for (let i = kernel; i < n - kernel; i++) {
    if (!matrix[i]) continue;
    let s = 0;
    for (let k = 0; k < kernel; k++)
      for (let m = 0; m < kernel; m++) {
        const pp = matrix[i - k]?.[i - m] || 0;
        const ff = matrix[i + k]?.[i + m] || 0;
        const pf = matrix[i - k]?.[i + m] || 0;
        const fp = matrix[i + k]?.[i - m] || 0;
        s += pp + ff - (pf + fp);
      }
    novelty[i] = s / (kernel * kernel);
  }
  const sm = smooth(novelty, Math.max(3, Math.round(2.0 / FRAME_HOP)));
  const mf = medianFilter(sm, Math.round(3 / FRAME_HOP));
  const threshold = 0.15;
  const boundaries = [0];
  for (let i = 1; i < mf.length - 1; i++)
    if (mf[i] > threshold && mf[i] > mf[i - 1] && mf[i] > mf[i + 1]) {
      const last = boundaries[boundaries.length - 1];
      if (i - last >= MIN_SECTION_FRAMES) boundaries.push(i);
    }
  boundaries.push(n - 1);
  if (boundaries.length > 20) {
    const step = Math.floor(boundaries.length / 20);
    const res = [boundaries[0]];
    for (let i = step; i < boundaries.length - 1; i += step)
      res.push(boundaries[i]);
    res.push(boundaries[boundaries.length - 1]);
    return res;
  }
  return boundaries;
}

function calculateSectionSimilarity(matrix, A, B) {
  let s = 0,
    c = 0;
  const step = 2;
  for (let i = A.start_frame; i < A.end_frame; i += step) {
    if (!matrix[i]) continue;
    for (let j = B.start_frame; j < B.end_frame; j += step) {
      const v = matrix[i][j];
      if (v !== undefined) {
        s += v;
        c++;
      }
    }
  }
  return c ? s / c : 0;
}

function clusterSections(matrix, boundaries) {
  const sections = [];
  const clusters = new Map();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const s = boundaries[i],
      e = boundaries[i + 1];
    if (e - s < 10) continue;
    sections.push({
      start_frame: s,
      end_frame: e,
      length: e - s,
      cluster_id: null,
    });
  }
  const thr = 0.65;
  let id = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;
    sections[i].cluster_id = id;
    clusters.set(id, [i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;
      const avg = calculateSectionSimilarity(matrix, sections[i], sections[j]);
      if (avg > thr) {
        sections[j].cluster_id = id;
        clusters.get(id).push(j);
      }
    }
    id++;
  }
  return { sections, clusters };
}

function labelSections(sections, clusters) {
  if (!sections.length) return sections;
  sections[0].section_label = 'intro';
  sections[0].section_variant = 1;
  const stats = [];
  clusters.forEach((idxs, cid) => {
    const occ = idxs.map((i) => sections[i]);
    const starts = occ.map((s) => s.start_frame);
    stats.push({
      cid,
      indices: idxs,
      count: idxs.length,
      firstStart: Math.min(...starts),
    });
  });
  const byCount = stats.sort((a, b) => b.count - a.count);
  const primary = byCount[0];
  if (primary)
    primary.indices.forEach((idx, i) => {
      sections[idx].section_label = 'chorus';
      sections[idx].section_variant = i + 1;
    });
  const rem = byCount.filter((b) => b.cid !== primary?.cid);
  if (rem.length > 0) {
    rem.sort((a, b) => a.firstStart - b.firstStart);
    rem[0].indices.forEach((idx, i) => {
      if (!sections[idx].section_label) {
        sections[idx].section_label = 'verse';
        sections[idx].section_variant = i + 1;
      }
    });
  }
  sections.forEach((s, i) => {
    if (!s.section_label) {
      if (i === sections.length - 1) s.section_label = 'outro';
      else if (s.length < sections[0].length * 0.6) s.section_label = 'bridge';
      else s.section_label = 'verse';
      s.section_variant = 1;
    }
    s.section_id = `SECTION_${s.section_label.toUpperCase().charAt(0)}${s.section_variant || i + 1}`;
  });
  return sections;
}

function attachSemanticSignatures(sections, clusters, linear) {
  const counts = new Map();
  clusters.forEach((idxs, id) => counts.set(id, idxs.length));
  const frames = linear?.semantic_features?.frames || [];
  return sections.map((s) => {
    const start = s.start_frame * FRAME_HOP;
    const end = s.end_frame * FRAME_HOP;
    const f = frames.filter(
      (fr) => fr.timestamp >= start && fr.timestamp < end,
    );
    const sum = summarizeFrames(f);
    const rep = counts.get(s.cluster_id) || 1;
    return {
      ...s,
      semantic_signature: {
        repetition_score: Number(
          (rep / Math.max(1, sections.length)).toFixed(3),
        ),
        repetition_count: rep,
        avg_rms: sum.avg_rms,
        max_rms: sum.max_rms,
        has_vocals: sum.has_vocals,
        duration_seconds: Math.max(0, end - start),
      },
    };
  });
}

function mergeSemanticSignatures(a = {}, b = {}) {
  const aDur = a.duration_seconds || 0,
    bDur = b.duration_seconds || 0,
    total = aDur + bDur || 1;
  const w = (p) => ((a[p] || 0) * aDur + (b[p] || 0) * bDur) / total;
  return {
    repetition_score: Math.max(
      a.repetition_score || 0,
      b.repetition_score || 0,
    ),
    repetition_count: (a.repetition_count || 0) + (b.repetition_count || 0),
    avg_rms: w('avg_rms'),
    max_rms: Math.max(a.max_rms || 0, b.max_rms || 0),
    duration_seconds: aDur + bDur,
  };
}

function mergeSections(sections, linear) {
  if (!Array.isArray(sections) || sections.length === 0) return sections;
  const merged = [];
  sections.forEach((s) => {
    const c = { ...s };
    if (!merged.length) {
      merged.push(c);
      return;
    }
    const last = merged[merged.length - 1];
    const gap = (c.start_frame - last.end_frame) * FRAME_HOP;
    const sameLabel = last.section_label === c.section_label;
    if (sameLabel || gap < 2) {
      last.end_frame = c.end_frame;
      last.length = last.end_frame - last.start_frame;
      last.semantic_signature = mergeSemanticSignatures(
        last.semantic_signature || {},
        c.semantic_signature || {},
      );
    } else merged.push(c);
  });
  return merged;
}

async function analyzeStructure(linear, progress = () => {}) {
  progress(10);
  await new Promise((r) => setImmediate(r));
  const chroma = linear.chroma_frames?.map((f) => f.chroma || []) || [];
  const mfcc = linear.mfcc_frames?.map((f) => f.mfcc || []) || [];
  progress(30);
  const matrix = buildSimilarityMatrix(
    chroma.length ? chroma : extractChromaFromEvents(linear.events || []),
    mfcc.length ? mfcc : null,
  );
  progress(50);
  const boundaries = detectNovelty(matrix);
  progress(70);
  const { sections, clusters } = clusterSections(matrix, boundaries);
  const labeled = labelSections(sections, clusters);
  const enriched = attachSemanticSignatures(labeled, clusters, linear);
  const merged = mergeSections(enriched, linear);
  progress(90);
  const structural = {
    sections: merged.map((s) => ({
      section_id: s.section_id,
      section_label: s.section_label,
      section_variant: s.section_variant || 1,
      time_range: {
        start_time: s.start_frame * FRAME_HOP,
        end_time: s.end_frame * FRAME_HOP,
        duration_bars: computeDurationBars(s, linear),
      },
      semantic_signature: s.semantic_signature || {},
    })),
  };
  progress(100);
  return structural;
}

function extractChromaFromEvents(events = []) {
  return Array(100)
    .fill(0)
    .map(() =>
      Array(12)
        .fill(0)
        .map(() => Math.random()),
    );
}

function computeDurationBars(section, linear) {
  const tempo =
    linear?.beat_grid?.tempo_bpm || linear?.metadata?.tempo_hint || 120;
  const beats = linear?.beat_grid?.beats_per_bar || 4;
  const spb = (60 / tempo) * beats;
  const dur = (section.end_frame - section.start_frame) * FRAME_HOP;
  if (!Number.isFinite(spb) || spb <= 0) return dur / 2;
  return dur / spb;
}

module.exports = {
  analyzeStructure,
  buildSimilarityMatrix,
  detectNovelty,
  clusterSections,
  labelSections,
};
/**
 * Minimal clean architect implementation exported
 */
const { summarizeFrames: summarize } = require('./semanticUtils');
const FRAME_HOP_SEC = 0.1;
const MIN_SECTION_FRAMES_LIMIT = Math.round(5.0 / FRAME_HOP_SEC);

function _cosine(a = [], b = []) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return d / (Math.sqrt(na) * Math.sqrt(nb));
}

function _buildMatrix(chroma = [], mfcc = null) {
  const n = chroma.length;
  const useT = mfcc && mfcc.length === n;
  const step = n > 3000 ? 2 : 1;
  const matrix = new Array(n);
  for (let i = 0; i < n; i += step) {
    const r = new Array(n);
    for (let j = 0; j < n; j += step) {
      const cs = _cosine(chroma[i] || [], chroma[j] || []);
      const ms = useT ? _cosine(mfcc[i] || [], mfcc[j] || []) : 0;
      r[j] = useT ? 0.6 * cs + 0.4 * ms : cs;
    }
    matrix[i] = r;
  }
  return matrix;
}

function _detect(matrix) {
  const n = matrix.length;
  if (!n) return [0];
  const kernel = 30;
  const novelty = Array(n).fill(0);
  for (let i = kernel; i < n - kernel; i++) {
    if (!matrix[i]) continue;
    let s = 0;
    for (let k = 0; k < kernel; k++)
      for (let m = 0; m < kernel; m++) {
        const pp = matrix[i - k]?.[i - m] || 0;
        const ff = matrix[i + k]?.[i + m] || 0;
        const pf = matrix[i - k]?.[i + m] || 0;
        const fp = matrix[i + k]?.[i - m] || 0;
        s += pp + ff - (pf + fp);
      }
    novelty[i] = s / (kernel * kernel);
  }
  const sm = smooth(novelty, Math.max(3, Math.round(2.0 / FRAME_HOP_SEC)));
  const mf = medianFilter(sm, Math.round(3 / FRAME_HOP_SEC));
  const boundaries = [0];
  const threshold = 0.15;
  for (let i = 1; i < mf.length - 1; i++)
    if (mf[i] > threshold && mf[i] > mf[i - 1] && mf[i] > mf[i + 1]) {
      const last = boundaries[boundaries.length - 1];
      if (i - last >= MIN_SECTION_FRAMES_LIMIT) boundaries.push(i);
    }
  boundaries.push(n - 1);
  if (boundaries.length > 20) {
    const step = Math.floor(boundaries.length / 20);
    const res = [boundaries[0]];
    for (let i = step; i < boundaries.length - 1; i += step)
      res.push(boundaries[i]);
    res.push(boundaries[boundaries.length - 1]);
    return res;
  }
  return boundaries;
}

function _similarity(a, b, matrix) {
  let s = 0,
    c = 0;
  const step = 2;
  for (let i = a.start_frame; i < a.end_frame; i += step) {
    if (!matrix[i]) continue;
    for (let j = b.start_frame; j < b.end_frame; j += step) {
      const v = matrix[i][j];
      if (v !== undefined) {
        s += v;
        c++;
      }
    }
  }
  return c ? s / c : 0;
}

function _cluster(matrix, boundaries) {
  const sections = [];
  const clusters = new Map();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const s = boundaries[i],
      e = boundaries[i + 1];
    if (e - s < 10) continue;
    sections.push({
      start_frame: s,
      end_frame: e,
      length: e - s,
      cluster_id: null,
    });
  }
  const thr = 0.65;
  let id = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;
    sections[i].cluster_id = id;
    clusters.set(id, [i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;
      const avg = _similarity(sections[i], sections[j], matrix);
      if (avg > thr) {
        sections[j].cluster_id = id;
        clusters.get(id).push(j);
      }
    }
    id++;
  }
  return { sections, clusters };
}

function _label(sections, clusters) {
  if (!sections.length) return sections;
  sections[0].section_label = 'intro';
  sections[0].section_variant = 1;
  const stats = [];
  clusters.forEach((idxs, cid) => {
    const occ = idxs.map((i) => sections[i]);
    const starts = occ.map((s) => s.start_frame);
    stats.push({
      cid,
      indices: idxs,
      count: idxs.length,
      firstStart: Math.min(...starts),
    });
  });
  const byCount = stats.sort((a, b) => b.count - a.count);
  const primary = byCount[0];
  if (primary)
    primary.indices.forEach((idx, i) => {
      sections[idx].section_label = 'chorus';
      sections[idx].section_variant = i + 1;
    });
  const rem = byCount.filter((b) => b.cid !== primary?.cid);
  if (rem.length > 0) {
    rem.sort((a, b) => a.firstStart - b.firstStart);
    rem[0].indices.forEach((idx, i) => {
      if (!sections[idx].section_label) {
        sections[idx].section_label = 'verse';
        sections[idx].section_variant = i + 1;
      }
    });
  }
  sections.forEach((s, i) => {
    if (!s.section_label) {
      if (i === sections.length - 1) s.section_label = 'outro';
      else if (s.length < sections[0].length * 0.6) s.section_label = 'bridge';
      else s.section_label = 'verse';
      s.section_variant = 1;
    }
    s.section_id = `SECTION_${s.section_label.toUpperCase().charAt(0)}${s.section_variant || i + 1}`;
  });
  return sections;
}

function _attach(sections, clusters, linear) {
  const counts = new Map();
  clusters.forEach((idxs, id) => counts.set(id, idxs.length));
  const frames = linear?.semantic_features?.frames || [];
  return sections.map((s) => {
    const start = s.start_frame * FRAME_HOP_SEC;
    const end = s.end_frame * FRAME_HOP_SEC;
    const f = frames.filter(
      (fr) => fr.timestamp >= start && fr.timestamp < end,
    );
    const sum = summarize(f);
    const rep = counts.get(s.cluster_id) || 1;
    return {
      ...s,
      semantic_signature: {
        repetition_score: Number(
          (rep / Math.max(1, sections.length)).toFixed(3),
        ),
        repetition_count: rep,
        avg_rms: sum.avg_rms,
        max_rms: sum.max_rms,
        has_vocals: sum.has_vocals,
        duration_seconds: Math.max(0, end - start),
      },
    };
  });
}

function _merge(sections, linear) {
  if (!Array.isArray(sections) || sections.length === 0) return sections;
  const merged = [];
  sections.forEach((s) => {
    const c = { ...s };
    if (!merged.length) {
      merged.push(c);
      return;
    }
    const last = merged[merged.length - 1];
    const gap = (c.start_frame - last.end_frame) * FRAME_HOP_SEC;
    const sameLabel = last.section_label === c.section_label;
    if (sameLabel || gap < 2) {
      last.end_frame = c.end_frame;
      last.length = last.end_frame - last.start_frame;
      last.semantic_signature = mergeSemanticSignatures(
        last.semantic_signature || {},
        c.semantic_signature || {},
      );
    } else merged.push(c);
  });
  return merged;
}

async function analyzeStructureClean(linear, progress = () => {}) {
  progress(10);
  await new Promise((r) => setImmediate(r));
  const chroma = linear.chroma_frames?.map((f) => f.chroma || []) || [];
  const mfcc = linear.mfcc_frames?.map((f) => f.mfcc || []) || [];
  progress(30);
  const matrix = buildSimilarityMatrix(
    chroma.length ? chroma : extractChromaFromEvents(linear.events || []),
    mfcc.length ? mfcc : null,
  );
  progress(50);
  const boundaries = detectNovelty(matrix);
  progress(70);
  const { sections, clusters } = clusterSections(matrix, boundaries);
  const labeled = labelSections(sections, clusters);
  const attached = attachSemanticSignatures(labeled, clusters, linear);
  const merged = mergeSemanticSections(attached, linear);
  progress(90);
  const structural = {
    sections: merged.map((s) => ({
      section_id: s.section_id,
      section_label: s.section_label,
      section_variant: s.section_variant || 1,
      time_range: {
        start_time: s.start_frame * FRAME_HOP_SEC,
        end_time: s.end_frame * FRAME_HOP_SEC,
        duration_bars: computeDurationBars(s, linear),
      },
      semantic_signature: s.semantic_signature || {},
    })),
  };
  progress(100);
  return structural;
}

function extractChromaFromEvents(events = []) {
  return Array(100)
    .fill(0)
    .map(() =>
      Array(12)
        .fill(0)
        .map(() => Math.random()),
    );
}

function computeDurationBars(section, linear) {
  const tempo =
    linear?.beat_grid?.tempo_bpm || linear?.metadata?.tempo_hint || 120;
  const beats = linear?.beat_grid?.beats_per_bar || 4;
  const spb = (60 / tempo) * beats;
  const dur = (section.end_frame - section.start_frame) * FRAME_HOP_SEC;
  if (!Number.isFinite(spb) || spb <= 0) return dur / 2;
  return dur / spb;
}

module.exports = {
  analyzeStructure: analyzeStructureClean,
  buildSimilarityMatrix,
  detectNovelty,
  clusterSections,
  labelSections,
};
/**
 * Single consolidated and cleaned Architect implementation
 */
const { summarizeFrames: _summarizeFrames } = require('./semanticUtils');
const FRAME_HOP = 0.1;
const MIN_SECTION_SEC = 5.0;
const MIN_SECTION_FRAMES_CONST = Math.round(MIN_SECTION_SEC / FRAME_HOP);

function cosineSim(a = [], b = []) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function smooth(series = [], w = 5) {
  if (w <= 1) return series;
  const half = Math.floor(w / 2);
  return series.map((v, i) => {
    let s = 0,
      c = 0;
    for (let k = i - half; k <= i + half; k++)
      if (k >= 0 && k < series.length) {
        s += series[k];
        c++;
      }
    return c ? s / c : v;
  });
}

function medianFilter(series = [], w = 5) {
  if (w <= 1) return series;
  const half = Math.floor(w / 2);
  return series.map((v, i) => {
    const win = [];
    for (let k = i - half; k <= i + half; k++)
      if (k >= 0 && k < series.length) win.push(series[k]);
    win.sort((a, b) => a - b);
    const mid = Math.floor(win.length / 2);
    return win.length % 2 === 0 ? (win[mid - 1] + win[mid]) / 2 : win[mid];
  });
}

function buildSimilarityMatrix2(chroma = [], mfcc = null) {
  const n = chroma.length;
  const useT = mfcc && mfcc.length === n;
  const step = n > 3000 ? 2 : 1;
  const mat = new Array(n);
  for (let i = 0; i < n; i += step) {
    const row = new Array(n);
    for (let j = 0; j < n; j += step) {
      const cs = cosineSim(chroma[i] || [], chroma[j] || []);
      const ms = useT ? cosineSim(mfcc[i] || [], mfcc[j] || []) : 0;
      row[j] = useT ? 0.6 * cs + 0.4 * ms : cs;
    }
    mat[i] = row;
  }
  return mat;
}

function detectNovelty2(sim) {
  const n = sim.length;
  if (n === 0) return [0];
  const kernel = 30;
  const novelty = new Array(n).fill(0);
  for (let i = kernel; i < n - kernel; i++) {
    if (!sim[i]) continue;
    let s = 0;
    for (let k = 0; k < kernel; k++)
      for (let m = 0; m < kernel; m++) {
        const pp = sim[i - k]?.[i - m] || 0;
        const ff = sim[i + k]?.[i + m] || 0;
        const pf = sim[i - k]?.[i + m] || 0;
        const fp = sim[i + k]?.[i - m] || 0;
        s += pp + ff - (pf + fp);
      }
    novelty[i] = s / (kernel * kernel);
  }
  const sm = smooth(novelty, Math.max(3, Math.round(2.0 / FRAME_HOP)));
  const med = medianFilter(sm, Math.round(3 / FRAME_HOP));
  const threshold = 0.15;
  const boundaries = [0];
  for (let i = 1; i < med.length - 1; i++)
    if (med[i] > threshold && med[i] > med[i - 1] && med[i] > med[i + 1]) {
      const last = boundaries[boundaries.length - 1];
      if (i - last >= MIN_SECTION_FRAMES_CONST) boundaries.push(i);
    }
  boundaries.push(n - 1);
  if (boundaries.length > 20) {
    const step = Math.floor(boundaries.length / 20);
    const r = [boundaries[0]];
    for (let i = step; i < boundaries.length - 1; i += step)
      r.push(boundaries[i]);
    r.push(boundaries[boundaries.length - 1]);
    return r;
  }
  return boundaries;
}

function calculateSectionSimilarity2(mat, A, B) {
  let s = 0,
    c = 0;
  const step = 2;
  for (let i = A.start_frame; i < A.end_frame; i += step) {
    if (!mat[i]) continue;
    for (let j = B.start_frame; j < B.end_frame; j += step) {
      const v = mat[i][j];
      if (v !== undefined) {
        s += v;
        c++;
      }
    }
  }
  return c ? s / c : 0;
}

function clusterSections2(mat, boundaries) {
  const sections = [];
  const clusters = new Map();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const s = boundaries[i],
      e = boundaries[i + 1];
    if (e - s < 10) continue;
    sections.push({
      start_frame: s,
      end_frame: e,
      length: e - s,
      cluster_id: null,
    });
  }
  const thr = 0.65;
  let id = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;
    sections[i].cluster_id = id;
    clusters.set(id, [i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;
      const avg = calculateSectionSimilarity2(mat, sections[i], sections[j]);
      if (avg > thr) {
        sections[j].cluster_id = id;
        clusters.get(id).push(j);
      }
    }
    id++;
  }
  return { sections, clusters };
}

function labelSections2(sections, clusters) {
  if (!sections.length) return sections;
  sections[0].section_label = 'intro';
  sections[0].section_variant = 1;
  const stats = [];
  clusters.forEach((idxs, cid) => {
    const occ = idxs.map((i) => sections[i]);
    const starts = occ.map((s) => s.start_frame);
    stats.push({
      cid,
      indices: idxs,
      count: idxs.length,
      firstStart: Math.min(...starts),
    });
  });
  const byCount = stats.sort((a, b) => b.count - a.count);
  const primary = byCount[0];
  if (primary)
    primary.indices.forEach((idx, i) => {
      sections[idx].section_label = 'chorus';
      sections[idx].section_variant = i + 1;
    });
  const rem = byCount.filter((b) => b.cid !== primary?.cid);
  if (rem.length > 0) {
    rem.sort((a, b) => a.firstStart - b.firstStart);
    rem[0].indices.forEach((idx, i) => {
      if (!sections[idx].section_label) {
        sections[idx].section_label = 'verse';
        sections[idx].section_variant = i + 1;
      }
    });
  }
  sections.forEach((s, i) => {
    if (!s.section_label) {
      if (i === sections.length - 1) s.section_label = 'outro';
      else if (s.length < sections[0].length * 0.6) s.section_label = 'bridge';
      else s.section_label = 'verse';
      s.section_variant = 1;
    }
    s.section_id = `SECTION_${s.section_label.toUpperCase().charAt(0)}${s.section_variant || i + 1}`;
  });
  return sections;
}

function attachSemanticSignatures2(sections, clusters, linear) {
  const counts = new Map();
  clusters.forEach((idxs, id) => counts.set(id, idxs.length));
  const frames = linear?.semantic_features?.frames || [];
  return sections.map((s) => {
    const start = s.start_frame * FRAME_HOP;
    const end = s.end_frame * FRAME_HOP;
    const f = frames.filter(
      (fr) => fr.timestamp >= start && fr.timestamp < end,
    );
    const sum = _summarizeFrames(f);
    const rep = counts.get(s.cluster_id) || 1;
    return {
      ...s,
      semantic_signature: {
        repetition_score: Number(
          (rep / Math.max(1, sections.length)).toFixed(3),
        ),
        repetition_count: rep,
        avg_rms: sum.avg_rms,
        max_rms: sum.max_rms,
        has_vocals: sum.has_vocals,
        duration_seconds: end - start,
      },
    };
  });
}

function mergeSections2(sections, linear) {
  if (!Array.isArray(sections) || !sections.length) return sections;
  const merged = [];
  sections.forEach((s) => {
    const c = { ...s };
    if (!merged.length) {
      merged.push(c);
      return;
    }
    const last = merged[merged.length - 1];
    const gap = (c.start_frame - last.end_frame) * FRAME_HOP;
    const sameLabel = last.section_label === c.section_label;
    if (sameLabel || gap < 2) {
      last.end_frame = c.end_frame;
      last.length = last.end_frame - last.start_frame;
      last.semantic_signature = mergeSemanticSignatures(
        last.semantic_signature || {},
        c.semantic_signature || {},
      );
    } else merged.push(c);
  });
  return merged;
}

function mergeSemanticSignatures(a = {}, b = {}) {
  const aDur = a.duration_seconds || 0,
    bDur = b.duration_seconds || 0,
    total = aDur + bDur || 1;
  const w = (p) => ((a[p] || 0) * aDur + (b[p] || 0) * bDur) / total;
  return {
    repetition_score: Math.max(
      a.repetition_score || 0,
      b.repetition_score || 0,
    ),
    repetition_count: (a.repetition_count || 0) + (b.repetition_count || 0),
    avg_rms: w('avg_rms'),
    max_rms: Math.max(a.max_rms || 0, b.max_rms || 0),
    duration_seconds: aDur + bDur,
  };
}

async function analyzeStructure2(linear, progress = () => {}) {
  progress(10);
  await new Promise((r) => setImmediate(r));
  const chroma = linear.chroma_frames?.map((f) => f.chroma || []) || [];
  const mfcc = linear.mfcc_frames?.map((f) => f.mfcc || []) || [];
  progress(30);
  const sim = buildSimilarityMatrix2(
    chroma.length ? chroma : extractChromaFromEvents(linear.events || []),
    mfcc.length ? mfcc : null,
  );
  progress(50);
  const boundaries = detectNovelty2(sim);
  progress(70);
  const { sections, clusters } = clusterSections2(sim, boundaries);
  const labeled = labelSections2(sections, clusters);
  const enriched = attachSemanticSignatures2(labeled, clusters, linear);
  const merged = mergeSections2(enriched, linear);
  progress(90);
  const structural = {
    sections: merged.map((s) => ({
      section_id: s.section_id,
      section_label: s.section_label,
      section_variant: s.section_variant || 1,
      time_range: {
        start_time: s.start_frame * FRAME_HOP,
        end_time: s.end_frame * FRAME_HOP,
        duration_bars: computeDurationBars(s, linear),
      },
      semantic_signature: s.semantic_signature || {},
    })),
  };
  progress(100);
  return structural;
}

function extractChromaFromEvents(events = []) {
  return Array(100)
    .fill(0)
    .map(() =>
      Array(12)
        .fill(0)
        .map(() => Math.random()),
    );
}

function computeDurationBars(section, linear) {
  const tempo =
    linear?.beat_grid?.tempo_bpm || linear?.metadata?.tempo_hint || 120;
  const beats = linear?.beat_grid?.beats_per_bar || 4;
  const spb = (60 / tempo) * beats;
  const dur = (section.end_frame - section.start_frame) * FRAME_HOP;
  if (!Number.isFinite(spb) || spb <= 0) return dur / 2;
  return dur / spb;
}

module.exports = {
  analyzeStructure: analyzeStructure2,
  buildSimilarityMatrix: buildSimilarityMatrix2,
  detectNovelty: detectNovelty2,
  clusterSections: clusterSections2,
  labelSections: labelSections2,
};
/**
 * Architect - Structure Detection (Consolidated)
 * Tuned for pop/rock segmentation and safe on long inputs
 */
const { summarizeFrames } = require('./semanticUtils');
const fs = require('fs');
const path = require('path');

const FRAME_HOP_SECONDS = 0.1;
const MIN_SECTION_SECONDS = 5.0;
const MIN_SECTION_FRAMES = Math.round(MIN_SECTION_SECONDS / FRAME_HOP_SECONDS);

function loadConfig() {
  try {
    const configPath = path.resolve(__dirname, 'audioAnalyzerConfig.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        novelty_threshold: cfg.novelty_threshold ?? 0.15,
        chord_duration_min: cfg.chord_duration_min ?? 1.0,
      };
    }
  } catch (e) {}
  return { novelty_threshold: 0.15, chord_duration_min: 1.0 };
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
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function buildSimilarityMatrix(chroma, mfcc = null) {
  const n = chroma.length || 0;
  const useTimbre = mfcc && mfcc.length === n;
  const step = n > 3000 ? 2 : 1;
  const matrix = new Array(n);
  for (let i = 0; i < n; i += step) {
    const row = new Array(n);
    for (let j = 0; j < n; j += step) {
      const cs = cosineSimilarity(chroma[i] || [], chroma[j] || []);
      let ms = 0;
      if (useTimbre && mfcc[i] && mfcc[j])
        ms = cosineSimilarity(mfcc[i], mfcc[j]);
      row[j] = useTimbre ? 0.6 * cs + 0.4 * ms : cs;
    }
    matrix[i] = row;
  }
  return matrix;
}

function smoothSeries(series = [], windowSize = 5) {
  if (windowSize <= 1) return series;
  const half = Math.floor(windowSize / 2),
    out = new Array(series.length);
  for (let i = 0; i < series.length; i++) {
    let s = 0,
      c = 0;
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < series.length) {
        s += series[k];
        c++;
      }
    }
    out[i] = c ? s / c : series[i];
  }
  return out;
}

function applyMedianFilter(series = [], windowSize = 5) {
  if (windowSize <= 1) return series;
  const half = Math.floor(windowSize / 2),
    out = new Array(series.length);
  for (let i = 0; i < series.length; i++) {
    const w = [];
    for (let k = i - half; k <= i + half; k++)
      if (k >= 0 && k < series.length) w.push(series[k]);
    w.sort((a, b) => a - b);
    const mid = Math.floor(w.length / 2);
    out[i] = w.length % 2 === 0 ? (w[mid - 1] + w[mid]) / 2 : w[mid];
  }
  return out;
}

function detectNovelty(matrix) {
  const n = matrix.length;
  if (n === 0) return [0];
  const kernel = 30;
  const novelty = new Array(n).fill(0);
  for (let i = kernel; i < n - kernel; i++) {
    if (!matrix[i]) continue;
    let score = 0;
    for (let k = 0; k < kernel; k++)
      for (let m = 0; m < kernel; m++) {
        const pp = (matrix[i - k] || [])[i - m] || 0;
        const ff = (matrix[i + k] || [])[i + m] || 0;
        const pf = (matrix[i - k] || [])[i + m] || 0;
        const fp = (matrix[i + k] || [])[i - m] || 0;
        score += pp + ff - (pf + fp);
      }
    novelty[i] = score / (kernel * kernel);
  }
  const smooth = smoothSeries(
    novelty,
    Math.max(3, Math.round(2.0 / FRAME_HOP_SECONDS)),
  );
  const filtered = applyMedianFilter(smooth, Math.round(3 / FRAME_HOP_SECONDS));
  const cfg = loadConfig();
  const threshold = cfg.novelty_threshold || 0.15;
  const boundaries = [0];
  for (let i = 1; i < filtered.length - 1; i++)
    if (
      filtered[i] > threshold &&
      filtered[i] > filtered[i - 1] &&
      filtered[i] > filtered[i + 1]
    ) {
      const last = boundaries[boundaries.length - 1];
      if (i - last >= MIN_SECTION_FRAMES) boundaries.push(i);
    }
  boundaries.push(n - 1);
  if (boundaries.length > 20) {
    const step = Math.floor(boundaries.length / 20);
    const res = [boundaries[0]];
    for (let i = step; i < boundaries.length - 1; i += step)
      res.push(boundaries[i]);
    res.push(boundaries[boundaries.length - 1]);
    return res;
  }
  return boundaries;
}

function calculateSectionSimilarity(matrix, a, b) {
  let s = 0,
    c = 0;
  const step = 2;
  for (let i = a.start_frame; i < a.end_frame; i += step) {
    if (!matrix[i]) continue;
    for (let j = b.start_frame; j < b.end_frame; j += step) {
      if (matrix[i][j] !== undefined) {
        s += matrix[i][j];
        c++;
      }
    }
  }
  return c ? s / c : 0;
}

function clusterSections(matrix, boundaries) {
  const sections = [];
  const clusters = new Map();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i],
      end = boundaries[i + 1];
    if (end - start < 10) continue;
    sections.push({
      start_frame: start,
      end_frame: end,
      length: end - start,
      cluster_id: null,
    });
  }
  const thr = 0.65;
  let id = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;
    sections[i].cluster_id = id;
    clusters.set(id, [i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;
      const avg = calculateSectionSimilarity(matrix, sections[i], sections[j]);
      if (avg > thr) {
        sections[j].cluster_id = id;
        clusters.get(id).push(j);
      }
    }
    id++;
  }
  return { sections, clusters };
}

function labelSections(sections, clusters) {
  if (!sections.length) return sections;
  sections[0].section_label = 'intro';
  sections[0].section_variant = 1;
  const stats = [];
  clusters.forEach((indices, cid) => {
    const occ = indices.map((idx) => sections[idx]);
    const starts = occ.map((s) => s.start_frame);
    stats.push({
      cid,
      indices,
      count: indices.length,
      firstStart: Math.min(...starts),
    });
  });
  const byCount = stats.sort((a, b) => b.count - a.count);
  const primary = byCount[0];
  if (primary)
    primary.indices.forEach((idx, i) => {
      sections[idx].section_label = 'chorus';
      sections[idx].section_variant = i + 1;
    });
  const remaining = byCount.filter((s) => s.cid !== primary?.cid);
  if (remaining.length > 0) {
    remaining.sort((a, b) => a.firstStart - b.firstStart);
    remaining[0].indices.forEach((idx, i) => {
      sections[idx].section_label = 'verse';
      sections[idx].section_variant = i + 1;
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
  });
  if (clusters.size < 2 && sections.length > 2) {
    let t = true;
    for (let i = 1; i < sections.length; i++) {
      if (sections[i].section_label === 'outro') continue;
      sections[i].section_label = t ? 'verse' : 'chorus';
      t = !t;
    }
  }
  sections.forEach((section, idx) => {
    const L = section.section_label.toUpperCase().charAt(0);
    section.section_id = `SECTION_${L}${section.section_variant || idx + 1}`;
  });
  return sections;
}

function sliceFramesForRange(frames = [], start = 0, end = 0) {
  if (!frames || !frames.length) return [];
  return frames.filter((f) => f.timestamp >= start && f.timestamp < end);
}

function summarizeChordActivity(events = [], start = 0, end = 0) {
  const chords = events.filter(
    (ev) =>
      ev.event_type === 'chord_candidate' &&
      ev.timestamp >= start &&
      ev.timestamp < end,
  );
  const total = chords.length;
  const unique = new Set(
    chords.map(
      (c) => c.chord_candidate?.root_candidates?.[0]?.root || 'unknown',
    ),
  );
  const variety = total ? unique.size / total : 0;
  return {
    total_chords: total,
    unique_chords: unique.size,
    harmonic_variety: Number(variety.toFixed(3)),
    harmonic_stability: Number((1 - Math.min(1, variety)).toFixed(3)),
  };
}

function getTempoFromAnalysis(linear) {
  return (
    linear?.metadata?.tempo_hint ||
    linear?.beat_grid?.tempo_bpm ||
    linear?.metadata?.detected_tempo ||
    120
  );
}

function computeDurationBars(section, linear) {
  const tempo = getTempoFromAnalysis(linear);
  const beats = linear?.beat_grid?.beats_per_bar || 4;
  const secondsPerBar = (60 / tempo) * beats;
  const dur = (section.end_frame - section.start_frame) * FRAME_HOP_SECONDS;
  if (!secondsPerBar || !Number.isFinite(secondsPerBar) || secondsPerBar <= 0)
    return dur / 2;
  return dur / secondsPerBar;
}

function snapBoundariesToGrid(boundaries, linear) {
  if (!Array.isArray(boundaries) || boundaries.length === 0) return boundaries;
  const tempo = getTempoFromAnalysis(linear);
  if (!tempo) return boundaries;
  const beats = linear?.beat_grid?.beats_per_bar || 4;
  const framesPerBar = ((60 / tempo) * beats) / FRAME_HOP_SECONDS;
  if (!Number.isFinite(framesPerBar) || framesPerBar <= 0) return boundaries;
  const snapped = boundaries.map((b) =>
    Math.max(0, Math.round(Math.round(b / framesPerBar) * framesPerBar)),
  );
  snapped[0] = 0;
  snapped[snapped.length - 1] = boundaries[boundaries.length - 1];
  return snapped.filter((v, i, arr) => i === 0 || v > arr[i - 1]);
}

function getSectionDuration(section) {
  if (!section) return 0;
  return (section.end_frame - section.start_frame) * FRAME_HOP_SECONDS;
}

function cloneSection(s) {
  return {
    ...s,
    time_range: s.time_range ? { ...s.time_range } : undefined,
    semantic_signature: s.semantic_signature
      ? { ...s.semantic_signature }
      : undefined,
  };
}

function shouldMergeSections(a, b) {
  if (!a || !b) return false;
  const aDur = getSectionDuration(a),
    bDur = getSectionDuration(b);
  const short = aDur < MIN_SECTION_SECONDS || bDur < MIN_SECTION_SECONDS;
  const sameCluster = a.cluster_id !== null && a.cluster_id === b.cluster_id;
  const sameLabel =
    a.section_label && b.section_label && a.section_label === b.section_label;
  const gap = (b.start_frame - a.end_frame) * FRAME_HOP_SECONDS;
  return short || sameCluster || (sameLabel && gap < 2);
}

function mergeSemanticSignatures(a = {}, b = {}) {
  const aDur = a.duration_seconds || 0,
    bDur = b.duration_seconds || 0,
    total = aDur + bDur || 1;
  const w = (p) => ((a[p] || 0) * aDur + (b[p] || 0) * bDur) / total;
  return {
    repetition_score: Math.max(
      a.repetition_score || 0,
      b.repetition_score || 0,
    ),
    repetition_count: (a.repetition_count || 0) + (b.repetition_count || 0),
    avg_rms: w('avg_rms'),
    max_rms: Math.max(a.max_rms || 0, b.max_rms || 0),
    spectral_flux_mean: w('spectral_flux_mean'),
    spectral_flux_trend: w('spectral_flux_trend'),
    chroma_entropy_mean: w('chroma_entropy_mean'),
    vocal_ratio: w('vocal_ratio'),
    has_vocals: (w('vocal_ratio') || 0) > 0.35,
    duration_seconds: aDur + bDur,
    duration_bars: (a.duration_bars || 0) + (b.duration_bars || 0),
    is_unique: (a.is_unique && b.is_unique) || false,
  };
}

function mergeSemanticSections(sections, linear) {
  if (!Array.isArray(sections) || sections.length === 0) return sections;
  const merged = [];
  sections.forEach((s) => {
    const c = cloneSection(s);
    if (!merged.length) {
      merged.push(c);
      return;
    }
    const last = merged[merged.length - 1];
    if (shouldMergeSections(last, c)) {
      last.end_frame = c.end_frame;
      last.time_range = {
        start_time: last.start_frame * FRAME_HOP_SECONDS,
        end_time: c.end_frame * FRAME_HOP_SECONDS,
        duration_bars: computeDurationBars(last, linear),
      };
      last.semantic_signature = mergeSemanticSignatures(
        last.semantic_signature,
        c.semantic_signature,
      );
      last.section_label = last.section_label || c.section_label;
    } else merged.push(c);
  });
  merged.forEach((s) => {
    s.time_range = {
      start_time: s.start_frame * FRAME_HOP_SECONDS,
      end_time: s.end_frame * FRAME_HOP_SECONDS,
      duration_bars: computeDurationBars(s, linear),
    };
    if (s.semantic_signature) {
      s.semantic_signature.duration_seconds = getSectionDuration(s);
      s.semantic_signature.duration_bars = s.time_range.duration_bars;
    }
  });
  return merged;
}

function extractChromaFromEvents(events = []) {
  if (!events || !events.length) return [];
  return Array(100)
    .fill(0)
    .map(() =>
      Array(12)
        .fill(0)
        .map(() => Math.random()),
    );
}

async function analyzeStructure(linear, progressCallback = () => {}) {
  progressCallback(10);
  await new Promise((r) => setImmediate(r));
  const chroma =
    linear.chroma_frames && linear.chroma_frames.length
      ? linear.chroma_frames.map((f) => f.chroma || [])
      : extractChromaFromEvents(linear.events || []);
  const mfcc = linear.mfcc_frames
    ? linear.mfcc_frames.map((f) => f.mfcc || [])
    : [];
  progressCallback(30);
  const matrix = buildSimilarityMatrix(chroma, mfcc);
  progressCallback(50);
  const boundaries = detectNovelty(matrix);
  const snapped = snapBoundariesToGrid(boundaries, linear);
  progressCallback(70);
  const clustering = clusterSections(matrix, snapped);
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
        key_center: linear.metadata?.detected_key,
      },
      rhythmic_dna: { time_signature: { numerator: 4, denominator: 4 } },
      semantic_signature: s.semantic_signature || {},
    })),
  };
  progressCallback(100);
  return structural_map;
}

function attachSemanticSignatures(sections, clusters, linear) {
  const counts = new Map();
  clusters.forEach((idxs, cid) => counts.set(cid, idxs.length));
  const frames = linear?.semantic_features?.frames || [];
  return sections.map((s) => {
    const start = s.start_frame * FRAME_HOP_SECONDS;
    const end = s.end_frame * FRAME_HOP_SECONDS;
    const f = sliceFramesForRange(frames, start, end);
    const summary = summarizeFrames(f);
    const rep = counts.get(s.cluster_id) || 1;
    const durationSec = Math.max(0, end - start);
    return {
      ...s,
      semantic_signature: {
        repetition_score: Number(
          (rep / Math.max(1, sections.length)).toFixed(3),
        ),
        repetition_count: rep,
        avg_rms: summary.avg_rms,
        max_rms: summary.max_rms,
        has_vocals: summary.has_vocals,
        duration_seconds: durationSec,
      },
    };
  });
}

module.exports = {
  analyzeStructure,
  buildSimilarityMatrix,
  detectNovelty,
  clusterSections,
  labelSections,
};
/**
 * Pass 2: The Architect (Structure Detection) - CONSOLIDATED VERSION
 * Uses self-similarity matrix analysis with tuned sensitivity for pop/rock structures
 */

const { summarizeFrames } = require('./semanticUtils');
const fs = require('fs');
const path = require('path');

const FRAME_HOP_SECONDS = 0.1;
const MIN_SECTION_SECONDS = 5.0; // capture short intros/bridges
const MIN_SECTION_FRAMES = Math.round(MIN_SECTION_SECONDS / FRAME_HOP_SECONDS);

function loadConfig() {
  try {
    const configPath = path.resolve(__dirname, 'audioAnalyzerConfig.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      return {
        novelty_threshold: config.novelty_threshold ?? 0.15,
        chord_duration_min: config.chord_duration_min ?? 1.0,
      };
    }
  } catch (e) {
    // ignore
  }
  return { novelty_threshold: 0.15, chord_duration_min: 1.0 };
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    module.exports = {
      analyzeStructure,
      buildSimilarityMatrix,
      detectNovelty,
      clusterSections,
      labelSections,
    };
    if (!similarityMatrix[i]) continue;
    let score = 0;
    for (let k = 0; k < kernelSize; k++) {
      for (let m = 0; m < kernelSize; m++) {
        const pastPast = (similarityMatrix[i - k] || [])[i - m] || 0;
        const futureFuture = (similarityMatrix[i + k] || [])[i + m] || 0;
        const pastFuture = (similarityMatrix[i - k] || [])[i + m] || 0;
        const futurePast = (similarityMatrix[i + k] || [])[i - m] || 0;
        score += pastPast + futureFuture - (pastFuture + futurePast);
      }
    }
    novelty[i] = score / (kernelSize * kernelSize);
  }
  const smoothSec = 2.0;
  const smoothWindow = Math.max(3, Math.round(smoothSec / FRAME_HOP_SECONDS));
  const smoothed = smoothSeries(novelty, smoothWindow);
  const medianFiltered = applyMedianFilter(
    smoothed,
    Math.round(3 / FRAME_HOP_SECONDS),
  );
  const cfg = loadConfig();
  const baseThreshold = cfg.novelty_threshold * 1.0 || 0.15;
  function pickPeaksWithThreshold(thresh) {
    const picks = [0];
    for (let i = 1; i < medianFiltered.length - 1; i++) {
      if (
        medianFiltered[i] > thresh &&
        medianFiltered[i] > medianFiltered[i - 1] &&
        medianFiltered[i] > medianFiltered[i + 1]
      ) {
        const lastBoundary = picks[picks.length - 1];
        if (i - lastBoundary >= MIN_SECTION_FRAMES) picks.push(i);
      }
    }
    picks.push(n - 1);
    return picks;
  }
  let picks = pickPeaksWithThreshold(baseThreshold);
  if (picks.length <= 2) {
    const fallbackThreshold = Math.max(
      baseThreshold * 0.6,
      baseThreshold - 0.05,
    );
    console.log(
      'Architect: Under-segmented with threshold',
      baseThreshold.toFixed(3),
      ', retrying with',
      fallbackThreshold.toFixed(3),
    );
    picks = pickPeaksWithThreshold(fallbackThreshold);
  }
  for (let i = 1; i < picks.length - 1; i++) boundaries.push(picks[i]);
  boundaries.push(n - 1);
  if (boundaries.length > 20) {
    const step = Math.floor(boundaries.length / 20);
    const limited = [boundaries[0]];
    for (let i = step; i < boundaries.length - 1; i += step)
      limited.push(boundaries[i]);
    limited.push(boundaries[boundaries.length - 1]);
    return limited;
  }
  console.log(
    `Architect: Detected ${boundaries.length} segments using threshold ${baseThreshold.toFixed(3)}`,
  );
  return boundaries;
}

function calculateSectionSimilarity(matrix, sectionA, sectionB) {
  let sum = 0,
    count = 0;
  const step = 2;
  for (let i = sectionA.start_frame; i < sectionA.end_frame; i += step) {
    if (!matrix[i]) continue;
    for (let j = sectionB.start_frame; j < sectionB.end_frame; j += step) {
      if (matrix[i][j] !== undefined) {
        sum += matrix[i][j];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

function clusterSections(similarityMatrix, boundaries) {
  const sections = [];
  const clusters = new Map();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end - start < 10) continue;
    sections.push({
      start_frame: start,
      end_frame: end,
      length: end - start,
      cluster_id: null,
    });
  }
  const similarityThreshold = 0.65;
  let clusterId = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;
    sections[i].cluster_id = clusterId;
    clusters.set(clusterId, [i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;
      const avgSimilarity = calculateSectionSimilarity(
        similarityMatrix,
        sections[i],
        sections[j],
      );
      if (avgSimilarity > similarityThreshold) {
        sections[j].cluster_id = clusterId;
        clusters.get(clusterId).push(j);
      }
    }
    clusterId++;
  }
  return { sections, clusters };
}

function labelSections(sections, clusters) {
  if (sections.length > 0) {
    sections[0].section_label = 'intro';
    sections[0].section_variant = 1;
  }
  const clusterStats = [];
  clusters.forEach((indices, clusterId) => {
    const occurrences = indices.map((idx) => sections[idx]);
    const starts = occurrences.map((s) => s.start_frame);
    clusterStats.push({
      clusterId,
      indices,
      count: indices.length,
      firstStart: Math.min(...starts),
    });
  });
  const sortedByCount = [...clusterStats].sort((a, b) => b.count - a.count);
  const primaryCluster = sortedByCount[0];
  if (primaryCluster)
    primaryCluster.indices.forEach((idx, i) => {
      sections[idx].section_label = 'chorus';
      sections[idx].section_variant = i + 1;
    });
  const remaining = sortedByCount.filter(
    (c) => c.clusterId !== primaryCluster?.clusterId,
  );
  if (remaining.length > 0) {
    remaining.sort((a, b) => a.firstStart - b.firstStart);
    const verse = remaining[0];
    verse.indices.forEach((idx, i) => {
      sections[idx].section_label = 'verse';
      sections[idx].section_variant = i + 1;
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
  });
  if (clusters.size < 2 && sections.length > 2) {
    let labelToggle = true;
    for (let i = 1; i < sections.length; i++) {
      if (sections[i].section_label === 'outro') continue;
      sections[i].section_label = labelToggle ? 'verse' : 'chorus';
      labelToggle = !labelToggle;
    }
  }
  sections.forEach((section, idx) => {
    const label = section.section_label.toUpperCase().charAt(0);
    section.section_id = `SECTION_${label}${section.section_variant || idx + 1}`;
  });
  return sections;
}

function sliceFramesForRange(frames, start, end) {
  if (!frames || !frames.length) return [];
  return frames.filter(
    (frame) => frame.timestamp >= start && frame.timestamp < end,
  );
}

function summarizeChordActivity(events = [], startTime = 0, endTime = 0) {
  const chords = events.filter(
    (event) =>
      event.event_type === 'chord_candidate' &&
      event.timestamp >= startTime &&
      event.timestamp < endTime,
  );
  const totalChords = chords.length;
  const uniqueSet = new Set(
    chords.map(
      (event) => event.chord_candidate?.root_candidates?.[0]?.root || 'unknown',
    ),
  );
  const harmonicVariety = totalChords ? uniqueSet.size / totalChords : 0;
  const harmonicStability = 1 - Math.min(1, harmonicVariety);
  return {
    total_chords: totalChords,
    unique_chords: uniqueSet.size,
    harmonic_variety: Number(harmonicVariety.toFixed(3)),
    harmonic_stability: Number(harmonicStability.toFixed(3)),
  };
}

function getTempoFromAnalysis(linearAnalysis) {
  return (
    linearAnalysis?.metadata?.tempo_hint ||
    linearAnalysis?.beat_grid?.tempo_bpm ||
    linearAnalysis?.metadata?.detected_tempo ||
    120
  );
}

function computeDurationBars(section, linearAnalysis) {
  const tempo = getTempoFromAnalysis(linearAnalysis);
  const beatsPerBar = linearAnalysis?.beat_grid?.beats_per_bar || 4;
  const secondsPerBar = (60 / tempo) * beatsPerBar;
  const durationSeconds = getSectionDuration(section);
  if (!secondsPerBar || !Number.isFinite(secondsPerBar) || secondsPerBar <= 0)
    return durationSeconds / 2;
  return durationSeconds / secondsPerBar;
}

function snapBoundariesToGrid(boundaries, linearAnalysis) {
  if (!Array.isArray(boundaries) || boundaries.length === 0) return boundaries;
  const tempo = getTempoFromAnalysis(linearAnalysis);
  if (!tempo) return boundaries;
  const beatsPerBar = linearAnalysis?.beat_grid?.beats_per_bar || 4;
  const secondsPerBar = (60 / tempo) * beatsPerBar;
  const framesPerBar = secondsPerBar / FRAME_HOP_SECONDS;
  if (!Number.isFinite(framesPerBar) || framesPerBar <= 0) return boundaries;
  const snapped = boundaries.map((frame) => {
    const snappedFrame = Math.round(frame / framesPerBar) * framesPerBar;
    return Math.max(0, Math.round(snappedFrame));
  });
  snapped[0] = 0;
  snapped[snapped.length - 1] = boundaries[boundaries.length - 1];
  return snapped.filter(
    (value, index, array) => index === 0 || value > array[index - 1],
  );
}

function getSectionDuration(section) {
  if (!section) return 0;
  const durationFrames = section.end_frame - section.start_frame || 0;
  return durationFrames * FRAME_HOP_SECONDS;
}

function cloneSection(section) {
  return {
    ...section,
    time_range: section.time_range ? { ...section.time_range } : undefined,
    semantic_signature: section.semantic_signature
      ? { ...section.semantic_signature }
      : undefined,
  };
}

function shouldMergeSections(prev, next) {
  if (!prev || !next) return false;
  const prevDuration = getSectionDuration(prev);
  const nextDuration = getSectionDuration(next);
  const short =
    prevDuration < MIN_SECTION_SECONDS || nextDuration < MIN_SECTION_SECONDS;
  const sameCluster =
    prev.cluster_id !== undefined &&
    prev.cluster_id !== null &&
    prev.cluster_id === next.cluster_id;
  const sameLabel =
    prev.section_label &&
    next.section_label &&
    prev.section_label === next.section_label;
  const gapSeconds = (next.start_frame - prev.end_frame) * FRAME_HOP_SECONDS;
  return short || sameCluster || (sameLabel && gapSeconds < 2);
}

function mergeSemanticSignatures(a = {}, b = {}) {
  const durationA = a.duration_seconds || 0;
  const durationB = b.duration_seconds || 0;
  const total = durationA + durationB || 1;
  const weightedAverage = (prop) =>
    ((a[prop] || 0) * durationA + (b[prop] || 0) * durationB) / total;
  return {
    repetition_score: Math.max(
      a.repetition_score || 0,
      b.repetition_score || 0,
    ),
    repetition_count: (a.repetition_count || 0) + (b.repetition_count || 0),
    avg_rms: weightedAverage('avg_rms'),
    max_rms: Math.max(a.max_rms || 0, b.max_rms || 0),
    spectral_flux_mean: weightedAverage('spectral_flux_mean'),
    spectral_flux_trend: weightedAverage('spectral_flux_trend'),
    chroma_entropy_mean: weightedAverage('chroma_entropy_mean'),
    vocal_ratio: weightedAverage('vocal_ratio'),
    has_vocals: (weightedAverage('vocal_ratio') || 0) > 0.35,
    energy_slope: weightedAverage('energy_slope'),
    harmonic_stability: weightedAverage('harmonic_stability'),
    harmonic_variety: weightedAverage('harmonic_variety'),
    chord_unique: (a.chord_unique || 0) + (b.chord_unique || 0),
    chord_total: (a.chord_total || 0) + (b.chord_total || 0),
    duration_seconds: durationA + durationB,
    duration_bars: (a.duration_bars || 0) + (b.duration_bars || 0),
    position_ratio: a.position_ratio ?? b.position_ratio,
    is_unique: (a.is_unique && b.is_unique) || false,
    semantic_label: a.semantic_label || b.semantic_label,
  };
}

function mergeSemanticSections(sections, linearAnalysis) {
  if (!Array.isArray(sections) || sections.length === 0) return sections;
  const merged = [];
  sections.forEach((section) => {
    const clone = cloneSection(section);
    if (!merged.length) {
      merged.push(clone);
      return;
    }
    const last = merged[merged.length - 1];
    if (shouldMergeSections(last, clone)) {
      last.end_frame = clone.end_frame;
      last.time_range = {
        start_time: last.start_frame * FRAME_HOP_SECONDS,
        end_time: clone.end_frame * FRAME_HOP_SECONDS,
        duration_bars: computeDurationBars(last, linearAnalysis),
      };
      last.semantic_signature = mergeSemanticSignatures(
        last.semantic_signature,
        clone.semantic_signature,
      );
      last.section_label = last.section_label || clone.section_label;
    } else {
      merged.push(clone);
    }
  });
  merged.forEach((section) => {
    section.time_range = {
      start_time: section.start_frame * FRAME_HOP_SECONDS,
      end_time: section.end_frame * FRAME_HOP_SECONDS,
      duration_bars: computeDurationBars(section, linearAnalysis),
    };
    if (section.semantic_signature) {
      section.semantic_signature.duration_seconds = getSectionDuration(section);
      section.semantic_signature.duration_bars =
        section.time_range.duration_bars;
    }
  });
  return merged;
}

function extractChromaFromEvents(events) {
  return Array(100)
    .fill(0)
    .map(() =>
      Array(12)
        .fill(0)
        .map(() => Math.random()),
    );
}

async function analyzeStructure(linearAnalysis, progressCallback = () => {}) {
  progressCallback(10);
  await new Promise((resolve) => setImmediate(resolve));
  let chromaFeatures = [];
  if (linearAnalysis.chroma_frames && linearAnalysis.chroma_frames.length > 0)
    chromaFeatures = linearAnalysis.chroma_frames.map(
      (frame) => frame.chroma || [],
    );
  else chromaFeatures = extractChromaFromEvents(linearAnalysis.events || []);
  let mfccFeatures = [];
  if (linearAnalysis.mfcc_frames)
    mfccFeatures = linearAnalysis.mfcc_frames.map((frame) => frame.mfcc || []);
  progressCallback(30);
  const similarityMatrix = buildSimilarityMatrix(chromaFeatures, mfccFeatures);
  progressCallback(50);
  const boundaries = detectNovelty(similarityMatrix);
  const snappedBoundaries = snapBoundariesToGrid(boundaries, linearAnalysis);
  progressCallback(70);
  const clusteringResult = clusterSections(similarityMatrix, snappedBoundaries);
  const labeledSections = labelSections(
    clusteringResult.sections,
    clusteringResult.clusters,
  );
  const enrichedSections = attachSemanticSignatures(
    labeledSections,
    clusteringResult.clusters,
    linearAnalysis,
  );
  const mergedSections = mergeSemanticSections(
    enrichedSections,
    linearAnalysis,
  );
  progressCallback(90);
  const structural_map = {
    sections: mergedSections.map((section) => ({
      section_id: section.section_id,
      section_label: section.section_label,
      section_variant: section.section_variant || 1,
      time_range: {
        start_time: section.start_frame * FRAME_HOP_SECONDS,
        end_time: section.end_frame * FRAME_HOP_SECONDS,
        duration_bars: computeDurationBars(section, linearAnalysis),
      },
      harmonic_dna: {
        progression: [],
        key_center: linearAnalysis.metadata?.detected_key,
      },
      rhythmic_dna: { time_signature: { numerator: 4, denominator: 4 } },
      semantic_signature: section.semantic_signature || {},
    })),
  };
  progressCallback(100);
  console.log(
    'Architect: Returning structural_map with',
    structural_map.sections.length,
    'sections',
  );
  if (structural_map.sections.length === 0) {
    console.warn(
      'Architect: No sections detected, creating placeholder section',
    );
    structural_map.sections = [
      {
        section_id: 'section-1',
        section_label: 'verse',
        section_variant: 1,
        time_range: {
          start_time: 0,
          end_time: linearAnalysis.metadata?.duration_seconds || 30,
          duration_bars: (linearAnalysis.metadata?.duration_seconds || 30) / 2,
        },
        harmonic_dna: {
          progression: [],
          key_center: linearAnalysis.metadata?.detected_key || 'C',
        },
        semantic_signature: {
          repetition_score: 1,
          repetition_count: 1,
          avg_rms: 0,
          max_rms: 0,
          has_vocals: false,
          duration_seconds: linearAnalysis.metadata?.duration_seconds || 30,
        },
      },
    ];
  }
  return structural_map;
}

module.exports = {
  analyzeStructure,
  buildSimilarityMatrix,
  detectNovelty,
  clusterSections,
  labelSections,
};
/**
 * Pass 2: The Architect (Structure Detection) - TUNED VERSION
 * CRITICAL: Identifies sections (Intro, Verse, Chorus, Bridge, etc.)
 * Uses self-similarity matrix analysis with tuned sensitivity for pop/rock structures
 */

const { summarizeFrames } = require('./semanticUtils');
const fs = require('fs');
const path = require('path');

// TUNING: More sensitive settings for accurate segmentation
const FRAME_HOP_SECONDS = 0.1;
const MIN_SECTION_SECONDS = 5.0; // Reduced from 12s to capture short intros/bridges
const MIN_SECTION_FRAMES = Math.round(MIN_SECTION_SECONDS / FRAME_HOP_SECONDS);

function loadConfig() {
  try {
    const configPath = path.resolve(__dirname, 'audioAnalyzerConfig.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      return {
        novelty_threshold: config.novelty_threshold ?? 0.15,
        chord_duration_min: config.chord_duration_min ?? 1.0,
      };
    }
  } catch (e) {
    // ignore
  }
  return {
    novelty_threshold: 0.15,
    chord_duration_min: 1.0,
  };
}

function buildSimilarityMatrix(chromaFeatures, mfccFeatures = null) {
  const matrix = [];
  const n = chromaFeatures.length;
  const useTimbre = mfccFeatures && mfccFeatures.length === n;

  // Optimization: Sample the matrix calculation if too large
  const step = n > 3000 ? 2 : 1;

  for (let i = 0; i < n; i += step) {
    matrix[i] = [];
    for (let j = 0; j < n; j += step) {
      const chromaSim = cosineSimilarity(
        chromaFeatures[i] || [],
        chromaFeatures[j] || [],
      );
      let mfccSim = 0;
      if (useTimbre && mfccFeatures[i] && mfccFeatures[j]) {
        mfccSim = cosineSimilarity(mfccFeatures[i], mfccFeatures[j]);
      }
      const combinedSim = useTimbre
        ? 0.6 * chromaSim + 0.4 * mfccSim
        : chromaSim;
      matrix[i][j] = combinedSim;
      if (step > 1 && i + 1 < n) matrix[i + 1] = matrix[i + 1] || [];
    }
  }
  return matrix;
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function detectNovelty(similarityMatrix) {
  const n = similarityMatrix.length;
  const boundaries = [0];
  const novelty = new Array(n).fill(0);
  const kernelSize = 30; // ~3 seconds

  for (let i = kernelSize; i < n - kernelSize; i++) {
    if (!similarityMatrix[i]) continue;
    let checkerboardScore = 0;
    for (let k = 0; k < kernelSize; k++) {
      for (let m = 0; m < kernelSize; m++) {
        const pastPast = (similarityMatrix[i - k] || [])[i - m] || 0;
        const futureFuture = (similarityMatrix[i + k] || [])[i + m] || 0;
        const pastFuture = (similarityMatrix[i - k] || [])[i + m] || 0;
        const futurePast = (similarityMatrix[i + k] || [])[i - m] || 0;
        checkerboardScore +=
          pastPast + futureFuture - (pastFuture + futurePast);
      }
    }
    novelty[i] = checkerboardScore / (kernelSize * kernelSize);
  }

  const smoothingWindowSeconds = 2.0; // preserve sharp transitions
  const smoothingWindow = Math.max(
    3,
    Math.round(smoothingWindowSeconds / FRAME_HOP_SECONDS),
  );
  const smoothedNovelty = smoothSeries(novelty, smoothingWindow);
  const medianFiltered = applyMedianFilter(
    smoothedNovelty,
    Math.round(3 / FRAME_HOP_SECONDS),
  );

  const config = loadConfig();
  const threshold = config.novelty_threshold * 1.0;
  for (let i = 1; i < medianFiltered.length - 1; i++) {
    if (
      medianFiltered[i] > threshold &&
      medianFiltered[i] > medianFiltered[i - 1] &&
      medianFiltered[i] > medianFiltered[i + 1]
    ) {
      const lastBoundary = boundaries[boundaries.length - 1];
      if (i - lastBoundary >= MIN_SECTION_FRAMES) {
        boundaries.push(i);
      }
    }
  }

  boundaries.push(n - 1);
  if (boundaries.length > 20) {
    const step = Math.floor(boundaries.length / 20);
    const limited = [boundaries[0]];
    for (let i = step; i < boundaries.length - 1; i += step)
      limited.push(boundaries[i]);
    limited.push(boundaries[boundaries.length - 1]);
    return limited;
  }
  console.log(
    `Architect: Detected ${boundaries.length} segments using threshold ${threshold.toFixed(3)}`,
  );
  return boundaries;
}

function clusterSections(similarityMatrix, boundaries) {
  const sections = [];
  const clusters = new Map();
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end - start < 10) continue;
    sections.push({
      start_frame: start,
      end_frame: end,
      length: end - start,
      cluster_id: null,
    });
  }
  const similarityThreshold = 0.65; // tuned
  let clusterId = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;
    sections[i].cluster_id = clusterId;
    clusters.set(clusterId, [i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;
      const avgSimilarity = calculateSectionSimilarity(
        similarityMatrix,
        sections[i],
        sections[j],
      );
      if (avgSimilarity > similarityThreshold) {
        sections[j].cluster_id = clusterId;
        clusters.get(clusterId).push(j);
      }
    }
    clusterId++;
  }
  return { sections, clusters };
}

function calculateSectionSimilarity(matrix, sectionA, sectionB) {
  let sum = 0,
    count = 0;
  const step = 2;
  for (let i = sectionA.start_frame; i < sectionA.end_frame; i += step) {
    if (!matrix[i]) continue;
    for (let j = sectionB.start_frame; j < sectionB.end_frame; j += step) {
      if (matrix[i][j] !== undefined) {
        sum += matrix[i][j];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

function labelSections(sections, clusters) {
  if (sections.length > 0) {
    sections[0].section_label = 'intro';
    sections[0].section_variant = 1;
  }
  const clusterStats = [];
  clusters.forEach((indices, clusterId) => {
    const occurrences = indices.map((idx) => sections[idx]);
    const starts = occurrences.map((section) => section.start_frame);
    clusterStats.push({
      clusterId,
      indices,
      count: indices.length,
      firstStart: Math.min(...starts),
    });
  });
  const sortedByCount = [...clusterStats].sort((a, b) => b.count - a.count);
  const primaryCluster = sortedByCount[0];
  if (primaryCluster)
    primaryCluster.indices.forEach((idx, i) => {
      sections[idx].section_label = 'chorus';
      sections[idx].section_variant = i + 1;
    });
  const remainingClusters = sortedByCount.filter(
    (c) => c.clusterId !== primaryCluster?.clusterId,
  );
  if (remainingClusters.length > 0) {
    remainingClusters.sort((a, b) => a.firstStart - b.firstStart);
    const verseCluster = remainingClusters[0];
    verseCluster.indices.forEach((idx, i) => {
      sections[idx].section_label = 'verse';
      sections[idx].section_variant = i + 1;
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
  });
  if (clusters.size < 2 && sections.length > 2) {
    let labelToggle = true;
    for (let i = 1; i < sections.length; i++) {
      if (sections[i].section_label === 'outro') continue;
      sections[i].section_label = labelToggle ? 'verse' : 'chorus';
      labelToggle = !labelToggle;
    }
  }
  sections.forEach((section, idx) => {
    const label = section.section_label.toUpperCase().charAt(0);
    section.section_id = `SECTION_${label}${section.section_variant || idx + 1}`;
  });
  return sections;
}

function attachSemanticSignatures(sections, clusters, linearAnalysis) {
  const clusterCounts = new Map();
  clusters.forEach((indices, clusterId) =>
    clusterCounts.set(clusterId, indices.length),
  );
  const semanticFrames = linearAnalysis?.semantic_features?.frames || [];
  const events = linearAnalysis?.events || [];
  return sections.map((section) => {
    const startTime = section.start_frame * FRAME_HOP_SECONDS;
    const endTime = section.end_frame * FRAME_HOP_SECONDS;
    const frames = sliceFramesForRange(semanticFrames, startTime, endTime);
    const frameSummary = summarizeFrames(frames);
    const repetitionCount = clusterCounts.get(section.cluster_id) || 1;
    const repetitionScore = sections.length
      ? repetitionCount / sections.length
      : 0;
    const durationSeconds = Math.max(0, endTime - startTime);
    return {
      ...section,
      semantic_signature: {
        repetition_score: Number(repetitionScore.toFixed(3)),
        repetition_count: repetitionCount,
        avg_rms: frameSummary.avg_rms,
        max_rms: frameSummary.max_rms,
        has_vocals: frameSummary.has_vocals,
        duration_seconds: durationSeconds,
        is_unique: repetitionCount === 1,
      },
    };
  });
}

function sliceFramesForRange(frames, start, end) {
  if (!frames || !frames.length) return [];
  return frames.filter(
    (frame) => frame.timestamp >= start && frame.timestamp < end,
  );
}

function computeDurationBars(section, linearAnalysis) {
  const tempo = linearAnalysis?.beat_grid?.tempo_bpm || 120;
  const secondsPerBar = (60 / tempo) * 4;
  const durationSeconds =
    (section.end_frame - section.start_frame) * FRAME_HOP_SECONDS;
  return durationSeconds / secondsPerBar;
}

function snapBoundariesToGrid(boundaries, linearAnalysis) {
  if (!Array.isArray(boundaries) || boundaries.length === 0) return boundaries;
  const tempo = linearAnalysis?.beat_grid?.tempo_bpm;
  if (!tempo) return boundaries;
  const secondsPerBar = (60 / tempo) * 4;
  const framesPerBar = secondsPerBar / FRAME_HOP_SECONDS;
  const snapped = boundaries.map((frame) => {
    const snappedFrame = Math.round(frame / framesPerBar) * framesPerBar;
    return Math.max(0, Math.round(snappedFrame));
  });
  snapped[0] = 0;
  snapped[snapped.length - 1] = boundaries[boundaries.length - 1];
  return snapped.filter(
    (value, index, array) => index === 0 || value > array[index - 1],
  );
}

function mergeSemanticSections(sections, linearAnalysis) {
  if (!Array.isArray(sections) || sections.length === 0) return sections;
  const merged = [];
  sections.forEach((section) => {
    const clone = { ...section };
    if (!merged.length) {
      merged.push(clone);
      return;
    }
    const last = merged[merged.length - 1];
    const gapSeconds = (clone.start_frame - last.end_frame) * FRAME_HOP_SECONDS;
    const sameLabel = last.section_label === clone.section_label;
    if (sameLabel && gapSeconds < 2.0) {
      last.end_frame = clone.end_frame;
      last.length += clone.length;
    } else {
      merged.push(clone);
    }
  });
  return merged;
}

function smoothSeries(series = [], windowSize = 5) {
  if (windowSize <= 1) return series;
  const half = Math.floor(windowSize / 2);
  return series.map((value, index) => {
    let sum = 0,
      count = 0;
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

function applyMedianFilter(series = [], windowSize = 5) {
  if (windowSize <= 1) return series;
  const half = Math.floor(windowSize / 2);
  return series.map((value, index) => {
    const window = [];
    for (let offset = -half; offset <= half; offset++) {
      const sampleIndex = index + offset;
      if (sampleIndex >= 0 && sampleIndex < series.length)
        window.push(series[sampleIndex]);
    }
    if (window.length === 0) return value;
    window.sort((a, b) => a - b);
    const mid = Math.floor(window.length / 2);
    return window.length % 2 === 0
      ? (window[mid - 1] + window[mid]) / 2
      : window[mid];
  });
}

function getSectionDuration(section) {
  if (!section) return 0;
  const durationFrames = section.end_frame - section.start_frame || 0;
  return durationFrames * FRAME_HOP_SECONDS;
}

function extractChromaFromEvents(events) {
  return Array(100)
    .fill(0)
    .map(() =>
      Array(12)
        .fill(0)
        .map(() => Math.random()),
    );
}

async function analyzeStructure(linearAnalysis, progressCallback = () => {}) {
  progressCallback(10);
  await new Promise((resolve) => setImmediate(resolve));
  let chromaFeatures = [];
  if (linearAnalysis.chroma_frames && linearAnalysis.chroma_frames.length > 0)
    chromaFeatures = linearAnalysis.chroma_frames.map(
      (frame) => frame.chroma || [],
    );
  else chromaFeatures = extractChromaFromEvents(linearAnalysis.events || []);
  let mfccFeatures = [];
  if (linearAnalysis.mfcc_frames)
    mfccFeatures = linearAnalysis.mfcc_frames.map((frame) => frame.mfcc || []);
  progressCallback(30);
  const similarityMatrix = buildSimilarityMatrix(chromaFeatures, mfccFeatures);
  progressCallback(50);
  const boundaries = detectNovelty(similarityMatrix);
  const snappedBoundaries = snapBoundariesToGrid(boundaries, linearAnalysis);
  progressCallback(70);
  const clusteringResult = clusterSections(similarityMatrix, snappedBoundaries);
  const labeledSections = labelSections(
    clusteringResult.sections,
    clusteringResult.clusters,
  );
  const enrichedSections = attachSemanticSignatures(
    labeledSections,
    clusteringResult.clusters,
    linearAnalysis,
  );
  const mergedSections = mergeSemanticSections(
    enrichedSections,
    linearAnalysis,
  );
  progressCallback(90);
  const structural_map = {
    sections: mergedSections.map((section) => ({
      section_id: section.section_id,
      section_label: section.section_label,
      section_variant: section.section_variant || 1,
      time_range: {
        start_time: section.start_frame * FRAME_HOP_SECONDS,
        end_time: section.end_frame * FRAME_HOP_SECONDS,
        duration_bars: computeDurationBars(section, linearAnalysis),
      },
      harmonic_dna: {
        progression: [],
        key_center: linearAnalysis.metadata?.detected_key,
      },
      rhythmic_dna: { time_signature: { numerator: 4, denominator: 4 } },
      semantic_signature: section.semantic_signature || {},
    })),
  };
  progressCallback(100);
  console.log(
    'Architect: Returning structural_map with',
    structural_map.sections.length,
    'sections',
  );
  return structural_map;
}

module.exports = {
  analyzeStructure,
  buildSimilarityMatrix,
  detectNovelty,
  clusterSections,
  labelSections,
};
/**
 * Pass 2: The Architect (Structure Detection)
 * CRITICAL: Identifies sections (Intro, Verse, Chorus, Bridge, etc.)
 * Uses self-similarity matrix analysis
 */

const { summarizeFrames } = require('./semanticUtils');
const fs = require('fs');
const path = require('path');

const FRAME_HOP_SECONDS = 0.1;
// Tuned for pop/rock segmentation; allow shorter intros/bridges
const MIN_SECTION_SECONDS = 5.0;
const MIN_SECTION_FRAMES = Math.round(MIN_SECTION_SECONDS / FRAME_HOP_SECONDS);

function loadConfig() {
  const configPath = path.resolve(__dirname, 'audioAnalyzerConfig.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    return {
      novelty_threshold: config.novelty_threshold ?? 0.15,
      chord_duration_min: config.chord_duration_min ?? 1.0,
    };
  } catch {
    return {
      novelty_threshold: 0.15,
      chord_duration_min: 1.0,
    };
  }
}

/**
 * Build self-similarity matrix from chroma and MFCC features
 * Uses combined chroma (harmonic) + MFCC (timbre) for better section discrimination
 * @param {Array} chromaFeatures - Array of chroma feature vectors (12-dim)
 * @param {Array} mfccFeatures - Array of MFCC feature vectors (13-dim, optional)
 * @returns {Array<Array<number>>} Self-similarity matrix
 */
function buildSimilarityMatrix(chromaFeatures, mfccFeatures = null) {
  const matrix = [];
  const n = chromaFeatures.length;
  const useTimbre = mfccFeatures && mfccFeatures.length === n;

  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      // Harmonic similarity (chroma)
      const chromaSim = cosineSimilarity(
        chromaFeatures[i] || [],
        chromaFeatures[j] || [],
      );

      // Timbre similarity (MFCC) - helps distinguish sections with same harmony but different instruments
      let mfccSim = 0;
      if (useTimbre && mfccFeatures[i] && mfccFeatures[j]) {
        mfccSim = cosineSimilarity(mfccFeatures[i], mfccFeatures[j]);
      }

      // Combined similarity: 60% harmonic, 40% timbre
      // This allows detection of sections that have same chords but different instrumentation
      const combinedSim = useTimbre
        ? 0.6 * chromaSim + 0.4 * mfccSim
        : chromaSim;

      matrix[i][j] = combinedSim;
    }
  }

  return matrix;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Detect novelty (section boundaries) from similarity matrix
 * @param {Array<Array<number>>} similarityMatrix - Self-similarity matrix
 * @returns {Array<number>} Array of boundary timestamps (in frames)
 */
function detectNovelty(similarityMatrix) {
  const n = similarityMatrix.length;
  const boundaries = [0]; // Start is always a boundary
  const minSegmentLength = MIN_SECTION_FRAMES;

  // Kernel size: Look roughly 3 seconds into past/future (30 frames @ 0.1s)
  const kernelSize = 30;

  // 1. Calculate Checkerboard Novelty Function
  const novelty = new Array(n).fill(0);
  for (let i = kernelSize; i < n - kernelSize; i++) {
    let checkerboardScore = 0;
    for (let k = 0; k < kernelSize; k++) {
      for (let m = 0; m < kernelSize; m++) {
        const pastPast = similarityMatrix[i - k]?.[i - m] ?? 0;
        const futureFuture = similarityMatrix[i + k]?.[i + m] ?? 0;
        const pastFuture = similarityMatrix[i - k]?.[i + m] ?? 0;
        const futurePast = similarityMatrix[i + k]?.[i - m] ?? 0;
        checkerboardScore +=
          pastPast + futureFuture - (pastFuture + futurePast);
      }
    }
    novelty[i] = checkerboardScore / (kernelSize * kernelSize);
  }

  // 2. Smoothing (2 seconds -> preserves local peaks)
  const smoothingWindowSeconds = 2.0;
  const smoothingWindow = Math.max(
    3,
    Math.round(smoothingWindowSeconds / FRAME_HOP_SECONDS),
  );
  const smoothedNovelty = smoothSeries(novelty, smoothingWindow);

  const medianFiltered = applyMedianFilter(
    smoothedNovelty,
    Math.round(3 / FRAME_HOP_SECONDS),
  );

  // 3. Peak Picking (less aggressive threshold)
  const config = loadConfig();
  const baseThreshold = config.novelty_threshold * 1.0;
  function pickPeaksWithThreshold(thresh) {
    const picks = [0];
    for (let i = 1; i < medianFiltered.length - 1; i++) {
      if (
        medianFiltered[i] > thresh &&
        medianFiltered[i] > medianFiltered[i - 1] &&
        medianFiltered[i] > medianFiltered[i + 1]
      ) {
        const lastBoundary = picks[picks.length - 1];
        if (i - lastBoundary >= minSegmentLength) {
          picks.push(i);
        }
      }
    }
    picks.push(medianFiltered.length - 1);
    return picks;
  }

  // Try primary picks
  let picks = pickPeaksWithThreshold(baseThreshold);

  // If too few picks (likely under-segmentation), try a more sensitive threshold
  if (picks.length <= 2) {
    const fallbackThreshold = Math.max(
      baseThreshold * 0.6,
      baseThreshold - 0.05,
    );
    console.log(
      'Architect: Under-segmented with threshold',
      baseThreshold.toFixed(3),
      ', retrying with',
      fallbackThreshold.toFixed(3),
    );
    picks = pickPeaksWithThreshold(fallbackThreshold);
  }

  // commit picks
  for (let i = 1; i < picks.length - 1; i++) {
    boundaries.push(picks[i]);
  }

  boundaries.push(n - 1);

  // Limit to reasonable max sections
  if (boundaries.length > 20) {
    const step = Math.floor(boundaries.length / 20);
    const limited = [boundaries[0]];
    for (let i = step; i < boundaries.length - 1; i += step) {
      limited.push(boundaries[i]);
    }
    limited.push(boundaries[boundaries.length - 1]);
    return limited;
  }

  console.log(
    `Architect: Detected ${boundaries.length} segments using threshold ${threshold.toFixed(3)}`,
  );
  return boundaries;
}

/**
 * Cluster similar sections together
 * @param {Array<Array<number>>} similarityMatrix - Self-similarity matrix
 * @param {Array<number>} boundaries - Section boundaries
 * @returns {Array<Object>} Clustered sections with labels
 */
function clusterSections(similarityMatrix, boundaries) {
  const sections = [];
  const clusters = new Map();

  // Extract section segments
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const section = {
      start_frame: start,
      end_frame: end,
      length: end - start,
      cluster_id: null,
    };
    sections.push(section);
  }

  // Cluster similar sections using average similarity
  // Lowered threshold to 0.65 to group loose verse variants
  const similarityThreshold = 0.65;
  let clusterId = 0;

  for (let i = 0; i < sections.length; i++) {
    if (sections[i].cluster_id !== null) continue;

    sections[i].cluster_id = clusterId;
    clusters.set(clusterId, [i]);

    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].cluster_id !== null) continue;

      // Calculate average similarity between sections
      const avgSimilarity = calculateSectionSimilarity(
        similarityMatrix,
        sections[i],
        sections[j],
      );

      if (avgSimilarity > similarityThreshold) {
        sections[j].cluster_id = clusterId;
        clusters.get(clusterId).push(j);
      }
    }

    clusterId++;
  }

  return { sections, clusters };
}

/**
 * Calculate average similarity between two sections
 */
function calculateSectionSimilarity(matrix, sectionA, sectionB) {
  let sum = 0;
  let count = 0;

  for (let i = sectionA.start_frame; i < sectionA.end_frame; i++) {
    for (let j = sectionB.start_frame; j < sectionB.end_frame; j++) {
      sum += matrix[i][j];
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Label sections using heuristics
 * CRITICAL: This identifies Intro, Verse, Chorus, Bridge, etc.
 */
function labelSections(sections, clusters) {
  const labeledSections = [];

  // Heuristic 1: First section is usually intro
  if (sections.length > 0) {
    sections[0].section_label = 'intro';
    sections[0].section_variant = 1;
  }

  // Heuristic 2: Most repeated cluster is usually chorus
  const clusterStats = [];
  clusters.forEach((indices, clusterId) => {
    const occurrences = indices.map((idx) => sections[idx]);
    const lengths = occurrences.map((section) => section.length);
    const starts = occurrences.map((section) => section.start_frame);
    clusterStats.push({
      clusterId,
      indices,
      count: indices.length,
      totalLength: lengths.reduce((a, b) => a + b, 0),
      longestSectionLength: Math.max(...lengths),
      firstStart: Math.min(...starts),
      avgStart: starts.reduce((a, b) => a + b, 0) / starts.length,
    });
  });

  const introEndFrame = sections[0]?.end_frame || 0;
  const sortedByFirst = [...clusterStats].sort(
    (a, b) => a.firstStart - b.firstStart,
  );
  const verseClusterStat =
    sortedByFirst.find((stat) => stat.firstStart >= introEndFrame) ||
    sortedByFirst[0];

  const sortedChorusCandidates = [...clusterStats]
    .filter((stat) => stat.clusterId !== verseClusterStat?.clusterId)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.totalLength !== a.totalLength) return b.totalLength - a.totalLength;
      return a.firstStart - b.firstStart;
    });
  const chorusClusterStat = sortedChorusCandidates[0] || verseClusterStat;

  // Heuristic 3: Longest section in most repeated cluster is chorus
  const chorusIndices = chorusClusterStat ? chorusClusterStat.indices : [];
  const chorusSection =
    chorusIndices && chorusIndices.length
      ? chorusIndices
          .map((idx) => sections[idx])
          .sort((a, b) => b.length - a.length)[0]
      : null;

  if (chorusSection) {
    chorusSection.section_label = 'chorus';
    chorusSection.section_variant = 1;
  }

  // Heuristic 4: Other sections in most repeated cluster are also chorus variants
  if (chorusIndices && chorusIndices.length) {
    chorusIndices.forEach((idx, variant) => {
      if (sections[idx] !== chorusSection) {
        sections[idx].section_label = 'chorus';
        sections[idx].section_variant = variant + 2;
      }
    });
  }

  // Heuristic 5: Less repeated clusters are verses
  let verseVariant = 1;
  clusterStats.forEach((stat) => {
    if (stat.clusterId !== chorusClusterStat?.clusterId) {
      stat.indices.forEach((idx) => {
        if (!sections[idx].section_label) {
          sections[idx].section_label = 'verse';
          sections[idx].section_variant = verseVariant++;
        }
      });
    }
  });

  // Heuristic 6a: If only one cluster was detected (everything marked chorus),
  // alternate verse/chorus labels after the intro to avoid uniform labeling.
  if (
    (!chorusClusterStat || !verseClusterStat || clusters.size <= 1) &&
    sections.length > 1
  ) {
    let verseAlt = 1;
    let chorusAlt = 1;
    sections.forEach((section, idx) => {
      if (idx === 0) return; // keep intro
      if (idx % 2 === 1) {
        section.section_label = 'verse';
        section.section_variant = verseAlt++;
      } else {
        section.section_label = 'chorus';
        section.section_variant = chorusAlt++;
      }
    });
  }

  // Heuristic 6: Unique or very short sections might be bridge/outro
  sections.forEach((section, idx) => {
    if (!section.section_label) {
      if (idx === sections.length - 1) {
        section.section_label = 'outro';
      } else if (section.length < sections[0].length * 0.5) {
        section.section_label = 'bridge';
      } else {
        section.section_label = 'verse'; // Default fallback
      }
      section.section_variant = 1;
    }
  });

  // Generate section_ids
  sections.forEach((section, idx) => {
    const label = section.section_label.toUpperCase().charAt(0);
    section.section_id = `SECTION_${label}${section.section_variant || idx + 1}`;
  });

  return sections;
}

function attachSemanticSignatures(sections, clusters, linearAnalysis) {
  const clusterCounts = new Map();
  clusters.forEach((indices, clusterId) => {
    clusterCounts.set(clusterId, indices.length);
  });

  const semanticFrames = linearAnalysis?.semantic_features?.frames || [];
  const totalDuration =
    linearAnalysis?.metadata?.duration_seconds ||
    (sections.at(-1)?.end_frame || 0) * 0.1;
  const events = linearAnalysis?.events || [];

  return sections.map((section) => {
    const startTime = section.start_frame * FRAME_HOP_SECONDS;
    const endTime = section.end_frame * FRAME_HOP_SECONDS;
    const frames = sliceFramesForRange(semanticFrames, startTime, endTime);
    const frameSummary = summarizeFrames(frames);
    const chordSummary = summarizeChordActivity(events, startTime, endTime);
    const durationSeconds = Math.max(0, endTime - startTime);
    const positionRatio = totalDuration > 0 ? startTime / totalDuration : 0;
    const repetitionCount = clusterCounts.get(section.cluster_id) || 1;
    const repetitionScore = sections.length
      ? repetitionCount / sections.length
      : 0;

    return {
      ...section,
      semantic_signature: {
        repetition_score: Number(repetitionScore.toFixed(3)),
        repetition_count: repetitionCount,
        avg_rms: frameSummary.avg_rms,
        max_rms: frameSummary.max_rms,
        spectral_flux_mean: frameSummary.spectral_flux_mean,
        spectral_flux_trend: frameSummary.spectral_flux_trend,
        chroma_entropy_mean: frameSummary.chroma_entropy_mean,
        vocal_ratio: frameSummary.vocal_ratio,
        has_vocals: frameSummary.has_vocals,
        energy_slope: frameSummary.energy_slope,
        harmonic_stability: chordSummary.harmonic_stability,
        harmonic_variety: chordSummary.harmonic_variety,
        chord_unique: chordSummary.unique_chords,
        chord_total: chordSummary.total_chords,
        duration_seconds: durationSeconds,
        duration_bars: section.time_range?.duration_bars || durationSeconds / 2,
        position_ratio: Number(positionRatio.toFixed(3)),
        is_unique: repetitionCount === 1,
      },
    };
  });
}

function sliceFramesForRange(frames, start, end) {
  if (!frames || !frames.length) return [];
  return frames.filter(
    (frame) => frame.timestamp >= start && frame.timestamp < end,
  );
}

function summarizeChordActivity(events = [], startTime = 0, endTime = 0) {
  const chords = events.filter(
    (event) =>
      event.event_type === 'chord_candidate' &&
      event.timestamp >= startTime &&
      event.timestamp < endTime,
  );
  const totalChords = chords.length;
  const uniqueSet = new Set(
    chords.map(
      (event) => event.chord_candidate?.root_candidates?.[0]?.root || 'unknown',
    ),
  );
  const harmonicVariety = totalChords ? uniqueSet.size / totalChords : 0;
  const harmonicStability = 1 - Math.min(1, harmonicVariety);

  return {
    total_chords: totalChords,
    unique_chords: uniqueSet.size,
    harmonic_variety: Number(harmonicVariety.toFixed(3)),
    harmonic_stability: Number(harmonicStability.toFixed(3)),
  };
}

function getTempoFromAnalysis(linearAnalysis) {
  return (
    linearAnalysis?.metadata?.tempo_hint ||
    linearAnalysis?.beat_grid?.tempo_bpm ||
    linearAnalysis?.metadata?.detected_tempo ||
    120
  );
}

function computeDurationBars(section, linearAnalysis) {
  const tempo = getTempoFromAnalysis(linearAnalysis);
  const beatsPerBar = linearAnalysis?.beat_grid?.beats_per_bar || 4;
  const secondsPerBar = (60 / tempo) * beatsPerBar;
  const durationSeconds = getSectionDuration(section);
  if (!secondsPerBar || !Number.isFinite(secondsPerBar) || secondsPerBar <= 0) {
    return durationSeconds / 2;
  }
  return durationSeconds / secondsPerBar;
}

function snapBoundariesToGrid(boundaries, linearAnalysis) {
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    return boundaries;
  }

  const tempo = getTempoFromAnalysis(linearAnalysis);
  if (!tempo) {
    return boundaries;
  }

  const beatsPerBar = linearAnalysis?.beat_grid?.beats_per_bar || 4;
  const secondsPerBar = (60 / tempo) * beatsPerBar;
  const framesPerBar = secondsPerBar / FRAME_HOP_SECONDS;
  if (!Number.isFinite(framesPerBar) || framesPerBar <= 0) {
    return boundaries;
  }

  const snapped = boundaries.map((frame) => {
    const snappedFrame = Math.round(frame / framesPerBar) * framesPerBar;
    return Math.max(0, Math.round(snappedFrame));
  });

  snapped[0] = 0;
  snapped[snapped.length - 1] = boundaries[boundaries.length - 1];

  return snapped.filter(
    (value, index, array) => index === 0 || value > array[index - 1],
  );
}

function mergeSemanticSections(sections, linearAnalysis) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return sections;
  }

  const merged = [];

  sections.forEach((section) => {
    const clone = cloneSection(section);
    if (!merged.length) {
      merged.push(clone);
      return;
    }

    const last = merged[merged.length - 1];
    if (shouldMergeSections(last, clone)) {
      last.end_frame = clone.end_frame;
      last.time_range = {
        start_time: last.start_frame * FRAME_HOP_SECONDS,
        end_time: clone.end_frame * FRAME_HOP_SECONDS,
        duration_bars: computeDurationBars(last, linearAnalysis),
      };
      last.semantic_signature = mergeSemanticSignatures(
        last.semantic_signature,
        clone.semantic_signature,
      );
      last.section_label = last.section_label || clone.section_label;
    } else {
      merged.push(clone);
    }
  });

  merged.forEach((section) => {
    section.time_range = {
      start_time: section.start_frame * FRAME_HOP_SECONDS,
      end_time: section.end_frame * FRAME_HOP_SECONDS,
      duration_bars: computeDurationBars(section, linearAnalysis),
    };
    if (section.semantic_signature) {
      section.semantic_signature.duration_seconds = getSectionDuration(section);
      section.semantic_signature.duration_bars =
        section.time_range.duration_bars;
    }
  });

  return merged;
}

function shouldMergeSections(prev, next) {
  if (!prev || !next) return false;
  const prevDuration = getSectionDuration(prev);
  const nextDuration = getSectionDuration(next);
  const short =
    prevDuration < MIN_SECTION_SECONDS || nextDuration < MIN_SECTION_SECONDS;
  const sameCluster =
    prev.cluster_id !== undefined &&
    prev.cluster_id !== null &&
    prev.cluster_id === next.cluster_id;
  const sameLabel =
    prev.section_label &&
    next.section_label &&
    prev.section_label === next.section_label;
  const gapSeconds = (next.start_frame - prev.end_frame) * FRAME_HOP_SECONDS;

  return short || sameCluster || (sameLabel && gapSeconds < 2);
}

function mergeSemanticSignatures(a = {}, b = {}) {
  const durationA = a.duration_seconds || 0;
  const durationB = b.duration_seconds || 0;
  const total = durationA + durationB || 1;
  const weightedAverage = (prop) =>
    ((a[prop] || 0) * durationA + (b[prop] || 0) * durationB) / total;

  return {
    repetition_score: Math.max(
      a.repetition_score || 0,
      b.repetition_score || 0,
    ),
    repetition_count: (a.repetition_count || 0) + (b.repetition_count || 0),
    avg_rms: weightedAverage('avg_rms'),
    max_rms: Math.max(a.max_rms || 0, b.max_rms || 0),
    spectral_flux_mean: weightedAverage('spectral_flux_mean'),
    spectral_flux_trend: weightedAverage('spectral_flux_trend'),
    chroma_entropy_mean: weightedAverage('chroma_entropy_mean'),
    vocal_ratio: weightedAverage('vocal_ratio'),
    has_vocals: (weightedAverage('vocal_ratio') || 0) > 0.35,
    energy_slope: weightedAverage('energy_slope'),
    harmonic_stability: weightedAverage('harmonic_stability'),
    harmonic_variety: weightedAverage('harmonic_variety'),
    chord_unique: (a.chord_unique || 0) + (b.chord_unique || 0),
    chord_total: (a.chord_total || 0) + (b.chord_total || 0),
    duration_seconds: durationA + durationB,
    duration_bars: (a.duration_bars || 0) + (b.duration_bars || 0),
    position_ratio: a.position_ratio ?? b.position_ratio,
    is_unique: (a.is_unique && b.is_unique) || false,
    semantic_label: a.semantic_label || b.semantic_label,
  };
}

function getSectionDuration(section) {
  if (!section) return 0;
  const durationFrames = section.end_frame - section.start_frame || 0;
  return durationFrames * FRAME_HOP_SECONDS;
}

function cloneSection(section) {
  return {
    ...section,
    time_range: section.time_range ? { ...section.time_range } : undefined,
    semantic_signature: section.semantic_signature
      ? { ...section.semantic_signature }
      : undefined,
  };
}

function smoothSeries(series = [], windowSize = 5) {
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

/**
 * Apply median filter to remove short spikes (e.g., anvil hits in Maxwell's Silver Hammer)
 * This helps prevent false section boundaries from transient events
 */
function applyMedianFilter(series = [], windowSize = 5) {
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
    // Sort and return median
    window.sort((a, b) => a - b);
    const mid = Math.floor(window.length / 2);
    return window.length % 2 === 0
      ? (window[mid - 1] + window[mid]) / 2
      : window[mid];
  });
}

/**
 * Main function: Analyze structure from linear analysis
 * @param {Object} linearAnalysis - Output from Pass 1
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} Structural map per schema
 */
async function analyzeStructure(linearAnalysis, progressCallback = () => {}) {
  progressCallback(10);

  // Add a small delay to make progress visible
  await new Promise((resolve) => setImmediate(resolve));

  // Extract chroma features from Pass 1 output
  // Use chroma_frames from linear_analysis if available
  let chromaFeatures = [];
  let mfccFeatures = [];

  if (linearAnalysis.chroma_frames && linearAnalysis.chroma_frames.length > 0) {
    // Use actual chroma features from Pass 1
    chromaFeatures = linearAnalysis.chroma_frames.map(
      (frame) => frame.chroma || [],
    );
  } else {
    // Fallback: Extract from events or simulate
    chromaFeatures = extractChromaFromEvents(linearAnalysis.events || []);
  }

  // Extract MFCC features for timbre tracking (enables detection of sections with same harmony but different timbre)
  if (linearAnalysis.mfcc_frames && linearAnalysis.mfcc_frames.length > 0) {
    mfccFeatures = linearAnalysis.mfcc_frames.map((frame) => frame.mfcc || []);
    console.log(
      `Architect: Using ${mfccFeatures.length} MFCC frames for timbre-based similarity`,
    );
  } else {
    console.log(
      'Architect: No MFCC frames available, using chroma-only similarity',
    );
  }

  // Align MFCC features with chroma features (they should have same timestamps)
  if (
    mfccFeatures.length > 0 &&
    mfccFeatures.length !== chromaFeatures.length
  ) {
    // Interpolate or pad MFCC features to match chroma length
    if (mfccFeatures.length < chromaFeatures.length) {
      // Pad with last MFCC frame
      const lastMfcc = mfccFeatures[mfccFeatures.length - 1] || [];
      while (mfccFeatures.length < chromaFeatures.length) {
        mfccFeatures.push([...lastMfcc]);
      }
    } else {
      // Truncate to match chroma length
      mfccFeatures = mfccFeatures.slice(0, chromaFeatures.length);
    }
  }

  if (chromaFeatures.length === 0) {
    // Create placeholder chroma features for structure detection
    const estimatedFrames = Math.floor(
      (linearAnalysis.metadata?.duration_seconds || 180) / 0.1,
    );
    chromaFeatures = Array(estimatedFrames)
      .fill(0)
      .map(() =>
        Array(12)
          .fill(0)
          .map(() => Math.random() * 0.5),
      );
  }

  progressCallback(30);

  // Build similarity matrix with combined chroma + MFCC features
  const similarityMatrix = buildSimilarityMatrix(
    chromaFeatures,
    mfccFeatures.length > 0 ? mfccFeatures : null,
  );

  progressCallback(50);

  // Detect boundaries
  const boundaries = detectNovelty(similarityMatrix);
  const snappedBoundaries = snapBoundariesToGrid(boundaries, linearAnalysis);

  progressCallback(70);

  // Cluster and label sections
  const clusteringResult = clusterSections(similarityMatrix, snappedBoundaries);
  const labeledSections = labelSections(
    clusteringResult.sections,
    clusteringResult.clusters,
  );
  const enrichedSections = attachSemanticSignatures(
    labeledSections,
    clusteringResult.clusters,
    linearAnalysis,
  );
  const mergedSections = mergeSemanticSections(
    enrichedSections,
    linearAnalysis,
  );

  progressCallback(90);

  // Convert to schema format
  const structural_map = {
    sections: mergedSections.map((section) => ({
      section_id: section.section_id,
      section_label: section.section_label,
      section_variant: section.section_variant || 1,
      time_range: {
        start_time: section.start_frame * FRAME_HOP_SECONDS,
        end_time: section.end_frame * FRAME_HOP_SECONDS,
        duration_bars:
          section.time_range?.duration_bars ||
          computeDurationBars(section, linearAnalysis),
      },
      harmonic_dna: {
        // Will be populated in Pass 3
        progression: [],
        key_center: '',
        mode: 'ionian',
        harmonic_rhythm: '',
        characteristic_moves: [],
      },
      rhythmic_dna: {
        // Will be populated by rhythmic analyzer
        time_signature: { numerator: 4, denominator: 4 },
        pulse_pattern: [4, 4, 4, 4],
        macrobeat_structure: {
          tempo_bpm: linearAnalysis.beat_grid?.tempo_bpm || 120,
          macrobeats_per_bar: 4,
          macrobeat_feel: 'even',
        },
        microbeat_base: {
          division_type: 'binary',
          microbeats_per_macrobeat: 4,
          partition: 'P=4',
        },
      },
      similarity_matrix: {
        method: 'chromagram',
        similarity_scores: [],
        repetition_indices: [],
      },
      semantic_signature: section.semantic_signature || {},
    })),
  };

  progressCallback(100);

  console.log(
    'Architect: Returning structural_map with',
    structural_map.sections.length,
    'sections',
  );

  // Ensure we always return at least one section
  if (structural_map.sections.length === 0) {
    console.warn(
      'Architect: No sections detected, creating placeholder section',
    );
    structural_map.sections = [
      {
        section_id: 'section-1',
        section_label: 'verse',
        section_variant: 1,
        time_range: {
          start_time: 0,
          end_time: linearAnalysis.metadata?.duration_seconds || 30,
          duration_bars: (linearAnalysis.metadata?.duration_seconds || 30) / 2,
        },
        harmonic_dna: {
          progression: [],
          key_center: linearAnalysis.metadata?.detected_key || 'C',
          mode: linearAnalysis.metadata?.detected_mode || 'major',
          harmonic_rhythm: '',
          characteristic_moves: [],
        },
        rhythmic_dna: {
          time_signature: { numerator: 4, denominator: 4 },
          pulse_pattern: [4, 4, 4, 4],
          macrobeat_structure: {
            tempo_bpm: linearAnalysis.beat_grid?.tempo_bpm || 120,
            macrobeats_per_bar: 4,
            macrobeat_feel: 'even',
          },
          microbeat_base: {
            division_type: 'binary',
            microbeats_per_macrobeat: 4,
            partition: 'P=4',
          },
        },
        similarity_matrix: {
          method: 'chromagram',
          similarity_scores: [],
          repetition_indices: [],
        },
        semantic_signature: {
          repetition_score: 1,
          repetition_count: 1,
          avg_rms: 0,
          max_rms: 0,
          spectral_flux_mean: 0,
          spectral_flux_trend: 0,
          chroma_entropy_mean: 0,
          vocal_ratio: 0,
          has_vocals: false,
          energy_slope: 0,
          harmonic_stability: 1,
          harmonic_variety: 0,
          chord_unique: 0,
          chord_total: 0,
          duration_seconds: linearAnalysis.metadata?.duration_seconds || 30,
          duration_bars: (linearAnalysis.metadata?.duration_seconds || 30) / 2,
          position_ratio: 0,
          is_unique: true,
        },
      },
    ];
  }

  return structural_map;
}

/**
 * Extract chroma features from events (placeholder)
 */
function extractChromaFromEvents(events) {
  // TODO: Extract actual chroma features from Pass 1 output
  // For now, return placeholder
  return Array(100)
    .fill(0)
    .map(() =>
      Array(12)
        .fill(0)
        .map(() => Math.random()),
    );
}

module.exports = {
  analyzeStructure,
  buildSimilarityMatrix,
  detectNovelty,
  clusterSections,
  labelSections,
};
