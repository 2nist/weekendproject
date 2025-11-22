const path = require('path');
const listener = require('../electron/analysis/listener');
const architect = require('../electron/analysis/architect_clean');
(async () => {
  try {
    const audioPath = path.resolve(
      'electron/analysis/test/01 Come Together.mp3',
    );
    console.log('Running listener.analyzeAudio...');
    const res = await listener.analyzeAudio(audioPath, () => {});
    console.log('Listener returned: keys:', Object.keys(res));
    const la = res.linear_analysis;
    console.log('linear.analysis keys:', Object.keys(la));
    console.log('chroma_frames len:', la.chroma_frames?.length || 0);
    console.log('mfcc_frames len:', la.mfcc_frames?.length || 0);

    console.log('Calling architect.analyzeStructure...');
    // Run default detection
    const structuralMapDefault = await architect.analyzeStructure(la, () => {});
    console.log(
      'Architect returned sections (default):',
      structuralMapDefault.sections.length,
    );

    // Run forced over-seg with merge heuristics
    const structuralMap = await architect.analyzeStructure(la, () => {}, {
      forceOverSeg: true,
      similarityThreshold: 0.5,
      mergeChromaThreshold: 0.85,
      minSectionDurationSec: 8,
      microSegmentSec: 4,
      mergeShortWithMfcc: true,
    });
    console.log(
      'Architect returned sections (force over-seg + merges):',
      structuralMap.sections.length,
    );

    // Run several forced over-seg combos with different merge strengths
    const combos = [
      {
        mergeChromaThreshold: 0.9,
        exactChromaThreshold: 0.9,
        exactMfccThreshold: 0.6,
      },
      {
        mergeChromaThreshold: 0.86,
        exactChromaThreshold: 0.92,
        exactMfccThreshold: 0.64,
      },
      {
        mergeChromaThreshold: 0.85,
        exactChromaThreshold: 0.95,
        exactMfccThreshold: 0.7,
      },
    ];
    const progressionSims = [0.65, 0.7, 0.75, 0.8];
    const progModes = ['rotationSliding', 'rotationOnly', 'normalized'];
    for (const c of combos) {
      for (const ps of progressionSims) {
        for (const pm of progModes) {
          // Non-aggressive run
          const m = await architect.analyzeStructure(la, () => {}, {
            forceOverSeg: true,
            similarityThreshold: 0.5,
            mergeChromaThreshold: c.mergeChromaThreshold,
            minSectionDurationSec: 8,
            microSegmentSec: 4,
            smallSec: 8,
            exactChromaThreshold: c.exactChromaThreshold,
            exactMfccThreshold: c.exactMfccThreshold,
            mergeShortWithMfcc: true,
            progressionSimilarityThreshold: ps,
            progressionSimilarityMode: pm,
          });
          console.log(
            'Architect returned sections (force over-seg combo):',
            {
              ...c,
              progressionSimilarityThreshold: ps,
              progressionSimilarityMode: pm,
              aggressive: false,
            },
            m.sections.length,
          );

          // Aggressive run with optional lowered threshold
          const aggressiveThresholds = [
            Math.max(0.55, ps - 0.1),
            Math.max(0.55, ps - 0.15),
          ];
          for (const at of aggressiveThresholds) {
            const ma = await architect.analyzeStructure(la, () => {}, {
              forceOverSeg: true,
              similarityThreshold: 0.5,
              mergeChromaThreshold: c.mergeChromaThreshold,
              minSectionDurationSec: 8,
              microSegmentSec: 4,
              smallSec: 8,
              exactChromaThreshold: c.exactChromaThreshold,
              exactMfccThreshold: c.exactMfccThreshold,
              mergeShortWithMfcc: true,
              progressionSimilarityThreshold: ps,
              progressionSimilarityMode: pm,
              aggressiveProgMerge: true,
              progressionSimilarityThresholdAggressive: at,
            });
            console.log(
              'Architect returned sections (force over-seg combo):',
              {
                ...c,
                progressionSimilarityThreshold: ps,
                progressionSimilarityMode: pm,
                aggressive: true,
                aggressiveThreshold: at,
              },
              ma.sections.length,
            );
          }
        }
      }
    }
  } catch (e) {
    console.error('Error', e.message || e);
  }
})();
