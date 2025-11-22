const path = require('path');
const listener = require('../electron/analysis/listener');
const architect = require('../electron/analysis/architect_clean');

(async () => {
  try {
    const audioPath = path.resolve(
      'electron/analysis/test/01 Come Together.mp3',
    );
    console.log('Analyzing:', audioPath);
    const res = await listener.analyzeAudio(audioPath, () => {});
    const la = res.linear_analysis;

    const kernels = [3, 5, 7, 9, 11];
    const sensitivities = [0.4, 0.6, 0.8, 1.0];
    const clusterThresholds = [0.3, 0.4, 0.5, 0.6];
    const mfccSensitivities = [0.12, 0.2, 0.3, 0.5];
    const mfccFloors = [0.06, 0.08, 0.12];
    const mergeChromaThresholds = [0.75, 0.8, 0.85, 0.9];
    const minSectionDurationSecs = [6.0, 8.0, 10.0];
    for (const k of kernels) {
      for (const s of sensitivities) {
        for (const ct of clusterThresholds) {
          for (const ms of mfccSensitivities) {
            for (const mf of mfccFloors) {
              for (const mergeThr of mergeChromaThresholds) {
                for (const minDur of minSectionDurationSecs) {
                  // no exact threshold sweep here
                  console.log(
                    `\nTesting kernel=${k}, sensitivity=${s}, clusterThreshold=${ct}, mfccSens=${ms}, mfccFloor=${mf}`,
                  );
                  const structuralMap = await architect.analyzeStructure(
                    la,
                    () => {},
                    {
                      noveltyKernel: k,
                      forceOverSeg: false,
                      sensitivity: s,
                      similarityThreshold: ct,
                      mfccSensitivity: ms,
                      mfccFloor: mf,
                      mergeChromaThreshold: mergeThr,
                      minSectionDurationSec: minDur,
                      mergeShortWithMfcc: true,
                    },
                  );
                  console.log(
                    `→ kernel=${k}, sens=${s}, clusterThr=${ct}, mfccSens=${ms}, mfccFloor=${mf}, mergeThr=${mergeThr}, minDur=${minDur} -> ${structuralMap.sections.length} sections`,
                  );
                }
              }
            }
          }
        }
      }
    }

    console.log(
      '\nNow testing force-over-seg mode (40 uniform picks) with cluster thresholds',
    );
    // reuse clusterThresholds variable
    for (const ct of clusterThresholds) {
      for (const mergeThr of [0.8, 0.85, 0.9]) {
        for (const minDur of [6.0, 8.0, 10.0]) {
          console.log(
            `\nForce-over-seg with clusterThr=${ct}, mergeThr=${mergeThr}, minDur=${minDur}`,
          );
          const structuralMap2 = await architect.analyzeStructure(
            la,
            () => {},
            {
              noveltyKernel: 9,
              forceOverSeg: true,
              similarityThreshold: ct,
              mergeChromaThreshold: mergeThr,
              minSectionDurationSec: minDur,
              mergeShortWithMfcc: true,
            },
          );
          console.log(
            `Force-over-seg with clusterThr=${ct}, mergeThr=${mergeThr}, minDur=${minDur} -> ${structuralMap2.sections.length} sections`,
          );
        }
      }
    }
  } catch (e) {
    console.error('Error', e.message || e);
  }
})();
