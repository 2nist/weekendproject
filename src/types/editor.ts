/**
 * Editor Types
 * Strict type definitions for the Global Editor Context
 */

import type { BeatNode, Measure, Section } from './audio';

/**
 * Analysis Data Structure
 * The complete analysis result from the backend
 */
export interface AnalysisData {
  id?: number;
  fileHash?: string;
  file_hash?: string;
  file_path?: string;
  linear_analysis?: {
    events?: any[];
    beat_grid?: {
      beat_timestamps?: number[];
      tempo_bpm?: number;
      time_signature?: { numerator: number; denominator: number } | string;
    };
    metadata?: {
      duration_seconds?: number;
      detected_key?: string;
      detected_mode?: string;
      sample_rate?: number;
      hop_length?: number;
      frame_hop_seconds?: number;
    };
  };
  structural_map?: {
    sections?: any[];
    debug?: {
      noveltyCurve?: number[];
      novelty_curve?: number[];
    };
  };
  harmonic_context?: {
    global_key?: {
      primary_key?: string;
      confidence?: number;
    };
    alt_keys?: Array<{ key: string; confidence: number }>;
  };
  [key: string]: any; // Allow additional properties
}

/**
 * Selection Target - What the user has selected in the editor
 */
export type SelectionTarget =
  | { type: 'beat'; id: string; data: BeatNode }
  | { type: 'measure'; id: string; data: Measure }
  | { type: 'section'; id: string; data: Section }
  | null;

/**
 * View Mode - Which view is currently active
 */
export type ViewMode = 'harmony' | 'structure' | 'rhythm';

/**
 * Project Data Structure
 */
export interface Project {
  id: number;
  title: string;
  artist: string;
  analysis_id?: number;
  midi_path?: string;
  audio_path?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Editor State
 * The complete state managed by EditorContext
 */
export interface EditorState {
  songData: AnalysisData | null;
  project: Project | null;
  globalKey: string;
  selection: SelectionTarget;
  viewMode: ViewMode;
  isProcessing: boolean;
  isDirty: boolean;
  isPlaying: boolean;
  playbackTime: number;
}

/**
 * Editor Actions
 * Actions available in the EditorContext
 */
export interface EditorActions {
  selectObject: (type: 'beat' | 'measure' | 'section', id: string, data: any) => void;
  clearSelection: () => void;
  updateKey: (key: string) => Promise<void>;
  updateSongData: (newData: AnalysisData) => void;
  updateChord: (beatId: string, newChordLabel: string) => void;
  updateBeat: (
    beatId: string,
    patch: { chord?: string; hasKick?: boolean; hasSnare?: boolean; function?: string },
  ) => void;
  updateSection: (sectionId: string, patch: { label?: string; color?: string }) => void;
  saveChanges: () => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setProcessing: (processing: boolean) => void;
  setDirty: (dirty: boolean) => void;
  setPlaybackTime: (time: number) => void;
  togglePlayback: () => void;
}

/**
 * Editor Context Value
 * The complete context value provided to consumers
 */
export interface EditorContextValue {
  state: EditorState;
  actions: EditorActions;
}
