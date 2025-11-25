import React from 'react';
import { render, screen } from '@testing-library/react';
import NoveltyCurveVisualizer from '@/components/NoveltyCurveVisualizer';

describe('NoveltyCurveVisualizer threshold', () => {
  it('renders threshold line and label based on method/param', () => {
    const sections = [
      { section_id: 's1', section_label: 'Verse', time_range: { start_time: 0, end_time: 2 } },
    ];
    const curve = Array.from({ length: 61 }, (_, i) => (i === 24 ? 0.9 : 0.2));
    render(
      <NoveltyCurveVisualizer
        structuralMap={{ debug: { noveltyCurve: curve }, sections }}
        detectionMethod="mad"
        detectionParam={1.5}
      />,
    );
    // Check threshold text presence on screen
    expect(screen.getByText(/Threshold:/)).toBeTruthy();
  });
});
