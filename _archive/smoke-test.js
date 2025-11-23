const path = require('path');
const db = require('../electron/db');
const listener = require('../electron/analysis/listener');
const architect = require('../electron/analysis/architect_canonical_final');
const the = require('../electron/analysis/theorist');
const metadataLookup = require('../electron/analysis/metadataLookup');
const engineConfig = require('../electron/config/engineConfig');

async function run() {
  try {
    console.log('Initializing DB for smoke test');
    const os = require('os');
    const fs = require('fs');
    const tmpDir = path.resolve(__dirname, '..', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const fakeApp = { getPath: (s) => tmpDir };
    await db.init(fakeApp);
    // No electron app context, but DB init isn't required to use file system db instance, so skip
    const song = path.resolve(__dirname, '../electron/analysis/test/01 Come Together.mp3');
    console.log('Analyzing:', song);
    const userHints = {};
    const metadata = metadataLookup.gatherMetadata(song, userHints) || {};
    const res = await listener.analyzeAudio(song, (p) => {}, metadata);
    const linear = res.linear_analysis;
    console.log(
      'Linear analysis events:',
      (linear.events || []).length,
      'beats:',
      (linear.beat_grid?.beat_timestamps || []).length,
    );
    // Load golden defaults from engine config
    let engineConfigData = null;
    try {
      engineConfigData = engineConfig.loadConfig();
      console.log('Loaded golden defaults for smoke test');
    } catch (e) {
      console.warn('Failed to load engine config, using hardcoded defaults:', e.message);
    }

    console.log('Running Architect (using production architect_canonical_final)');
    const archOpts = {
      downsampleFactor: engineConfigData?.architectOptions?.downsampleFactor || 4,
      forceOverSeg: engineConfigData?.architectOptions?.forceOverSeg || true,
      noveltyKernel: engineConfigData?.architectOptions?.noveltyKernel || 5,
      sensitivity: engineConfigData?.architectOptions?.sensitivity || 0.6,
      mergeChromaThreshold: engineConfigData?.architectOptions?.mergeChromaThreshold || 0.92,
      minSectionDurationSec: engineConfigData?.architectOptions?.minSectionDurationSec || 8.0,
      // V2 options if available
      adaptiveSensitivity: engineConfigData?.architectOptions?.adaptiveSensitivity || 1.5,
      mfccWeight: engineConfigData?.architectOptions?.mfccWeight || 0.5,
    };
    const struct = await architect.analyzeStructure(linear, (p) => {}, archOpts);
    console.log(
      'Architect debug:',
      Object.keys(struct.debug || {}).length
        ? {
            frame_hop: struct.debug.frame_hop,
            noveltyCurveLen: (struct.debug.noveltyCurve || []).length,
            threshold: struct.debug.threshold,
            maxNovelty: struct.debug.maxNovelty,
          }
        : 'no debug',
    );
    console.log('Struct sections:', struct.sections?.length || 0);
    console.log('Running Theorist');
    const corrected = await the.correctStructuralMap(struct, linear, metadata, (p) => {});
    console.log('Corrected sections:', corrected.sections?.length || 0);

    console.log('Saving analysis to DB');
    const analysisId = db.saveAnalysis({
      file_path: song,
      file_hash: `testfile-${Date.now()}`,
      metadata: res.metadata || {},
      linear_analysis: linear,
      structural_map: corrected,
      arrangement_flow: {},
      harmonic_context: {
        global_key: {
          primary_key: linear.metadata?.detected_key || 'C',
          mode: linear.metadata?.detected_mode || 'major',
          confidence: 0.8,
        },
      },
      polyrhythmic_layers: [],
    });
    console.log('Saved analysis ID:', analysisId);

    const saved = db.getAnalysisById(analysisId);
    console.log('Saved analysis event count:', saved.linear_analysis?.events?.length);

    // Now recalc with forced key (C# major)
    console.log('Recalc chords with global key C#');
    const recalcRes = listener.recalcChords(saved.linear_analysis, { globalKey: 'C# major' });
    if (!recalcRes.success) throw new Error('recalc failed: ' + recalcRes.error);
    // commit to DB
    saved.linear_analysis.events = recalcRes.events;
    saved.harmonic_context = saved.harmonic_context || {};
    saved.harmonic_context.global_key = { primary_key: 'C#', mode: 'major', confidence: 0.95 };
    const updated = db.updateAnalysisById(saved.id, saved);
    console.log('Commit updated:', updated);

    const reloaded = db.getAnalysisById(saved.id);
    console.log('Reloaded harmonic context:', reloaded.harmonic_context);
    console.log('Reloaded events length:', reloaded.linear_analysis.events.length);

    console.log('Smoke test completed successfully');
  } catch (err) {
    console.error('Smoke test failed:', err?.message || err);
    process.exit(1);
  }
}

run();
