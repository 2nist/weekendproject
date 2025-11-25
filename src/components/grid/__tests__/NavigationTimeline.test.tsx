import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { NavigationTimeline } from '@/components/grid/NavigationTimeline';

describe('NavigationTimeline', () => {
  it('renders significant peak markers when settings indicate significance', () => {
    const sections = [
      { section_id: 's1', section_label: 'Verse', time_range: { start_time: 0, end_time: 2 } },
      { section_id: 's2', section_label: 'Chorus', time_range: { start_time: 2, end_time: 6 } },
    ];
    const duration = 8;
    // Build a curve with a clear peak at index 24 (assume 61 frames)
    const noveltyCurve = Array.from({ length: 61 }, (_, i) => (i === 24 ? 0.9 : 0.2));
    const onSeek = vi.fn();

    render(
      <NavigationTimeline
        sections={sections as any}
        noveltyCurve={noveltyCurve}
        duration={duration}
        currentTime={0}
        onSeek={onSeek}
      />,
    );

    const svg = document.querySelector('svg');
    expect(svg).toBeTruthy();
    const circles = svg?.querySelectorAll('circle');
    expect(circles && circles.length > 0).toBeTruthy();
    if (circles && circles.length > 0) {
      fireEvent.click(circles[0]);
      expect(onSeek).toHaveBeenCalled();
    }
  });
});
