/**
 * Audio Analysis Types
 * Shared types for audio analysis data structures
 */

/**
 * Beat Node - Represents a single beat in the grid
 */
export interface BeatNode {
  id: string;
  beatIndex: number; // 0 to (numerator-1) within measure
  isAttack: boolean; // True if chord starts here
  isSustain: boolean; // True if it's a continuation of a previous chord (opposite of isAttack)
  chordLabel: string | null; // "Cmaj7" or null (rest/sustain)
  functionLabel?: string; // "V7" (Theorist data)
  isSelected: boolean;
  timestamp: number; // Original timestamp in seconds
  drums?: { hasKick: boolean; hasSnare: boolean; drums: string[] };
  confidence?: number; // 0-1 confidence score from analysis engine
  source?: string; // Engine source: 'TS_Viterbi_Engine', 'Python_Essentia', etc.
  hasConflict?: boolean; // True if multiple engines disagreed on chord
  isStableCore?: boolean; // True if this beat's chord matches the stable core of the measure
}

/**
 * Measure - Represents a musical measure (bar)
 */
export interface Measure {
  index: number; // Bar number (1-indexed)
  beats: BeatNode[]; // Array of beats, length equals time signature numerator
  timeSignature: { numerator: number; denominator: number }; // Time signature for this measure
  progressionId?: string; // "ii-V-I-group-1"
  startTime: number; // Start time in seconds
  endTime: number; // End time in seconds
  stableCoreChord?: string | null; // The most stable chord in this measure
}

/**
 * Grid Measure - Alias for Measure (used in grid transformers)
 */
export interface GridMeasure extends Measure {
  // Same as Measure, kept for backward compatibility
}

/**
 * Section - Represents a musical section (verse, chorus, etc.)
 */
export interface Section {
  id: string;
  label: string; // "Verse", "Chorus", etc.
  measures: Measure[];
  startTime: number;
  endTime: number;
  color?: string; // Color code for visual distinction
}

/**
 * Progression Group - Represents a chord progression spanning multiple measures
 */
export interface ProgressionGroup {
  id: string;
  label: string; // "ii-V-I Turnaround"
  measureIndices: number[]; // Which measures are part of this progression
  startMeasure: number;
  endMeasure: number;
}

