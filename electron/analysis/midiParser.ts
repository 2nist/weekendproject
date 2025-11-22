import fs from 'fs';
import path from 'path';
import { Midi } from '@tonejs/midi';

function pitchClass(noteNumber: number) {
  return noteNumber % 12;
}

function noteNameFromPC(pc: number) {
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
  return names[pc % 12];
}

function detectChordFromPitchClasses(pcs: number[]) {
  pcs = Array.from(new Set(pcs)).sort((a, b) => a - b);
  if (!pcs.length) return 'N';
  // try triad detection: major or minor
  for (let root = 0; root < 12; root++) {
    const maj = new Set([root, (root + 4) % 12, (root + 7) % 12]);
    const min = new Set([root, (root + 3) % 12, (root + 7) % 12]);
    const pcsSet = new Set(pcs);
    if ([...pcsSet].every((x) => maj.has(x))) return noteNameFromPC(root);
    if ([...pcsSet].every((x) => min.has(x))) return `${noteNameFromPC(root)}m`;
  }
  // fallback to root of strongest pitch (first)
  return noteNameFromPC(pcs[0]);
}

export async function parseMidiFileToLinear(midiPath: string) {
  const raw = fs.readFileSync(midiPath);
  const midi = new Midi(raw);
  const ticksPerBeat = midi.header.ppq || 480;
  // find tempo in µs per beat -> convert to bpm
  const tempo = midi.header?.tempos?.[0]?.bpm || 120;
  // Build timeline: gather all noteOn events across tracks
  const notesByTime = new Map<number, number[]>();
  midi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      const t = +note.time.toFixed(6);
      const pc = note.midi % 12;
      if (!notesByTime.has(t)) notesByTime.set(t, []);
      notesByTime.get(t)!.push(pc);
    });
  });
  const times = Array.from(notesByTime.keys()).sort((a, b) => a - b);
  // Quantize to nearest 16th note: 16th = quarter/4, beat duration in seconds = 60/tempo
  const beatSec = 60 / tempo;
  const sixteenth = beatSec / 4;
  const quantMap = new Map<number, number[]>();
  times.forEach((t) => {
    const q = Math.round(t / sixteenth) * sixteenth;
    if (!quantMap.has(q)) quantMap.set(q, []);
    quantMap.get(q)!.push(...(notesByTime.get(t) || []));
  });
  const quantTimes = Array.from(quantMap.keys()).sort((a, b) => a - b);
  // Build events and beat grid
  const events: any[] = [];
  const beat_timestamps: number[] = [];
  // For every quantized time, create chord event
  quantTimes.forEach((t, idx) => {
    const pcs = Array.from(new Set(quantMap.get(t) || []));
    const chord = detectChordFromPitchClasses(pcs);
    const nextT =
      idx + 1 < quantTimes.length ? quantTimes[idx + 1] : t + sixteenth;
    const duration = Math.max(0.001, nextT - t);
    events.push({
      timestamp: t,
      event_type: 'chord_candidate',
      chord_candidate: { root_candidates: [{ root: chord, probability: 1.0 }] },
      chord: chord,
      confidence: 1.0,
      duration,
    });
    // Make beat grid entries at quantized beat intervals aligned to quarter-notes
    if (
      Math.abs((t % beatSec) - 0) < 1e-6 ||
      Math.abs((t % beatSec) - beatSec) < 1e-6
    ) {
      beat_timestamps.push(t);
    }
  });
  // Add default beat grid if empty: step through length
  const durationTotal = Math.max(...quantTimes, 0) + beatSec;
  if (!beat_timestamps.length) {
    for (let b = 0; b < Math.ceil(durationTotal / beatSec); b++)
      beat_timestamps.push(b * beatSec);
  }
  // Build chroma frames (simple binary chroma for quant times)
  const chroma_frames = quantTimes.map((t, idx) => {
    const pcs = Array.from(new Set(quantMap.get(t) || []));
    const chroma = new Array(12).fill(0);
    pcs.forEach((pc) => (chroma[pc] = 1));
    return { timestamp: t, chroma };
  });
  const linear_analysis = {
    metadata: {
      sample_rate: 0,
      duration_seconds: durationTotal,
      detected_key: null,
      detected_mode: null,
    },
    beat_grid: { tempo_bpm: tempo, beat_timestamps, time_signature: '4/4' },
    events,
    chroma_frames,
    mfcc_frames: [],
    semantic_features: { frames: [] },
  };
  return linear_analysis;
}

export default { parseMidiFileToLinear };
