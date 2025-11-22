import path from 'node:path';
import listener from '../electron/analysis/listener';
import ChordAnalyzer from '../electron/analysis/chordAnalyzer';
import { parseChordLab } from '../benchmarks/labParser';

const ROOT = path.resolve(__dirname, '..');

async function testConfig() {
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

  const opts = {
    rootOnly: true,
    transitionProb: 0.8,
    rootPeakBias: 0.1,
    diatonicBonus: 0.1,
    temperature: 0.1,
    globalKey: 'C',
  };

  for (const s of songs) {
    console.log('Testing', s.name, 'with opts', opts);
    const res = await listener.analyzeAudio(s.audio, () => {});
    const la = res.linear_analysis;
    const analyzer = new ChordAnalyzer({ include7ths: true });
    const beats = analyzer.detectChords(la, opts);
    const gtSegments = parseChordLab(s.chord);
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
        (seg) => beat.timestamp >= seg.start && beat.timestamp < seg.end,
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
    console.log(`${s.name} accuracy: ${acc.toFixed(2)}%`);
  }
}

if (require.main === module) {
  (async () => {
    try {
      await testConfig();
    } catch (e) {
      console.error(e);
    }
  })();
}
