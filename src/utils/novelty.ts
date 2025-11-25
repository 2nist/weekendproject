export interface NoveltyStats {
  peakValue: number;
  peakFrame: number;
  peakTime: number; // seconds
  average: number;
  max: number;
  withinRange: number[];
  significantPeaks?: { frame: number; value: number; time: number }[];
}

function median(values: number[]) {
  if (!values || !values.length) return 0;
  const arr = [...values].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2;
  return arr[mid];
}

function mad(values: number[]) {
  if (!values || !values.length) return 0;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

export function findLocalPeaks(curve: number[]) {
  if (!curve || curve.length < 3) return [];
  const peaks: number[] = [];
  for (let i = 1; i < curve.length - 1; i++) {
    if (curve[i] > curve[i - 1] && curve[i] > curve[i + 1]) peaks.push(i);
  }
  return peaks;
}

export function findSignificantPeaks(
  curve: number[],
  method: 'mad' | 'percentile' = 'mad',
  param: number = 1.5,
) {
  if (!curve || !curve.length) return [];
  const peaks = findLocalPeaks(curve);
  if (!peaks.length) return [];
  let threshold = 0;
  if (method === 'mad') {
    const m = median(curve);
    const mdev = mad(curve);
    threshold = m + param * mdev;
  } else {
    // percentile
    const sorted = [...curve].sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor((param / 100) * sorted.length) - 1);
    threshold = sorted[idx] ?? sorted[sorted.length - 1];
  }
  return peaks.filter((i) => curve[i] >= threshold);
}

export function computeThreshold(
  curve: number[],
  method: 'mad' | 'percentile' = 'mad',
  param: number = 1.5,
) {
  if (!curve || !curve.length) return 0;
  if (method === 'mad') {
    const m = median(curve);
    const mdev = mad(curve);
    return m + param * mdev;
  }
  // percentile
  const sorted = [...curve].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((param / 100) * sorted.length) - 1);
  return sorted[idx] ?? sorted[sorted.length - 1];
}

export function getNoveltyStatsForSection(
  section: any,
  noveltyCurve: number[] = [],
  frameHop = 0.1,
  method: 'mad' | 'percentile' = 'mad',
  methodParam: number = 1.5,
): NoveltyStats | null {
  if (!section || !section.time_range || !noveltyCurve || !noveltyCurve.length) return null;
  const start = section.time_range.start_time || 0;
  const end = section.time_range.end_time || start;
  const startFrame = Math.max(0, Math.floor(start / frameHop));
  const endFrame = Math.min(noveltyCurve.length - 1, Math.ceil(end / frameHop));
  const slice = noveltyCurve.slice(startFrame, endFrame + 1);
  if (!slice.length) return null;

  const max = slice.reduce((m, v) => (v > m ? v : m), slice[0] || 0);
  const sum = slice.reduce((s, v) => s + v, 0);
  const avg = sum / slice.length;
  const peakValue = max;
  const peakFrame = startFrame + slice.findIndex((v) => v === peakValue);
  const peakTime = peakFrame * frameHop;
  // detect whether any significant peaks fall in this section
  const significant = findSignificantPeaks(noveltyCurve, method, methodParam) || [];
  const significantInSection = significant.filter((f) => f >= startFrame && f <= endFrame);
  const significantPeaks = significantInSection.map((f) => ({
    frame: f,
    value: noveltyCurve[f],
    time: f * frameHop,
  }));
  const significantPeak = significantPeaks.length ? significantPeaks[0] : null;

  return {
    peakValue,
    peakFrame,
    peakTime,
    average: avg,
    max,
    withinRange: slice,
    significantPeak,
    significantPeaks,
  };
}

export function getKeyChangeForSection(sections: any[] | undefined | null, index: number) {
  if (!sections || !Array.isArray(sections) || index == null || index < 0) return null;
  const current = sections[index];
  const prev = sections[index - 1];
  const next = sections[index + 1];

  const currKey = current?.harmonic_dna?.key_center || current?.harmonic_dna?.primary_key;
  const currMode = current?.harmonic_dna?.mode || current?.harmonic_dna?.primary_mode;
  const prevKey = prev?.harmonic_dna?.key_center || prev?.harmonic_dna?.primary_key;
  const prevMode = prev?.harmonic_dna?.mode || prev?.harmonic_dna?.primary_mode;
  const nextKey = next?.harmonic_dna?.key_center || next?.harmonic_dna?.primary_key;
  const nextMode = next?.harmonic_dna?.mode || next?.harmonic_dna?.primary_mode;

  const changes = [] as string[];
  if (prev && prevKey && currKey && prevKey !== currKey) {
    changes.push(
      `Prev: ${prevKey}${prevMode ? ` (${prevMode})` : ''} → Curr: ${currKey}${currMode ? ` (${currMode})` : ''}`,
    );
  }
  if (next && nextKey && currKey && nextKey !== currKey) {
    changes.push(
      `Curr: ${currKey}${currMode ? ` (${currMode})` : ''} → Next: ${nextKey}${nextMode ? ` (${nextMode})` : ''}`,
    );
  }

  return {
    prevKey,
    currKey,
    nextKey,
    prevMode,
    currMode,
    nextMode,
    changes,
  };
}

export default {
  getNoveltyStatsForSection,
  getKeyChangeForSection,
};
