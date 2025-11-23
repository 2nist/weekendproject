/**
 * Analysis Engine Types
 * Types for the analysis pipeline (Pass 1, 2, 3)
 */

/**
 * Chord Probability Row
 * Array of chord candidates with scores
 */
export type ChordProbRow = { chord: string; score: number }[];

/**
 * Analysis Options
 * Configuration for chord analysis
 */
export interface AnalysisOptions {
  include7ths?: boolean;
  rootOnly?: boolean;
  temperature?: number;
  transitionProb?: number;
  diatonicBonus?: number;
  nonDiatonicPenalty?: number;
  rootPeakBias?: number;
  globalKey?: string;
  structuralMap?: any;
  windowShift?: number; // -0.05 to +0.05 seconds
  bassWeight?: number; // 0-1 for inversion detection
}

/**
 * Chord Event
 * Represents a chord detection event from the analysis engine
 */
export interface ChordEvent {
  timestamp: number;
  chord: string;
  root: string;
  quality: string;
  confidence: number;
  source: string;
  function?: string; // Roman numeral
  bassNote?: string;
}

/**
 * Analysis Result
 * Complete result from the analysis pipeline
 */
export interface AnalysisResult {
  fileHash: string;
  file_path: string;
  metadata: any;
  linear_analysis: any;
  structural_map: any;
  arrangement_flow?: any;
  harmonic_context?: any;
}


