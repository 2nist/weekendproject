# Structure Stability Test

## Overview

The Structure Stability Test (`scripts/test-structure.ts`) is a specialized diagnostic tool for debugging segmentation issues in the Audio Analysis Engine. It compares detected section boundaries against ground truth `.lab` files and provides actionable feedback.

## Quick Start

```bash
npm run test:structure
```

## Metrics

### 1. Boundary F-Measure (F-Score)
- **Tolerance**: ±3 seconds
- **Precision**: Hits / (Hits + Ghosts) - How many detected boundaries are correct?
- **Recall**: Hits / (Hits + Misses) - How many actual boundaries were found?
- **F-Score**: Harmonic mean of Precision and Recall

**Terminology**:
- **Hit**: Detected boundary within 3s of actual boundary
- **Miss**: Actual boundary with no matching detected boundary
- **Ghost**: Detected boundary with no matching actual boundary (False Positive)

### 2. Fragmentation Index
- **Formula**: `Detected Sections / Ground Truth Sections`
- **Goal**: 1.0 (perfect match)
- **Warning Thresholds**:
  - `> 1.2`: Over-segmenting (too many sections detected)
  - `< 0.8`: Under-segmenting (too few sections detected)
  - `> 1.5`: Severe over-segmentation (likely needs parameter adjustment)

## Output Format

```
================================================================================
STRUCTURE STABILITY TEST REPORT
================================================================================
Tolerance: ±3 seconds

--------------------------------------------------------------------------------
SONG                           | F-SCORE  | FRAG. INDEX  | STATUS                   
--------------------------------------------------------------------------------
Let It Be                      | 0.92     | 1.00         | ✅ PASS                 
Maxwell's Silver Hammer        | 0.40     | 2.50         | ❌ FAIL (Over-segmented)
Come Together                  | 0.85     | 0.90         | ⚠️ WARN                 
--------------------------------------------------------------------------------

Summary:
  Average F-Score: 0.723
  Average Fragmentation Index: 1.47
  Pass: 1 | Warn: 1 | Fail: 5
```

## Status Indicators

- ✅ **PASS**: F-Score ≥ 0.8 AND Fragmentation Index between 0.8-1.2
- ⚠️ **WARN**: F-Score between 0.5-0.8 OR Fragmentation Index slightly off (0.5-0.8 or 1.2-1.5)
- ❌ **FAIL**: F-Score < 0.5 OR Fragmentation Index < 0.5 or > 1.5

## Refinement Suggestions

The test automatically provides suggestions based on failure patterns:

