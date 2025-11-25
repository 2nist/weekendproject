export interface LyricDraftLine {
  text: string;
  line_number: number;
  time: number; // beats relative to section start
  duration_beats: number;
}

export interface SectionLyricLine {
  text: string;
  time: number; // absolute seconds
  duration: number; // seconds
  line_number: number;
  section_id?: string;
  section_label?: string;
  source?: string;
}

export const DEFAULT_BEATS_PER_LINE = 4;
export const DEFAULT_SECONDS_PER_BEAT = 0.5; // mirrors 120 BPM synthetic tempo

export function draftTextToLyricLines(
  draft: string,
  beatsPerLine = DEFAULT_BEATS_PER_LINE,
): LyricDraftLine[] {
  if (!draft || typeof draft !== 'string') return [];
  return draft
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((text, index) => ({
      text,
      line_number: index + 1,
      time: index * beatsPerLine,
      duration_beats: beatsPerLine,
    }));
}

interface BlockLike {
  id?: string;
  section_label?: string;
  label?: string;
  lyrics?: Array<Partial<LyricDraftLine> & { duration?: number }> | null;
  lyric_text?: string;
}

interface BlockLyricOptions {
  startTimeSeconds?: number;
  secondsPerBeat?: number;
  beatsPerLine?: number;
  source?: string;
}

export function blockLyricsToAbsolute(
  block: BlockLike,
  {
    startTimeSeconds = 0,
    secondsPerBeat = DEFAULT_SECONDS_PER_BEAT,
    beatsPerLine = DEFAULT_BEATS_PER_LINE,
    source = 'blank-canvas',
  }: BlockLyricOptions = {},
): SectionLyricLine[] {
  if (!block) return [];
  const baseLines =
    Array.isArray(block.lyrics) && block.lyrics.length > 0
      ? block.lyrics
      : draftTextToLyricLines(block.lyric_text || '', beatsPerLine);

  return baseLines
    .map((line, index) => {
      if (!line || !line.text) return null;
      const relativeBeats = typeof line.time === 'number' ? line.time : index * beatsPerLine;
      const durationBeats =
        typeof line.duration_beats === 'number'
          ? line.duration_beats
          : typeof line.duration === 'number'
            ? line.duration / secondsPerBeat
            : beatsPerLine;
      return {
        text: line.text,
        line_number: line.line_number || index + 1,
        time: startTimeSeconds + relativeBeats * secondsPerBeat,
        duration: durationBeats * secondsPerBeat,
        section_id: block.id,
        section_label: block.section_label || block.label,
        source,
      } as SectionLyricLine;
    })
    .filter((line): line is SectionLyricLine => Boolean(line));
}

export function flattenSectionLyrics(
  sections: Array<{
    section_id?: string;
    section_label?: string;
    lyrics?: SectionLyricLine[];
  }> | null,
): SectionLyricLine[] {
  if (!sections || !Array.isArray(sections)) return [];
  return sections
    .flatMap((section) =>
      (section.lyrics || []).map((line) => ({
        ...line,
        section_id: line.section_id || section.section_id,
        section_label: line.section_label || section.section_label,
      })),
    )
    .filter((line) => typeof line.time === 'number' && !!line.text)
    .sort((a, b) => a.time - b.time);
}
