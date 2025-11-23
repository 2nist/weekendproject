/**
 * Unified Music Annotation Schema
 * Standardizes all .lab and JSON annotation formats for consistent processing
 */

export const UNIFIED_ANNOTATION_SCHEMA = {
  version: '1.0.0',
  metadata: {
    title: 'string',
    artist: 'string',
    album: 'string?',
    year: 'number?',
    genre: 'string?',
    bpm: 'number?',
    key: 'string?',
    time_signature: 'string?',
    duration_seconds: 'number?',
    source: 'string', // "lab_key", "lab_chord", "mcgill_billboard", "bimmuda", etc.
    confidence: 'number?', // 0-1 overall confidence score
    annotator: 'string?',
    annotation_date: 'string?',
  },
  sections: [
    {
      id: 'string', // unique identifier
      start_time: 'number', // seconds
      end_time: 'number', // seconds
      duration: 'number', // seconds (calculated)
      section_type: 'string', // "verse", "chorus", "intro", "bridge", etc.
      section_label: 'string?', // "A", "B", "C" etc.
      key_changes: [
        {
          time: 'number', // relative to section start
          key: 'string', // "C:major", "D:minor", etc.
          confidence: 'number?',
        },
      ],
      chord_progression: [
        {
          time: 'number', // relative to section start
          duration: 'number', // seconds
          chord: 'string', // "C:maj", "D:min7", etc.
          root: 'string', // "C", "D", etc.
          quality: 'string', // "maj", "min", "7", "min7", etc.
          extensions: 'string[]?', // ["9", "#11"]
          alterations: 'string[]?', // ["b5", "#5"]
          bass_note: 'string?', // for slash chords
          confidence: 'number?', // 0-1
          functional_role: 'string?', // "tonic", "dominant", etc.
        },
      ],
      lyrics: [
        {
          time: 'number',
          duration: 'number',
          text: 'string',
          confidence: 'number?',
        },
      ],
      tags: 'string[]', // ["annotated", "auto_generated", etc.]
    },
  ],
  global_key_changes: [
    {
      time: 'number', // absolute time in seconds
      key: 'string',
      confidence: 'number?',
    },
  ],
  validation: {
    format_compliance: 'boolean',
    timing_consistency: 'boolean',
    chord_syntax_valid: 'boolean',
    warnings: 'string[]',
    errors: 'string[]',
  },
};

/**
 * Chord name normalization mappings
 */
export const CHORD_NORMALIZATION = {
  // Quality mappings
  maj: 'major',
  min: 'minor',
  dim: 'diminished',
  aug: 'augmented',
  7: 'dominant7',
  maj7: 'major7',
  min7: 'minor7',
  dim7: 'diminished7',
  min7b5: 'minor7b5',
  '7sus4': '7sus4',
  9: 'dominant9',
  11: 'dominant11',
  13: 'dominant13',

  // Extension mappings
  b9: 'b9',
  '#9': '#9',
  '#11': '#11',
  b5: 'b5',
  '#5': '#5',
  b13: 'b13',

  // Special cases
  N: 'no_chord', // silence/rest
  X: 'unknown',
};

/**
 * Key normalization mappings
 */
export const KEY_NORMALIZATION = {
  C: 'C:major',
  'C:min': 'C:minor',
  'C:major': 'C:major',
  'C:minor': 'C:minor',
  // Add more as needed
};

/**
 * Convert .lab key annotation to unified format
 */
export function convertLabKeyToUnified(labContent, metadata = {}) {
  const lines = labContent
    .trim()
    .split('\n')
    .filter((line) => line.trim());
  const sections = [];
  const globalKeyChanges = [];

  let currentSection = null;
  let sectionStart = 0;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;

    const startTime = parseFloat(parts[0]);
    const endTime = parseFloat(parts[1]);
    const type = parts[2];

    if (type === 'Key') {
      const key = parts.slice(3).join(' ');
      const normalizedKey = KEY_NORMALIZATION[key] || key;

      // Create new section if key changes
      if (!currentSection || currentSection.key !== normalizedKey) {
        if (currentSection) {
          currentSection.end_time = startTime;
          currentSection.duration = currentSection.end_time - currentSection.start_time;
          sections.push(currentSection);
        }

        currentSection = {
          id: `section_${sections.length + 1}`,
          start_time: startTime,
          section_type: 'unknown',
          key_changes: [
            {
              time: 0,
              key: normalizedKey,
              confidence: 1.0,
            },
          ],
          chord_progression: [],
          lyrics: [],
          tags: ['key_annotated'],
        };
      }

      globalKeyChanges.push({
        time: startTime,
        key: normalizedKey,
        confidence: 1.0,
      });
    } else if (type === 'Silence') {
      // Handle silence sections
      if (currentSection) {
        currentSection.end_time = startTime;
        currentSection.duration = currentSection.end_time - currentSection.start_time;
        sections.push(currentSection);
      }

      currentSection = {
        id: `silence_${sections.length + 1}`,
        start_time: startTime,
        end_time: endTime,
        duration: endTime - startTime,
        section_type: 'silence',
        key_changes: [],
        chord_progression: [],
        lyrics: [],
        tags: ['silence'],
      };
      sections.push(currentSection);
      currentSection = null;
    }
  }

  // Close final section
  if (currentSection) {
    currentSection.end_time = metadata.duration_seconds || endTime;
    currentSection.duration = currentSection.end_time - currentSection.start_time;
    sections.push(currentSection);
  }

  return {
    version: UNIFIED_ANNOTATION_SCHEMA.version,
    metadata: {
      ...metadata,
      source: 'lab_key',
    },
    sections,
    global_key_changes: globalKeyChanges,
    validation: {
      format_compliance: true,
      timing_consistency: true,
      chord_syntax_valid: true,
      warnings: [],
      errors: [],
    },
  };
}

