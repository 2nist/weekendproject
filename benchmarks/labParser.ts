import fs from 'fs';

export interface SectionSegment {
  start: number;
  end: number;
  label: string;
}

export interface ChordSegment {
  start: number;
  end: number;
  rawLabel: string;
  normalizedChord: string | null;
}

const SILENCE_REGEX = /^(silence|n)$/i;

export function parseSectionLab(filePath: string): SectionSegment[] {
  return parseGenericLab(filePath).map((seg) => ({
    start: seg.start,
    end: seg.end,
    label: seg.label ?? '',
  }));
}

export function parseChordLab(filePath: string): ChordSegment[] {
  return parseGenericLab(filePath).map((seg) => ({
    start: seg.start,
    end: seg.end,
    rawLabel: seg.label ?? '',
    normalizedChord: normalizeChordLabel(seg.label ?? ''),
  }));
}

function parseGenericLab(filePath: string): Array<{ start: number; end: number; label: string | null }> {
  const contents = fs.readFileSync(filePath, 'utf8');
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const segments: Array<{ start: number; end: number; label: string | null }> = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    const start = parseFloat(parts[0]);
    const end = parseFloat(parts[1]);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    const label = parts.slice(2).join(' ').trim() || null;
    segments.push({ start, end, label });
  }

  return segments;
}

export function normalizeChordLabel(label: string): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed || SILENCE_REGEX.test(trimmed)) {
    return null;
  }

  let pureLabel = trimmed.replace(/\(.*\)/g, '').replace(/\*+/g, '').trim();
  pureLabel = pureLabel.replace(/^key\s+/i, '');

  return normalizeChordSymbol(pureLabel);
}

function normalizeChordSymbol(symbol: string): string | null {
  if (!symbol) return null;
  let base = symbol.trim();

  base = base.replace(/\s+/g, '');
  base = base.replace(/\/.+$/, '');

  const [rootPart, qualityPart = ''] = base.split(':');
  const root = normalizeRoot(rootPart);
  if (!root) return null;

  const quality = qualityPart ? normalizeQuality(qualityPart) : '';
  return `${root}${quality}`;
}

function normalizeRoot(root: string | undefined): string | null {
  if (!root) return null;
  const match = root.match(/^([A-Ga-g])([b#]?)/);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = match[2] || '';
  return `${letter}${accidental}`;
}

function normalizeQuality(quality: string): string {
  const lower = quality.toLowerCase();
  if (!lower || lower === 'maj') return '';
  if (lower.startsWith('min')) return 'm';
  if (lower === 'maj7') return 'maj7';
  if (lower === 'min7') return 'm7';
  if (lower === '7') return '7';
  if (lower === 'dim') return 'dim';
  if (lower === 'aug') return 'aug';
  return lower.replace(/[^a-z0-9]/gi, '');
}

