import path from 'node:path';
import listener from '../electron/analysis/listener';
import ChordAnalyzer from '../electron/analysis/chordAnalyzer';
import { parseChordLab } from '../benchmarks/labParser';

const ROOT = path.resolve(__dirname, '..');

async function runSingle() {
  const song = {
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
  };
  console.log('Analyzing', song.name);
  const res = await listener.analyzeAudio(song.audio, () => {});
  const la = res.linear_analysis;
  const analyzer = new ChordAnalyzer({ include7ths: true });
  const beats = analyzer.detectChords(la, {
    rootOnly: true,
    transitionProb: 0.95,
    rootPeakBias: 0.25,
  });
  const gtSegments = parseChordLab(song.chord);
  let totalDuration = 0;
  let correct = 0;
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
    const gtRoot = gt?.normalizedChord
      ? gt.normalizedChord.replace(/m$|maj7$|m7$|7$|dim$|aug$/i, '')
      : null;
    const detRoot = beat.chord
      ? beat.chord.replace(/m$|maj7$|m7$|7$|dim$|aug$/i, '')
      : null;
    if (gtRoot && detRoot && gtRoot.toUpperCase() === detRoot.toUpperCase())
      correct += duration;
  }
  const acc = totalDuration > 0 ? (correct / totalDuration) * 100 : 0;
  console.log('Come Together Accuracy:', acc.toFixed(2) + '%');
}

if (require.main === module) {
  (async () => {
    try {
      await runSingle();
    } catch (e) {
      console.error(e);
    }
  })();
}
