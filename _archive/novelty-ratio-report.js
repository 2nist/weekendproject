const path = require('path');
const fs = require('fs');
const listener = require('../electron/analysis/listener');
const architect = require('../electron/analysis/architect_clean');

const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.resolve(ROOT, 'electron', 'analysis', 'test');
const SONGS = [
  '01 Come Together.mp3',
  '02 Eleanor Rigby.mp3',
  "03 Maxwell's Silver Hammer.mp3",
  '04 Ob-La-Di, Ob-La-Da.mp3',
  '06 Let It Be.mp3',
  '06 Helter Skelter.mp3',
  '13 A Day In The Life.mp3',
];

async function analyze(file) {
  const audioPath = path.join(TEST_DIR, file);
  if (!fs.existsSync(audioPath)) return null;
  const analysisWrap = await listener.analyzeAudio(audioPath);
  const linear = analysisWrap.linear_analysis;
  const structure = await architect.analyzeStructure(linear);
  const curve = structure.debug?.noveltyCurve || [];
  const threshold = structure.debug?.threshold || 0;
  const maxPeak = curve.length ? Math.max(...curve) : 0;
  return {
    file,
    threshold,
    maxPeak,
    ratio: threshold > 0 ? maxPeak / threshold : null,
    debug: structure.debug,
    sections: structure.sections || [],
  };
}

async function main() {
  const results = [];
  for (const s of SONGS) {
    try {
      console.log(`Analyzing ${s}...`);
      const r = await analyze(s);
      if (!r) {
        console.warn(`Skipped missing ${s}`);
        continue;
      }
      results.push(r);
      // write debug report HTML copy
      const reportName = s.replace(/\s|\.|'/g, '_').replace(/__+/g, '_');
      const dest = path.resolve(
        ROOT,
        'benchmarks',
        'results',
        `debug_report_${reportName}.html`,
      );
      const existing = fs.readFileSync(
        path.resolve(ROOT, 'benchmarks', 'results', 'debug_report.html'),
        'utf8',
      );
      fs.writeFileSync(dest, existing);
      console.log(
        `  threshold=${r.threshold.toFixed(4)} maxPeak=${r.maxPeak.toFixed(4)} ratio=${r.ratio ? r.ratio.toFixed(2) : 'null'}`,
      );
    } catch (e) {
      console.error('Error', s, e.message || e);
    }
  }
  const out = path.resolve(
    ROOT,
    'benchmarks',
    'results',
    'novelty_ratio_report.json',
  );
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log('Saved summary to', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
