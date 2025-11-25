import { describe, expect, it } from 'vitest';
import {
  draftTextToLyricLines,
  blockLyricsToAbsolute,
  flattenSectionLyrics,
  DEFAULT_SECONDS_PER_BEAT,
} from '../lyrics';

describe('lyrics utilities', () => {
  it('converts drafts into structured lyric lines', () => {
    const result = draftTextToLyricLines('Line one\n\nLine two\nLine three');
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ text: 'Line one', line_number: 1, time: 0 });
    expect(result[1]).toMatchObject({ text: 'Line two', line_number: 2, time: 4 });
  });

  it('generates absolute timeline lyrics from blocks', () => {
    const block = {
      id: 'section-1',
      section_label: 'Verse',
      lyrics: [
        { text: 'First', time: 0 },
        { text: 'Second', time: 4 },
      ],
    };

    const result = blockLyricsToAbsolute(block, { startTimeSeconds: 8, secondsPerBeat: 0.5 });
    expect(result).toHaveLength(2);
    expect(result[0].time).toBeCloseTo(8);
    expect(result[1].time).toBeCloseTo(8 + 4 * 0.5);
    expect(result[0].section_label).toBe('Verse');
  });

  it('flattens section lyrics and preserves ordering', () => {
    const sections = [
      {
        section_id: 'a',
        section_label: 'Verse',
        lyrics: [
          { text: 'First', time: 4 * DEFAULT_SECONDS_PER_BEAT, duration: DEFAULT_SECONDS_PER_BEAT },
        ],
      },
      {
        section_id: 'b',
        section_label: 'Chorus',
        lyrics: [
          { text: 'Second', time: DEFAULT_SECONDS_PER_BEAT, duration: DEFAULT_SECONDS_PER_BEAT },
        ],
      },
    ];

    const flattened = flattenSectionLyrics(sections);
    expect(flattened).toHaveLength(2);
    expect(flattened[0].section_label).toBe('Chorus');
    expect(flattened[1].section_label).toBe('Verse');
  });
});
