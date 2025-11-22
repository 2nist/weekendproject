const path = require('path');
const python = require('../electron/analysis/pythonEssentia');
(async () => {
  try {
    const testPath = path.resolve(
      'electron/analysis/test/01 Come Together.mp3',
    );
    const res = await python.analyzeAudioWithPython(testPath, (val) =>
      process.stdout.write(`p:${val}\n`),
    );
    console.log('\n--- Done');
    console.log('Result keys:', Object.keys(res));
    const la = res.linear_analysis || res;
    console.log('chroma_frames length:', la.chroma_frames?.length || 0);
    console.log('mfcc_frames length:', la.mfcc_frames?.length || 0);
  } catch (e) {
    console.error('Error:', e.message || e);
  }
})();
