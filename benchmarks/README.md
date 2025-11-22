# Automated Regression Testing Suite

This directory contains the automated regression testing system for the Music Analysis Engine.

## Overview

The benchmark suite automatically tests the engine against ground truth `.lab` files and tracks performance over time to detect regressions.

## Quick Start

```bash
# Run full benchmark suite
npm run test:benchmark

# View benchmark history
npm run test:benchmark:history

# View latest results
npm run test:benchmark:latest

# Compare two runs
npm run test:benchmark:compare <timestamp1> <timestamp2>
```

## Test Songs

The suite currently tests 7 songs:
- Come Together
- Eleanor Rigby
- Maxwell's Silver Hammer
- Ob-La-Di, Ob-La-Da
- Let It Be
- Helter Skelter
- A Day In The Life

Each song has:
- Section annotations (`.lab` files)
- Chord annotations (`*_chord.lab` files)
- Reference key for validation

## Metrics

The benchmark calculates three main metrics:

1. **Key Detection Score** (20 points)
   - Binary: Correct key = 20 points, Wrong = 0 points

2. **Chord Overlap Ratio** (60 points)
   - Percentage of time where detected chords match ground truth
   - Scored as: `chordRatio * 60`

3. **Segmentation Alignment** (20 points)
   - Percentage of section boundaries detected within 2-second tolerance
   - Scored as: `segmentRatio * 20`

**Total Score**: Sum of all three (max 100 points)

## Results Storage

Results are automatically saved to:
- `benchmarks/results/run_<timestamp>.json` - Individual run results
- `benchmarks/results/history.json` - Historical tracking (last 50 runs)

Each run includes:
- Timestamp
- Configuration used
- Individual song scores
- Summary statistics
- Regression alerts (if any)

## Regression Detection

The system automatically detects regressions by comparing current results to the previous run:

- **Threshold**: 10% decrease in any metric triggers an alert
- **Alerts**: Displayed after each run showing which songs/metrics regressed
- **History**: All runs are preserved for trend analysis

## Optimization Loop

The benchmark includes an automatic optimization loop that:
1. Runs baseline benchmarks
2. Analyzes results for specific songs
3. Adjusts `audioAnalyzerConfig.json` parameters if scores are low
4. Re-runs benchmarks with optimized settings

Current optimization rules:
- If Maxwell's chord accuracy < 70%: Lower `chroma_smoothing_window`
- If Come Together key detection fails: Increase `bass_weight`

## Commands

### `npm run test:benchmark`
Run the full benchmark suite with optimization loop.

### `npm run test:benchmark:history`
Display all previous benchmark runs with summary statistics.

### `npm run test:benchmark:latest`
Show the most recent benchmark results in detail.

### `npm run test:benchmark:compare <timestamp1> <timestamp2>`
Compare two specific benchmark runs side-by-side.

Example:
```bash
npm run test:benchmark:compare 2024-01-15T10:30:00 2024-01-16T10:30:00
```

## Adding New Test Songs

1. Add audio file to `electron/analysis/test/`
2. Add section `.lab` file (Isophonics format)
3. Add chord `*_chord.lab` file
4. Update `SONGS` array in `scripts/benchmark.ts`:

```typescript
{
  id: 'song_id',
  title: 'Song Title',
  audioPath: path.resolve(ROOT, 'electron', 'analysis', 'test', 'song.mp3'),
  sectionPath: path.resolve(ROOT, 'electron', 'analysis', 'test', 'song.lab'),
  chordPath: path.resolve(ROOT, 'electron', 'analysis', 'test', 'song_chord.lab'),
  referenceKey: 'C:maj', // Format: Root:mode
}
```

## Continuous Integration

To run benchmarks in CI/CD:

```yaml
# Example GitHub Actions
- name: Run Benchmarks
  run: npm run test:benchmark
  continue-on-error: true

- name: Check for Regressions
  run: |
    npm run test:benchmark:latest
    # Parse output and fail if regressions detected
```

## Troubleshooting

**No history found**: Run `npm run test:benchmark` first to create initial history.

**All scores are 0**: 
- Check that audio files exist
- Verify `.lab` files are in correct format
- Check engine logs for analysis errors

**Regressions detected**: 
- Review recent code changes
- Check `audioAnalyzerConfig.json` for parameter changes
- Compare detailed results with `test:benchmark:compare`

## File Format

### Section `.lab` files (Isophonics format)
```
0.000000 15.234567 intro
15.234567 45.123456 verse
45.123456 75.234567 chorus
```

### Chord `.lab` files (Isophonics format)
```
0.000000 2.345678 C
2.345678 4.567890 G
4.567890 6.789012 Am
```

## Future Enhancements

- [ ] HTML report generation
- [ ] Trend visualization charts
- [ ] Automated alerts (email/Slack)
- [ ] Performance profiling
- [ ] Multi-threaded execution
- [ ] Confidence interval calculations

