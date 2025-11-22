/**
 * Editor Types
 * Strict type definitions for the Global Editor Context
 */

import type { BeatNode, Measure, Section } from './audio';

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
 * Analysis Data Structure
 * The full JSON from the backend analysis
 */
export interface AnalysisData {
  fileHash?: string;
  file_hash?: string;
  file_path?: string;
  linear_analysis?: any;
  structural_map?: any;
  harmonic_context?: any;
  metadata?: any;
  [key: string]: any; // Allow additional properties
}

/**
 * Editor State
 * The complete state managed by EditorContext
 */
export interface EditorState {
  songData: AnalysisData | null;
  globalKey: string;
  selection: SelectionTarget;
  viewMode: ViewMode;
  isProcessing: boolean;
  isDirty: boolean;
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
  updateSection: (sectionId: string, patch: { label?: string; color?: string }) => void;
  saveChanges: () => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setProcessing: (processing: boolean) => void;
  setDirty: (dirty: boolean) => void;
}

/**
 * Editor Context Value
 * The complete context value provided to consumers
 */
export interface EditorContextValue {
  state: EditorState;
  actions: EditorActions;
}