/**
 * Convert .lab chord annotation to unified format
 */
export function convertLabChordToUnified(labContent, metadata = {}) {
  const lines = labContent
    .trim()
    .split('\n')
    .filter((line) => line.trim());
  const sections = [];

  let currentSection = {
    id: 'chord_section_1',
    start_time: 0,
    section_type: 'unknown',
    key_changes: [],
    chord_progression: [],
    lyrics: [],
    tags: ['chord_annotated'],
  };

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;

    const startTime = parseFloat(parts[0]);
    const endTime = parseFloat(parts[1]);
    const chordName = parts.slice(2).join(' ');

    // Normalize chord name
    const normalizedChord = CHORD_NORMALIZATION[chordName] || chordName;

    // Parse chord components
    const chordInfo = parseChordName(normalizedChord);

    currentSection.chord_progression.push({
      time: startTime,
      duration: endTime - startTime,
      chord: normalizedChord,
      ...chordInfo,
      confidence: 1.0,
    });
  }

  // Set section end time
  if (currentSection.chord_progression.length > 0) {
    const lastChord = currentSection.chord_progression[currentSection.chord_progression.length - 1];
    currentSection.end_time = lastChord.time + lastChord.duration;
    currentSection.duration = currentSection.end_time - currentSection.start_time;
    sections.push(currentSection);
  }

  return {
    version: UNIFIED_ANNOTATION_SCHEMA.version,
    metadata: {
      ...metadata,
      source: 'lab_chord',
    },
    sections,
    global_key_changes: [],
    validation: {
      format_compliance: true,
      timing_consistency: true,
      chord_syntax_valid: true,
      warnings: [],
      errors: [],
    },
  };
}

/**
 * Parse chord name into components
 */
function parseChordName(chordName) {
  if (chordName === 'no_chord' || chordName === 'unknown') {
    return {
      root: null,
      quality: chordName,
      extensions: [],
      alterations: [],
      bass_note: null,
    };
  }

  // Simple parsing - can be enhanced
  const rootMatch = chordName.match(/^([A-G]#?|Bb)/);
  const root = rootMatch ? rootMatch[1] : chordName.charAt(0);

  let quality = 'major'; // default
  const extensions = [];
  const alterations = [];

  // Basic quality detection
  if (chordName.includes('min')) quality = 'minor';
  else if (chordName.includes('dim')) quality = 'diminished';
  else if (chordName.includes('aug')) quality = 'augmented';
  else if (chordName.includes('7')) quality = 'dominant7';
  else if (chordName.includes('maj7')) quality = 'major7';

  // Basic extension detection
  if (chordName.includes('9')) extensions.push('9');
  if (chordName.includes('11')) extensions.push('11');
  if (chordName.includes('13')) extensions.push('13');

  // Basic alteration detection
  if (chordName.includes('b5')) alterations.push('b5');
  if (chordName.includes('#5')) alterations.push('#5');
  if (chordName.includes('b9')) alterations.push('b9');
  if (chordName.includes('#9')) alterations.push('#9');
  if (chordName.includes('#11')) alterations.push('#11');

  return {
    root,
    quality,
    extensions,
    alterations,
    bass_note: null,
  };
}

/**
 * Convert McGill Billboard JSON to unified format
 */
export function convertMcGillToUnified(mcgillData) {
  const sections = mcgillData.sections.map((section) => ({
    id: section.id,
    start_time: section.start_ms / 1000, // convert to seconds
    end_time: (section.start_ms + section.duration_ms) / 1000,
    duration: section.duration_ms / 1000,
    section_type: section.sectionType.toLowerCase(),
    section_label: section.sectionLabel,
    key_changes: [],
    chord_progression: section.chords.map((chord, index) => {
      // Estimate timing - distribute evenly across section
      const chordDuration = section.duration_ms / 1000 / section.chords.length;
      const chordTime = section.start_ms / 1000 + index * chordDuration;

      const chordInfo = parseChordName(chord);

      return {
        time: chordTime,
        duration: chordDuration,
        chord: chord,
        ...chordInfo,
        confidence: 0.8, // McGill data is generally reliable
      };
    }),
    lyrics: [],
    tags: section.tags || ['mcgill_annotated'],
  }));

  return {
    version: UNIFIED_ANNOTATION_SCHEMA.version,
    metadata: {
      title: mcgillData.title,
      artist: mcgillData.artist,
      bpm: mcgillData.bpm,
      source: mcgillData.source,
      duration_seconds: sections.reduce((max, s) => Math.max(max, s.end_time), 0),
    },
    sections,
    global_key_changes: [],
    validation: {
      format_compliance: true,
      timing_consistency: true,
      chord_syntax_valid: true,
      warnings: [],
      errors: [],
    },
  };
}

export default {
  UNIFIED_ANNOTATION_SCHEMA,
  CHORD_NORMALIZATION,
  KEY_NORMALIZATION,
  convertLabKeyToUnified,
  convertLabChordToUnified,
  convertMcGillToUnified,
};
