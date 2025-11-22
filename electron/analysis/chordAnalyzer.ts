/*
 * Beat-synchronous Chord Analyzer
 * Implements: synchronizeChroma, generateTemplates, getChordProbabilities, Viterbi
 */
// Local copy of cosine similarity to avoid cross-file JS exports
function cosineSimilarityLocal(a: number[] = [], b: number[] = []) {
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

export type ChordProbRow = { chord: string; score: number }[];

export class ChordAnalyzer {
  // templates: array of {chord, vector}
  templates: { chord: string; vector: number[] }[] = [];
  constructor(private opts: any = {}) {
    this.templates = this.generateTemplates();
  }

  // Average chroma vectors within each beat using Gaussian weighting
  // Window Shift: Post-Attack Sustain (30% - 80%) to avoid percussive crash
  synchronizeChroma(
    chromaFrames: number[][],
    beatTimestamps: number[],
    // Librosa hop_length=512 @ sr=22050 -> ~0.0232s per frame
    frameHop = 0.0232,
    windowShift = 0, // Optional manual shift in seconds (-0.05 to +0.05)
  ) {
    if (!chromaFrames || !chromaFrames.length || !beatTimestamps) return [];
    const beats: number[][] = [];
    const frameIndexForTime = (t: number) => Math.round(t / frameHop);
    
    // Gaussian window function: emphasize post-attack sustain (30%-80% of beat)
    // Shifted from center 50% (25%-75%) to post-attack 55% (30%-80%)
    const gaussianWeight = (position: number, total: number) => {
      if (total <= 1) return 1.0;
      // New center: 55% of the way through (was 50%)
      // This captures the stable core after the attack transient
      const center = (total - 1) * 0.55; // 30% start + (80% - 30%) / 2 = 55%
      const sigma = total * 0.15; // Narrower window focused on 30%-80% range
      const x = position - center;
      return Math.exp(-(x * x) / (2 * sigma * sigma));
    };

    for (let i = 0; i < beatTimestamps.length; i++) {
      const beatStart = beatTimestamps[i];
      const beatEnd =
        i + 1 < beatTimestamps.length ? beatTimestamps[i + 1] : beatStart + 0.5;
      
      // Apply window shift: shift the analysis window to avoid attack transients
      const shiftedStart = beatStart + windowShift;
      const shiftedEnd = beatEnd + windowShift;
      
      const startFrame = frameIndexForTime(shiftedStart);
      const endFrame = frameIndexForTime(shiftedEnd);
      const avg = new Array(12).fill(0);
      let totalWeight = 0;
      
      if (startFrame < chromaFrames.length && endFrame > startFrame) {
        const frameCount = endFrame - startFrame;
        for (let f = startFrame; f < endFrame && f < chromaFrames.length; f++) {
          const vec = chromaFrames[f] || [];
          const weight = gaussianWeight(f - startFrame, frameCount);
          for (let k = 0; k < 12; k++) avg[k] += (vec[k] || 0) * weight;
          totalWeight += weight;
        }
      }
      
      // fallback: use silence (or zero vector) when no frames
      if (totalWeight === 0) {
        beats.push(new Array(12).fill(0));
      } else {
        for (let k = 0; k < 12; k++) avg[k] /= totalWeight;
        beats.push(avg);
      }
    }
    return beats;
  }

  generateTemplates() {
    const templates: { chord: string; vector: number[] }[] = [];
    // Physics-Based Weighted Templates
    // Major: Root=1.0, 3rd=0.8, 5th=0.9, 5th_Overtone=0.2
    // Minor: Root=1.0, b3=0.8, 5th=0.9
    // Dominant: Root=1.0, 3rd=0.8, 5th=0.9, b7=0.7
    for (let root = 0; root < 12; root++) {
      const major = new Array(12).fill(0);
      const minor = new Array(12).fill(0);
      const dom = new Array(12).fill(0);
      // Major: Root + Major 3rd + Perfect 5th + overtone
      major[root] = 1.0;
      major[(root + 4) % 12] = 0.8;
      major[(root + 7) % 12] = 0.9 + 0.2; // 5th + overtone
      // Minor: Root + Minor 3rd + Perfect 5th
      minor[root] = 1.0;
      minor[(root + 3) % 12] = 0.8;
      minor[(root + 7) % 12] = 0.9;
      // Dominant 7: Root + Major 3rd + Perfect 5th + Minor 7th
      dom[root] = 1.0;
      dom[(root + 4) % 12] = 0.8;
      dom[(root + 7) % 12] = 0.9;
      dom[(root + 10) % 12] = 0.7;
      templates.push({ chord: `${this.rootName(root)}`, vector: major });
      templates.push({ chord: `${this.rootName(root)}m`, vector: minor });
      // optional: basic 7th (dominant)
      if (this.opts.include7ths) {
        const extras = [] as { chord: string; vector: number[] }[];
        extras.push({ chord: `${this.rootName(root)}7`, vector: dom });
        // Add major7 and minor7 templates as simplified forms
        const maj7 = new Array(12).fill(0);
        maj7[root] = 1;
        maj7[(root + 4) % 12] = 1;
        maj7[(root + 7) % 12] = 1;
        maj7[(root + 11) % 12] = 1;
        const min7 = new Array(12).fill(0);
        min7[root] = 1;
        min7[(root + 3) % 12] = 1;
        min7[(root + 7) % 12] = 1;
        min7[(root + 10) % 12] = 1;
        extras.push(
          { chord: `${this.rootName(root)}maj7`, vector: maj7 },
          { chord: `${this.rootName(root)}m7`, vector: min7 },
        );
        templates.push(...extras);
      }
    }
    return templates;
  }

  private rootName(root: number) {
    const names = [
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
    return names[root % 12];
  }

  getChordProbabilities(beatChroma: number[][], opts: any = {}) {
    const rows: ChordProbRow[] = [];
    const norm = (v: number[]) => {
      const s = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
      if (!s) return v.slice();
      return v.map((x) => x / s);
    };
    const keyMask = opts.keyMask || null; // { diatonic: Set<number>, delta: 0.1 }
    const diatonicBonus =
      typeof opts.diatonicBonus === 'number'
        ? opts.diatonicBonus
        : (keyMask?.delta ?? 0.1);
    const nonDiatonicPenalty =
      typeof opts.nonDiatonicPenalty === 'number'
        ? opts.nonDiatonicPenalty
        : 0.1;
    for (const bc of beatChroma) {
      const nv = norm(bc);
      const row: ChordProbRow = [];
      for (const t of this.templates) {
        const tv = norm(t.vector);
        const s = cosineSimilarityLocal(nv, tv);
        let score = s;
        if (
          keyMask &&
          keyMask.diatonic &&
          keyMask.diatonic.has(this.rootPc(t.chord))
        ) {
          score += diatonicBonus;
        } else if (
          keyMask &&
          keyMask.diatonic &&
          !keyMask.diatonic.has(this.rootPc(t.chord))
        ) {
          score -= nonDiatonicPenalty;
        }
        score = Math.max(0, score);
        row.push({ chord: t.chord, score });
      }
      // Apply softmax normalization across scores to make probabilities
      const temp =
        typeof opts.temperature === 'number' ? opts.temperature : 0.1;
      const maxS = Math.max(...row.map((r) => r.score));
      const exps = row.map((r) => Math.exp((r.score - maxS) / (temp || 0.3)));
      const sumExps = exps.reduce((a, b) => a + b, 0) || 1;
      for (let i = 0; i < row.length; i++) row[i].score = exps[i] / sumExps;
      rows.push(row);
    }
    return rows;
  }

  // Convert per-template probability rows into per-root probability rows (12 roots)
  collapseToRootProbRows(
    templateRows: ChordProbRow[],
    topPitches?: number[],
    rootPeakBiasParam = 0.1,
  ) {
    const rootRows: { root: string; score: number }[][] = [];
    const rootNames = [
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
    // Fix: use provided parameter or fallback to option
    const biasValue =
      typeof rootPeakBiasParam === 'number'
        ? rootPeakBiasParam
        : typeof this.opts.rootPeakBias === 'number'
          ? this.opts.rootPeakBias
          : 0.1;
    for (let idx = 0; idx < templateRows.length; idx++) {
      const row = templateRows[idx];
      const rrow = rootNames.map((r) => ({ root: r, score: 0 }));
      for (const t of row) {
        const r = this.rootPc(t.chord);
        rrow[r].score += t.score;
      }
      // optionally bias by strongest chroma peak if beat-level top pitch is known
      // Since we don't get beat chroma here, expect caller to apply rootPeakBias via opts or compute in caller
      // Normalize row to sum to 1
      const sum = rrow.reduce((a, b) => a + b.score, 0) || 1;
      // Apply top-pitch bias if present
      if (topPitches && typeof topPitches[idx] === 'number') {
        const peak = topPitches[idx];
        if (peak >= 0 && peak < rrow.length) {
          rrow[peak].score += biasValue;
        }
      }
      for (const c of rrow) c.score = c.score / sum;
      rootRows.push(rrow);
    }
    return rootRows;
  }

  // Apply Viterbi on root-level probability rows
  applyViterbiRoots(
    rootRows: { root: string; score: number }[][],
    transitionProb = 0.8,
  ) {
    if (!rootRows.length) return [];
    const states = [
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
    const N = states.length;
    const T = rootRows.length;
    const log = Math.log;
    const trans = (fromIdx: number, toIdx: number) =>
      this.computeTransitionLog(states, fromIdx, toIdx, transitionProb, N);
    const v = Array.from({ length: T }, () => new Array(N).fill(-Infinity));
    const back = Array.from({ length: T }, () => new Array(N).fill(0));
    // init
    for (let i = 0; i < N; i++) v[0][i] = log(rootRows[0][i].score + 1e-6);
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < N; j++) {
        let best = -Infinity;
        let arg = 0;
        for (let i = 0; i < N; i++) {
          const val = v[t - 1][i] + trans(i, j);
          if (val > best) {
            best = val;
            arg = i;
          }
        }
        v[t][j] = best + log(rootRows[t][j].score + 1e-6);
        back[t][j] = arg;
      }
    }
    // backtrace
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < N; i++) {
      if (v[T - 1][i] > bestVal) {
        bestVal = v[T - 1][i];
        bestIdx = i;
      }
    }
    const pathIdx: number[] = new Array(T);
    pathIdx[T - 1] = bestIdx;
    for (let t = T - 1; t > 0; t--) {
      pathIdx[t - 1] = back[t][pathIdx[t]];
    }
    return pathIdx.map((i) => states[i]);
  }

  // simple viterbi where transitionMatrix is Map<string, Map<string, number>> or lazy rules
  applyViterbi(probRows: ChordProbRow[], transitionProb = 0.8) {
    if (!probRows.length) return [];
    const states = this.templates.map((t) => t.chord);
    const N = states.length;
    const T = probRows.length;
    const log = Math.log;
    const trans = (fromIdx: number, toIdx: number) =>
      this.computeTransitionLog(states, fromIdx, toIdx, transitionProb, N);

    const v = Array.from({ length: T }, () => new Array(N).fill(-Infinity));
    const back = Array.from({ length: T }, () => new Array(N).fill(0));
    // init
    for (let i = 0; i < N; i++) v[0][i] = log(probRows[0][i].score + 1e-6);
    // dynamic
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < N; j++) {
        let best = -Infinity;
        let arg = 0;
        for (let i = 0; i < N; i++) {
          const val = v[t - 1][i] + trans(i, j);
          if (val > best) {
            best = val;
            arg = i;
          }
        }
        v[t][j] = best + log(probRows[t][j].score + 1e-6);
        back[t][j] = arg;
      }
    }
    // backtrace
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < N; i++) {
      if (v[T - 1][i] > bestVal) {
        bestVal = v[T - 1][i];
        bestIdx = i;
      }
    }
    const pathIdx: number[] = new Array(T);
    pathIdx[T - 1] = bestIdx;
    for (let t = T - 1; t > 0; t--) {
      pathIdx[t - 1] = back[t][pathIdx[t]];
    }
    const labels = pathIdx.map((i) => states[i]);
    return labels;
  }

  rootPc(chordName: string) {
    const root = chordName.split(/[m7]/)[0];
    const map: Record<string, number> = {
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
    };
    const k = String(root)
      .replace(/[^A-G#]/g, '')
      .toUpperCase();
    return map[k] ?? 0;
  }

  computeTransitionLog(
    states: string[],
    fromIdx: number,
    toIdx: number,
    transitionProb: number,
    N: number,
  ) {
    if (fromIdx === toIdx) return Math.log(transitionProb);
    const f = this.rootPc(states[fromIdx]);
    const t = this.rootPc(states[toIdx]);
    const diff = (t - f + 12) % 12;
    if (diff === 7 || diff === 5) return Math.log((1 - transitionProb) / 2);
    return Math.log((1 - transitionProb) / (N - 3));
  }

  getKeyMask(key: string, mode: string = 'major') {
    const tonic = this.rootPc(key);
    const major = [0, 2, 4, 5, 7, 9, 11];
    const naturalMinor = [0, 2, 3, 5, 7, 8, 10];
    const arr =
      mode && String(mode).toLowerCase().startsWith('min')
        ? naturalMinor
        : major;
    const diatonic = new Set<number>(arr.map((x) => (tonic + x) % 12));
    return { diatonic, delta: 0.15 };
  }

  detectChords(linear: any, opts: any = {}) {
    const chroma = linear?.chroma_frames?.map((f: any) => f.chroma || []) || [];
    const beats = linear?.beat_grid?.beat_timestamps || [];
    // Derive frameHop from chroma frame timestamps if available
    let frameHop =
      opts.frameHop ?? linear?.metadata?.frame_hop_seconds ?? 0.0232;
    // If we don't already have a frameHop, infer from chroma frame timestamps when available
    if (
      !opts.frameHop &&
      (!linear?.metadata?.frame_hop_seconds ||
        linear.metadata.frame_hop_seconds === 0) &&
      linear?.chroma_frames &&
      linear.chroma_frames.length > 1
    ) {
      const ft0 = linear.chroma_frames[0].timestamp;
      const ft1 = linear.chroma_frames[1].timestamp;
      if (typeof ft0 === 'number' && typeof ft1 === 'number')
        frameHop = ft1 - ft0;
    }
    const beatChroma = this.synchronizeChroma(chroma, beats, frameHop);
    
    // Section-Based Key Bias: Use section-specific keys when available
    const structuralMap = opts.structuralMap || null;
    let globalKeyMask = opts.keyMask || null;
    
    // Build section lookup map for O(1) access
    const sectionMap = new Map<number, { key?: string; mode?: string }>();
    if (structuralMap?.sections && Array.isArray(structuralMap.sections)) {
      for (const section of structuralMap.sections) {
        const timeRange = section.time_range;
        if (timeRange && typeof timeRange.start_time === 'number' && typeof timeRange.end_time === 'number') {
          const start = timeRange.start_time;
          const end = timeRange.end_time;
          // Store section key info for beats in this time range
          const harmonicDna = section.harmonic_dna;
          if (harmonicDna?.key_center) {
            // key_center might be "C" or "C Major" or {key: "C", mode: "major"}
            let key = null;
            let mode = 'major';
            if (typeof harmonicDna.key_center === 'string') {
              const parts = harmonicDna.key_center.split(/\s+/).filter(Boolean);
              key = parts[0];
              mode = parts[1] || harmonicDna.mode || 'major';
            } else if (harmonicDna.key_center?.key) {
              key = harmonicDna.key_center.key;
              mode = harmonicDna.key_center.mode || harmonicDna.mode || 'major';
            }
            if (key) {
              // Store for all beats in this section (we'll look up by beat timestamp)
              for (let i = 0; i < beats.length; i++) {
                const beatTime = beats[i];
                if (beatTime >= start && beatTime < end) {
                  sectionMap.set(i, { key, mode });
                }
              }
            }
          }
        }
      }
    }
    
    // globalKey is optional: e.g., "C Major" or "C" or {key:'C', mode:'major'}
    if (!globalKeyMask && opts.globalKey) {
      const g = opts.globalKey;
      let parentKey = null;
      let mode = 'major';
      if (typeof g === 'string') {
        const parts = g.split(/\s+/).filter(Boolean);
        parentKey = parts[0];
        mode = parts[1] || 'major';
      } else if (g.key) {
        parentKey = g.key;
        mode = g.mode || 'major';
      }
      if (parentKey) {
        globalKeyMask = this.getKeyMask(parentKey, mode);
      }
    }
    // Tuned defaults: derive common options from provided opts or fallback tuned values
    // 🔴 Tuned, golden defaults (used by tests). These apply when callers
    // omit options (e.g., app's listener). They match the `Let It Be` tune.
    const temperature = opts.temperature ?? 0.1;
    const transitionProb = opts.transitionProb ?? 0.8;
    const diatonicBonus = opts.diatonicBonus ?? 0.1;
    const nonDiatonicPenalty =
      typeof opts.nonDiatonicPenalty === 'number'
        ? opts.nonDiatonicPenalty
        : 0.1;
    const rootPeakBias = opts.rootPeakBias ?? 0.1;
    const rootOnly = opts.rootOnly ?? true;
    
    // Section-Based Key Bias: Compute per-beat key masks
    // For each beat, use section key if available, otherwise global key
    const beatKeyMasks: (any | null)[] = [];
    for (let i = 0; i < beatChroma.length; i++) {
      const sectionInfo = sectionMap.get(i);
      if (sectionInfo?.key) {
        // Use section-specific key
        beatKeyMasks.push(this.getKeyMask(sectionInfo.key, sectionInfo.mode || 'major'));
      } else {
        // Fallback to global key mask
        beatKeyMasks.push(globalKeyMask);
      }
    }
    
    // Compute probability rows with per-beat key masks
    // Safety Valve: Disable key bias if confidence is too low (< 0.3)
    const probRowsTemplate: ChordProbRow[] = [];
    for (let i = 0; i < beatChroma.length; i++) {
      const keyMask = beatKeyMasks[i];
      
      // First, compute baseline confidence without key mask
      const baselineRow = this.getChordProbabilities(
        [beatChroma[i]],
        { temperature: temperature },
      );
      const baselineConfidence = Math.max(...baselineRow[0].map((x) => x.score));
      
      // Safety Valve: If confidence < 0.3, disable key bias to avoid forcing incorrect chords
      const shouldApplyKeyMask = keyMask && baselineConfidence >= 0.3;
      
      const row = this.getChordProbabilities(
        [beatChroma[i]],
        shouldApplyKeyMask
          ? {
              keyMask,
              diatonicBonus: diatonicBonus,
              nonDiatonicPenalty: nonDiatonicPenalty,
              temperature: temperature,
            }
          : { temperature: temperature },
      );
      probRowsTemplate.push(row[0]); // getChordProbabilities returns array of rows
    }
    // Use root-only Viterbi by default (reduce state space and improve root detection)
    let labels: string[];
    if (rootOnly === true) {
      // compute beat-level top pitches
      const topPitches = beatChroma.map((bc) => {
        let best = 0;
        let idx = 0;
        for (let i = 0; i < bc.length; i++) {
          if (bc[i] > best) {
            best = bc[i];
            idx = i;
          }
        }
        return idx;
      });
      const bias = rootPeakBias;
      const rootRows = this.collapseToRootProbRows(
        probRowsTemplate,
        topPitches,
        bias,
      );
      labels = this.applyViterbiRoots(rootRows, transitionProb);
    } else {
      labels = this.applyViterbi(probRowsTemplate, transitionProb);
    }
    // Build confidences from used probability rows (root or template)
    let confidences: number[] = [];
    if (rootOnly === true) {
      const rootRows = this.collapseToRootProbRows(probRowsTemplate);
      confidences = rootRows.map((r) => Math.max(...r.map((x) => x.score)));
    } else {
      confidences = probRowsTemplate.map((r) =>
        Math.max(...r.map((x) => x.score)),
      );
    }
    // Return mapping: for each beat -> { chord, confidence, timestamp, bar/beat }
    const beatsPerMeasure = linear?.beat_grid?.time_signature?.split?.('/')[0]
      ? Number(linear.beat_grid.time_signature.split('/')[0])
      : 4;
    const beatList = beats.map((t: number, i: number) => ({
      bar: Math.floor(i / beatsPerMeasure) + 1,
      beat: (i % beatsPerMeasure) + 1,
      timestamp: t,
      chord: labels[i] || null,
      confidence: confidences[i] || 0,
    }));
    return beatList;
  }
}

export default ChordAnalyzer;