### Over-Segmentation (Fragmentation Index > 1.5)
**Symptom**: Too many sections detected (e.g., Maxwell's Silver Hammer: 2.5x expected)

**Causes**:
- Every chord change detected as section change
- Transient events (anvil hits, drum fills) creating false boundaries
- Novelty threshold too low

**Suggestions**:
1. **Increase `MIN_SECTION_DURATION`** in `architect.js` (currently 12 seconds)
2. **Increase `novelty_threshold`** in `audioAnalyzerConfig.json` (currently 0.2)
3. **Apply 10-second moving average smoothing** to Novelty Curve (✅ Already implemented)
4. **Apply median filter** to remove short spikes (✅ Already implemented)

### Under-Segmentation (Fragmentation Index < 0.5)
**Symptom**: Too few sections detected (e.g., detecting 1-2 sections when 10-14 expected)

**Causes**:
- Sections too similar (same harmonic content, different timbre)
- Novelty threshold too high
- Similarity matrix not detecting differences

**Suggestions**:
1. **Enable Timbre Tracking (MFCCs)** in Pass 2 - sections may have same notes but different timbre
2. **Lower `novelty_threshold`** in `audioAnalyzerConfig.json`
3. **Improve similarity detection** - use MFCCs in addition to chroma features
4. **Reduce `MIN_SECTION_DURATION`** if sections are legitimately short

### High Ghost Count (Many False Positives)
**Symptom**: Many detected boundaries with no matching ground truth

**Causes**:
- Jittery novelty curve
- Dynamic range changes (crescendos) triggering false boundaries
- Insufficient smoothing

**Suggestions**:
1. **Apply 10-second moving average smoothing** to Novelty Curve (✅ Implemented)
2. **Apply median filter** to remove spikes (✅ Implemented)
3. **Increase `novelty_threshold`** to filter out weak signals

### High Miss Count (Many Missed Boundaries)
**Symptom**: Many actual boundaries not detected

**Causes**:
- Novelty threshold too high
- Sections too similar (need timbre features)
- Smoothing too aggressive

**Suggestions**:
1. **Lower `novelty_threshold`** in `audioAnalyzerConfig.json`
2. **Enable Timbre Tracking (MFCCs)** to detect timbre changes
3. **Reduce smoothing window** if it's blurring real boundaries

## Implementation Details

### Novelty Curve Smoothing
The test recommends applying a **10-second moving average** to the novelty curve. This has been implemented in `architect.js`:

```javascript
// 10-second moving average smoothing
const smoothingWindowSeconds = 10;
const smoothingWindow = Math.round(smoothingWindowSeconds / FRAME_HOP_SECONDS);
const smoothedNovelty = smoothSeries(novelty, smoothingWindow);

// Additional median filter for spike removal
const medianFiltered = applyMedianFilter(smoothedNovelty, ...);
```

### Median Filter
A median filter is applied to remove short spikes (like anvil hits in "Maxwell's Silver Hammer") that would otherwise create false section boundaries.

## Test Songs

The test suite includes 7 Beatles songs, each representing a specific challenge:

| Song | Challenge | Expected Issue |
|------|-----------|----------------|
| **Come Together** | Groove/Sparse | Bass detection & groove logic |
| **Let It Be** | Piano Ballad | Chord recognition in simple polyphony |
| **Maxwell's Silver Hammer** | Vaudeville | Complex harmonic movement & over-segmentation |
| **Eleanor Rigby** | Strings Only | Beat tracking without drums |
| **Helter Skelter** | Distortion/Noise | Chroma robustness against spectral noise |
| **Ob-La-Di, Ob-La-Da** | Ska/Pop | Fast harmonic rhythm |
| **A Day In The Life** | Orchestral/Avant-garde | False sections from dynamic transitions |

## Output Files

- **Console**: Real-time test results
- **File**: `benchmarks/results/structure-test-report.txt` - Full report saved to disk

## Integration with Calibration

The Structure Stability Test works alongside the automated calibration system:

1. **Run Structure Test**: `npm run test:structure` to identify segmentation issues
2. **Review Suggestions**: Check which parameters need adjustment
3. **Run Calibration**: `npm run test:benchmark` to apply optimizations
4. **Re-test**: Verify improvements with structure test

## Example Workflow

```bash
# 1. Run structure test to identify issues
npm run test:structure

# 2. Review suggestions (e.g., "Increase NOVELTY_THRESHOLD")

# 3. Manually adjust config or run calibration
# Edit audioAnalyzerConfig.json or run:
npm run test:benchmark

# 4. Re-run structure test to verify
npm run test:structure
```

## Troubleshooting

**All songs showing Fragmentation Index < 0.1**:
- Analysis is likely failing and falling back to placeholder structures
- Check Essentia integration and logs
- Verify audio files exist and are readable

**High precision (1.0) but low recall (< 0.2)**:
- Detected boundaries are correct but missing most boundaries
- Likely under-segmentation - lower `novelty_threshold`

**Low precision (< 0.5) and high fragmentation (> 1.5)**:
- Many false positives - increase `novelty_threshold` or `MIN_SECTION_DURATION`

**F-Score = 0.0**:
- No boundaries detected at all
- Check if analysis completed successfully
- Verify ground truth `.lab` files are correct

## Future Enhancements

- [ ] Visual ribbon comparison (React component)
- [ ] Per-song parameter profiles
- [ ] Automatic parameter adjustment based on suggestions
- [ ] Integration with CI/CD pipeline
- [ ] Trend tracking over time

