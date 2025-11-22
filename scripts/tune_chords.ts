import path from 'node:path';
import listener from '../electron/analysis/listener';
import ChordAnalyzer from '../electron/analysis/chordAnalyzer';
import { parseChordLab } from '../benchmarks/labParser';

const ROOT = path.resolve(__dirname, '..');

type SweepResult = {
  diatonicBonus: number;
  rootPeakBias: number;
  transitionProb: number;
  temperature: number;
  accuracy: number;
};

async function runSweep() {
  const song = {
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
  };
  console.log('Tuning on', song.name);
  const res = await listener.analyzeAudio(song.audio, () => {});
  const la = res.linear_analysis;
  const gtSegments = parseChordLab(song.chord);
  const sweepDi = [0.1, 0.3, 0.5];
  const sweepRoot = [0.1, 0.3, 0.5];
  const sweepTrans = [0.8, 0.9, 0.98];
  const sweepTemp = [0.1, 0.5, 1.0];
  const results: SweepResult[] = [];

  for (const di of sweepDi) {
    for (const rp of sweepRoot) {
      for (const tp of sweepTrans) {
        for (const temp of sweepTemp) {
          const analyzer = new ChordAnalyzer({ include7ths: true });
          const opts = {
            rootOnly: true,
            transitionProb: tp,
            rootPeakBias: rp,
            diatonicBonus: di,
            temperature: temp,
            globalKey: 'C',
          } as any;
          const beats = analyzer.detectChords(la, opts);
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
            if (
              gtRoot &&
              detRoot &&
              gtRoot.toUpperCase() === detRoot.toUpperCase()
            )
              correct += duration;
          }
          const acc = totalDuration > 0 ? (correct / totalDuration) * 100 : 0;
          results.push({
            diatonicBonus: di,
            rootPeakBias: rp,
            transitionProb: tp,
            temperature: temp,
            accuracy: acc,
          });
          console.log(
            `diatonic=${di} rootPeak=${rp} trans=${tp} temp=${temp} -> acc=${acc.toFixed(2)}%`,
          );
        }
      }
    }
  }
  results.sort((a, b) => b.accuracy - a.accuracy);
  console.log('\nTop 3 configurations:');
  results.slice(0, 3).forEach((r, idx) => {
    console.log(
      `${idx + 1}. acc=${r.accuracy.toFixed(2)}% opts=${JSON.stringify({ diatonicBonus: r.diatonicBonus, rootPeakBias: r.rootPeakBias, transitionProb: r.transitionProb, temperature: r.temperature })}`,
    );
  });
  console.log('\nBest config: ' + JSON.stringify(results[0]));
}

if (require.main === module) {
  (async () => {
    try {
      await runSweep();
    } catch (e) {
      console.error(e);
    }
  })();
}
