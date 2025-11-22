const path = require('path');
const listener = require('../electron/analysis/listener');
const architect = require('../electron/analysis/architect_clean');
const theorist = require('../electron/analysis/theorist');

async function analyzeFile(filePath) {
  try {
    console.log(`\nAnalyzing: ${filePath}`);
    const result = await listener.analyzeAudio(filePath, (p) =>
      console.log('Listener progress', p),
    );
    const linear = result.linear_analysis;
    const struct = await architect.analyzeStructure(linear, (p) =>
      console.log('Architect progress', p),
    );
    const corrected = await theorist.correctStructuralMap(
      struct,
      linear,
      {},
      (p) => console.log('Theorist progress', p),
    );
    console.log('Sections detected:', corrected.sections?.length || 0);
    corrected.sections?.forEach((s, i) =>
      console.log(
        `  ${i}: ${s.section_label} ${s.time_range?.start_time?.toFixed(2)}-${s.time_range?.end_time?.toFixed(2)}`,
      ),
    );
  } catch (e) {
    console.error('Analyze failed:', e);
  }
}

const ROOT = path.resolve(__dirname, '..');
const tests = [
  path.resolve(ROOT, 'electron/analysis/test/13 A Day In The Life.mp3'),
  path.resolve(ROOT, 'electron/analysis/test/06 Helter Skelter.mp3'),
];

(async () => {
  for (const f of tests) {
    await analyzeFile(f);
  }
})();
