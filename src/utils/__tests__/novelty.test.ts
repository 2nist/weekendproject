import {
  getNoveltyStatsForSection,
  getKeyChangeForSection,
  findLocalPeaks,
  findSignificantPeaks,
} from '@/utils/novelty';

describe('novelty helpers', () => {
  it('computes novelty stats for a section correctly', () => {
    const curve = [0, 0.1, 0.4, 0.8, 0.6, 0.2, 0];
    const section = { time_range: { start_time: 0.2, end_time: 0.6 } };
    // frameHop default 0.1 => startFrame=2, endFrame=6
    const stats = getNoveltyStatsForSection(section as any, curve as any, 0.1);
    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.peakValue).toBeCloseTo(0.8);
      expect(stats.peakFrame).toBe(3);
      expect(stats.peakTime).toBeCloseTo(0.3);
      expect(stats.average).toBeGreaterThan(0);
      // significant peaks exist for this dataset
      expect(stats.significantPeaks?.length).toBeGreaterThan(0);
      if (stats.significantPeaks && stats.significantPeaks.length) {
        expect(stats.significantPeaks[0].value).toBeCloseTo(0.8);
      }
    }
  });

  it('returns null for missing curve or section', () => {
    expect(getNoveltyStatsForSection(null as any, [], 0.1)).toBeNull();
    expect(getNoveltyStatsForSection({} as any, [], 0.1)).toBeNull();
  });

  it('finds local peaks and significant peaks', () => {
    const curve = [0, 0.1, 0.4, 0.8, 0.6, 0.2, 0, 0.2, 0.9, 0.3];
    const peaks = findLocalPeaks(curve as any);
    expect(peaks).toEqual([3, 8]);
    const significant = findSignificantPeaks(curve as any, 'percentile', 80);
    expect(significant.length).toBeGreaterThan(0);
  });

  it('detects key changes between sections', () => {
    const sections = [
      { harmonic_dna: { key_center: 'C', mode: 'major' } },
      { harmonic_dna: { key_center: 'G', mode: 'major' } },
      { harmonic_dna: { key_center: 'G', mode: 'major' } },
    ];
    const res = getKeyChangeForSection(sections as any, 1);
    expect(res).not.toBeNull();
    if (res) {
      expect(res.prevKey).toBe('C');
      expect(res.currKey).toBe('G');
      expect(res.nextKey).toBe('G');
      expect(res.changes.length).toBeGreaterThan(0);
    }
  });
});
