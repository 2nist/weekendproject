import React from 'react';
import { render, screen } from '@testing-library/react';
import { ContextualInspector } from '@/components/grid/ContextualInspector';

describe('ContextualInspector summary', () => {
  it('shows novelty peak and key change for section selection', () => {
    const sections = [
      {
        section_id: 's1',
        section_label: 'Verse',
        harmonic_dna: { key_center: 'C', mode: 'major' },
        time_range: { start_time: 0, end_time: 2 },
      },
      {
        section_id: 's2',
        section_label: 'Chorus',
        harmonic_dna: { key_center: 'G', mode: 'major' },
        time_range: { start_time: 2, end_time: 6 },
      },
      {
        section_id: 's3',
        section_label: 'Bridge',
        harmonic_dna: { key_center: 'G', mode: 'minor' },
        time_range: { start_time: 6, end_time: 10 },
      },
    ];
    // Make a curve that spans at least 61 frames (0..60 for 0.1s frameHop)
    const noveltyCurve = Array.from({ length: 61 }, (_, i) => {
      if (i === 24) return 0.9; // peak at 2.4s
      if (i >= 20 && i <= 60) return 0.2;
      return 0.0;
    });

    render(
      <ContextualInspector
        selected={{ type: 'section', data: sections[1] }}
        onClose={() => {}}
        onUpdateBeat={() => {}}
        onUpdateSection={() => {}}
        onDeleteSection={() => {}}
        onDuplicateSection={() => {}}
        onSplitSection={() => {}}
        onChordChange={() => {}}
        sections={sections}
        noveltyCurve={noveltyCurve}
      />,
    );

    // Summary title should be present
    expect(screen.getByText('Summary')).toBeTruthy();
    // Novelty string should show a number and 's' for seconds
    expect(screen.getByText(/Novelty Peak:/)).toBeTruthy();
    // Key changes label should be present
    expect(screen.getByText(/Key Changes:/)).toBeTruthy();
    // Suggest Split button appears when significant peak is present
    expect(screen.getByText(/Suggest Split/)).toBeTruthy();
    // Sparkline should render
    expect(document.querySelector('.w-full.h-8, svg')).toBeTruthy();
    // Significant peak list should show the peak time (may appear multiple times)
    const matches = screen.getAllByText(/2.40s/);
    expect(matches.length).toBeGreaterThan(0);
  });
});
