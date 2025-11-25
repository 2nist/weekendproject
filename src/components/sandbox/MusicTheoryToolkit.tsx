import React from 'react';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MODE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

const MODE_CHORD_QUALITIES: Record<string, string[]> = {
  major: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'],
  minor: ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7'],
  dorian: ['m7', 'm7', 'maj7', '7', 'm7', 'm7b5', 'maj7'],
  mixolydian: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'],
  lydian: ['maj7#11', '7', 'm7', 'm7', 'maj7', 'm7', 'm7b5'],
};

const MODE_ROMANS: Record<string, string[]> = {
  major: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
  minor: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'],
  dorian: ['i', 'ii', '♭III', 'IV', 'v', 'vi°', '♭VII'],
  mixolydian: ['I', 'ii', 'iii°', 'IV', 'v', 'vi', '♭VII'],
  lydian: ['I', 'II', 'iii', '#iv°', 'V', 'vi', 'vii'],
};

const MODE_CADENCES: Record<string, { label: string; pattern: string[] }[]> = {
  major: [
    { label: 'Authentic', pattern: ['ii', 'V', 'I'] },
    { label: 'Plagal', pattern: ['IV', 'I'] },
    { label: 'Pop Lift', pattern: ['IV', 'V', 'vi', 'V'] },
  ],
  minor: [
    { label: 'Minor Authentic', pattern: ['ii°', 'V', 'i'] },
    { label: 'Aeolian Loop', pattern: ['i', 'VI', 'III', 'VII'] },
    { label: 'Tonic Pedal', pattern: ['i', 'iv', 'i'] },
  ],
  dorian: [
    { label: 'Modal Lift', pattern: ['i', 'IV', 'i'] },
    { label: 'Dorian Loop', pattern: ['i', 'VII', 'IV'] },
  ],
  mixolydian: [
    { label: 'Mixolydian Hook', pattern: ['I', '♭VII', 'IV'] },
    { label: 'Turnaround', pattern: ['ii', 'I', '♭VII'] },
  ],
  lydian: [
    { label: 'Float', pattern: ['I', 'II', 'I'] },
    { label: 'Dream', pattern: ['I', '#iv°', 'I'] },
  ],
};

function rotateScale(root: string, mode: string) {
  const intervals = MODE_INTERVALS[mode] || MODE_INTERVALS.major;
  const rootIndex = NOTE_NAMES.indexOf(root.toUpperCase());
  if (rootIndex === -1) return NOTE_NAMES;
  return intervals.map((interval) => NOTE_NAMES[(rootIndex + interval) % NOTE_NAMES.length]);
}

interface MusicTheoryToolkitProps {
  keyCenter: string;
  mode: string;
  onAppendProgression?: (romans: string[]) => void;
}

export const MusicTheoryToolkit: React.FC<MusicTheoryToolkitProps> = ({
  keyCenter,
  mode,
  onAppendProgression,
}) => {
  const scale = rotateScale(keyCenter, mode);
  const chordQualities = MODE_CHORD_QUALITIES[mode] || MODE_CHORD_QUALITIES.major;
  const romanNumerals = MODE_ROMANS[mode] || MODE_ROMANS.major;
  const cadences = MODE_CADENCES[mode] || MODE_CADENCES.major;

  return (
    <div className="border border-border rounded-lg p-4 mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-widest">
          Music Theory Toolkit
        </h3>
        <div className="text-[11px] text-muted-foreground font-mono">
          {keyCenter.toUpperCase()} {mode.charAt(0).toUpperCase() + mode.slice(1)}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Scale Degrees
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {scale.map((note, idx) => (
            <div
              key={`${note}-${idx}`}
              className="px-2 py-1 rounded-full bg-muted text-xs font-mono text-foreground"
            >
              {romanNumerals[idx] || `D${idx + 1}`}: {note}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Diatonic Chords
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {scale.map((note, idx) => (
            <button
              key={`chord-${note}-${idx}`}
              type="button"
              onClick={() => onAppendProgression?.([romanNumerals[idx] || note])}
              className="text-left px-3 py-2 rounded-md border border-border bg-card/70 hover:bg-card transition text-xs"
            >
              <div className="font-mono text-foreground text-sm">{romanNumerals[idx] || note}</div>
              <div className="text-[11px] text-muted-foreground">
                {note + (chordQualities[idx] || '')}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Cadence Ideas
        </div>
        <div className="flex flex-col gap-2 mt-2">
          {cadences.map((cadence) => (
            <button
              key={cadence.label}
              type="button"
              onClick={() => onAppendProgression?.(cadence.pattern)}
              className="flex items-center justify-between px-3 py-2 rounded-md border border-border text-left text-sm bg-accent/20 hover:bg-accent/30"
            >
              <span className="font-semibold text-foreground">{cadence.label}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {cadence.pattern.join(' → ')}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MusicTheoryToolkit;
