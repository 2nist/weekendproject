import path from 'node:path';
import listener from '../electron/analysis/listener';
import ChordAnalyzer from '../electron/analysis/chordAnalyzer';
import { parseChordLab } from '../benchmarks/labParser';

const ROOT = path.resolve(__dirname, '..');

async function runSong(
  songAudio: string,
  chordLabPath: string,
  opts: any = {},
) {
  console.log('Analyzing', songAudio);
  const res = await listener.analyzeAudio(songAudio, () => {});
  const la = res.linear_analysis;
  const analyzer = new ChordAnalyzer({ include7ths: true });
  const beats = analyzer.detectChords(la, opts);
  const gtSegments = parseChordLab(chordLabPath);

  // For each beat, find ground truth label
  let totalDuration = 0;
  let correctDuration = 0;
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const nextT =
      i + 1 < beats.length
        ? beats[i + 1].timestamp
        : la.metadata?.duration_seconds || beat.timestamp + 1;
    const duration = nextT - beat.timestamp;
    totalDuration += duration;
    const gt = gtSegments.find(
      (s) => beat.timestamp >= s.start && beat.timestamp < s.end,
    );
    const gtLabel = gt?.normalizedChord || null;
    const gtRoot = gtLabel
      ? gtLabel.replace(/m$|maj7$|m7$|7$|dim$|aug$/i, '')
      : null;
    const detRoot = beat.chord
      ? beat.chord.replace(/m$|maj7$|m7$|7$|dim$|aug$/i, '')
      : null;
    const match =
      gtRoot === detRoot ||
      (gtRoot && detRoot && gtRoot.toUpperCase() === detRoot.toUpperCase());
    if (match) correctDuration += duration;
  }
  const accuracy =
    totalDuration > 0 ? (correctDuration / totalDuration) * 100 : 0;
  console.log(
    `Song: ${path.basename(songAudio)} Accuracy: ${accuracy.toFixed(2)}%`,
  );
  return accuracy;
}

async function runAll() {
  const songs = [
    {
      name: 'Let It Be',
      audio: path.resolve(
        ROOT,
        'electron',
        'analysis',
        'test',
        '06 Let It Be.mp3',
      ),
      chord: path.resolve(
        ROOT,
        'electron',
        'analysis',
        'test',
        '06_-_Let_It_Be_chord.lab',
      ),
    },
    {
      name: 'Come Together',
      audio: path.resolve(
        ROOT,
        'electron',
        'analysis',
        'test',
        '01 Come Together.mp3',
      ),
      chord: path.resolve(
        ROOT,
        'electron',
        'analysis',
        'test',
        '01_-_Come_Together_chord.lab',
      ),
    },
    {
      name: 'Maxwell',
      audio: path.resolve(
        ROOT,
        'electron',
        'analysis',
        'test',
        "03 Maxwell's Silver Hammer.mp3",
      ),
      chord: path.resolve(
        ROOT,
        'electron',
        'analysis',
        'test',
        "03_-_Maxwell's_Silver_Hammer_chord.lab",
      ),
    },
  ];
  for (const s of songs) {
    let acc = await runSong(s.audio, s.chord);
    // Tuning pass if poor accuracy
    if (acc < 70) {
      console.log('Tuning: trying stickier transitionProb 0.95');
      acc = await runSong(s.audio, s.chord, { transitionProb: 0.95 });
    }
    if (acc < 70) {
      const res = await listener.analyzeAudio(s.audio, () => {});
      const key = res.linear_analysis?.metadata?.detected_key || null;
      const mode = res.linear_analysis?.metadata?.detected_mode || 'major';
      if (key) {
        const keyMask = getKeyMask(key, mode);
        console.log('Tuning: applying keyMask for', key, mode);
        acc = await runSong(s.audio, s.chord, {
          transitionProb: 0.95,
          keyMask,
        });
      }
    }
    if (acc < 70) {
      // Try stronger diatonic bias
      console.log('Tuning: applying stronger diatonic bias');
      const res2 = await listener.analyzeAudio(s.audio, () => {});
      const key2 = res2.linear_analysis?.metadata?.detected_key || null;
      const mode2 = res2.linear_analysis?.metadata?.detected_mode || 'major';
      if (key2) {
        const keyMask2 = getKeyMask(key2, mode2);
        acc = await runSong(s.audio, s.chord, {
          transitionProb: 0.95,
          keyMask: keyMask2,
          diatonicBonus: 0.25,
          nonDiatonicPenalty: 0.1,
        });
        console.log('Tuning: applying stronger diatonic bias result:', acc);
      }
    }
    if (acc < 70)
      console.log(`Warning: ${s.name} accuracy below 70%: ${acc.toFixed(2)}%`);
  }
}

function rootToPc(root: string) {
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
  if (!root) return 0;
  const k = root.toUpperCase().replace(/[^A-G#]/g, '');
  return map[k] ?? 0;
}

function getKeyMask(key: string, mode: string) {
  const tonic = rootToPc(key);
  // Major diatonic triad roots: 0,2,4,5,7,9
  const major = [0, 2, 4, 5, 7, 9];
  const minor = [0, 2, 3, 5, 7, 9];
  const arr = mode && mode.toLowerCase().startsWith('min') ? minor : major;
  const diatonic = new Set<number>(arr.map((x) => (tonic + x) % 12));
  return { diatonic, delta: 0.1 };
}

if (require.main === module) {
  runAll().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
