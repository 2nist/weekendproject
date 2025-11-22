const fs = require('fs');
const { Midi } = require('@tonejs/midi');

// Helper: convert midi number to pitch class (0..11)
function noteToPc(noteNumber) {
  return noteNumber % 12;
}

const PC_NAMES = [
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

function pcToName(pc) {
  return PC_NAMES[(pc + 12) % 12];
}

function detectSimpleTriad(pcs) {
  // Attempt to find root that matches (0,4,7) major or (0,3,7) minor
  const set = new Set(pcs);
  for (const pc of set) {
    const maj = [(pc + 4) % 12, (pc + 7) % 12];
    const min = [(pc + 3) % 12, (pc + 7) % 12];
    if (set.has(maj[0]) && set.has(maj[1])) return `${pcToName(pc)}`;
    if (set.has(min[0]) && set.has(min[1])) return `${pcToName(pc)}m`;
  }
  // Fallback: return single pitch if only one
  if (set.size === 1) return pcToName([...set][0]);
  return null;
}

/**
 * Parse midi file into a simplified linear analysis object compatible with existing UI transforms.
 * Returns { linear_analysis: { beat_grid: { beat_timestamps }, events: [chord candidates] }, metadata }
 */
function parseMidiToLinearAnalysis(midiPath) {
  const buffer = fs.readFileSync(midiPath);
  const midi = new Midi(buffer);
  const tempo =
    (midi.header.tempos &&
      midi.header.tempos[0] &&
      midi.header.tempos[0].bpm) ||
    120;
  const secondsPerBeat = 60 / tempo;
  const duration = midi.duration;

  const beatTimestamps = [];
  for (let t = 0; t < duration + secondsPerBeat; t += secondsPerBeat) {
    beatTimestamps.push(Number(t.toFixed(6)));
  }

  const events = [];

  // Gather notes by time bucket (quantize to beat window)
  for (let i = 0; i < beatTimestamps.length; i++) {
    const t = beatTimestamps[i];
    const windowStart = Math.max(0, t - secondsPerBeat * 0.25);
    const windowEnd = t + secondsPerBeat * 0.25;

    // Collect notes from all tracks
    const notes = [];
    midi.tracks.forEach((track) => {
      track.notes.forEach((n) => {
        if (n.time >= windowStart && n.time < windowEnd) {
          notes.push(n.midi);
        }
      });
    });

    if (notes.length > 0) {
      const pcs = [...new Set(notes.map((n) => noteToPc(n)))];
      const chordLabel = detectSimpleTriad(pcs) || null;
      events.push({
        event_type: 'chord_candidate',
        timestamp: t,
        beat_index: i,
        notes,
        pcs,
        chord: chordLabel,
        confidence: 0.8,
      });
    }
  }

  const linear_analysis = {
    metadata: {
      duration_seconds: duration,
      tempo_bpm: tempo,
    },
    events,
    beat_grid: {
      tempo_bpm: tempo,
      beat_timestamps: beatTimestamps,
      downbeat_timestamps: beatTimestamps.filter((_, i) => i % 4 === 0),
      drum_grid: [],
    },
  };

  return { linear_analysis };
}

module.exports = { parseMidiToLinearAnalysis };
