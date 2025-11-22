/**
 * Editor Context
 * Global state management for the Sandbox Editor
 * Prepares for multi-panel IDE layout (Sidebar, Grid, Inspector)
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type {
  EditorContextValue,
  EditorState,
  EditorActions,
  SelectionTarget,
  ViewMode,
  AnalysisData,
} from '../types/editor';

const EditorContext = createContext<EditorContextValue | null>(null);

interface EditorProviderProps {
  children: React.ReactNode;
  initialData?: AnalysisData | null;
}

export function EditorProvider({ children, initialData = null }: EditorProviderProps) {
  // Core State
  const [songData, setSongData] = useState<AnalysisData | null>(initialData);
  const [globalKey, setGlobalKey] = useState<string>(
    initialData?.harmonic_context?.global_key?.primary_key ||
      initialData?.linear_analysis?.metadata?.detected_key ||
      'C',
  );
  const [selection, setSelection] = useState<SelectionTarget>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('harmony');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Track if we've loaded data from fileHash
  const hasLoadedRef = useRef(false);

  // Load analysis data if initialData has fileHash but no linear_analysis
  useEffect(() => {
    const load = async () => {
      // Already have full analysis or already loaded
      if (songData?.linear_analysis || hasLoadedRef.current) return;
      
      const fileHash = initialData?.fileHash || initialData?.file_hash;
      if (!fileHash) {
        console.log('[EditorContext] No fileHash in initialData, cannot load analysis');
        return;
      }
      
      console.log('[EditorContext] Loading analysis for fileHash:', fileHash);
      hasLoadedRef.current = true;
      
      try {
        const ipcAPI = window?.electronAPI?.invoke || window?.ipc?.invoke;
        if (!ipcAPI) {
          console.error('[EditorContext] No IPC API available');
          return;
        }
        
        const res = await ipcAPI('ANALYSIS:GET_RESULT', fileHash);
        console.log('[EditorContext] ANALYSIS:GET_RESULT response:', res);
        
        if (res?.success && res.analysis) {
          console.log('[EditorContext] Setting analysis data from response');
          setSongData(res.analysis);
        } else if (res?.analysis) {
          console.log('[EditorContext] Setting analysis data (no success flag)');
          setSongData(res.analysis);
        } else {
          console.warn('[EditorContext] ANALYSIS:GET_RESULT returned no analysis object', res);
        }
      } catch (e) {
        console.error('[EditorContext] Failed to load analysis:', e);
        hasLoadedRef.current = false; // Allow retry on error
      }
    };
    
    load();
  }, [initialData?.fileHash, initialData?.file_hash, songData?.linear_analysis]);

  // Listen for chord recalculation updates
  useEffect(() => {
    if (!window?.ipc?.on) return;
    
    const handleReloadRequest = async (fileHash: string) => {
      const currentHash = songData?.fileHash || songData?.file_hash;
      if (fileHash && fileHash === currentHash) {
        console.log('[EditorContext] Reloading analysis after chord update...');
        try {
          const res = await window.ipc.invoke('ANALYSIS:GET_RESULT', fileHash);
          if (res?.success && res.analysis) {
            setSongData(res.analysis);
            console.log('[EditorContext] Analysis reloaded with updated chords');
          } else if (res?.analysis) {
            setSongData(res.analysis);
          }
        } catch (err) {
          console.error('[EditorContext] Failed to reload:', err);
        }
      }
    };

    const unsubscribe = window.ipc.on('ANALYSIS:RELOAD_REQUESTED', (data: any) => {
      if (data?.fileHash) {
        handleReloadRequest(data.fileHash);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [songData?.fileHash, songData?.file_hash]);

  // Actions
  const selectObject = useCallback((type: 'beat' | 'measure' | 'section', id: string, data: any) => {
    setSelection({ type, id, data } as SelectionTarget);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const updateKey = useCallback(async (newKey: string) => {
    setGlobalKey(newKey);
    setIsProcessing(true);
    try {
      const res = await globalThis.electron.recalcChords({
        fileHash: songData?.file_hash || songData?.fileHash,
        globalKey: newKey,
      });
      if (res?.success && songData) {
        setSongData((prev) => ({
          ...prev!,
          linear_analysis: {
            ...prev!.linear_analysis,
            events: res.events,
          },
        }));
        setIsDirty(true);
      }
    } catch (e) {
      console.error('[EditorContext] Recalc chord failed', e);
    } finally {
      setIsProcessing(false);
    }
  }, [songData]);

  const updateSongData = useCallback((newData: AnalysisData) => {
    setSongData(newData);
  }, []);

  const updateChord = useCallback((beatId: string, newChordLabel: string) => {
    setSongData((prev) => {
      if (!prev) return prev;
      const cloned = structuredClone(prev);
      const events = cloned.linear_analysis?.events || [];
      for (let ev of events) {
        if (ev.id === beatId || ev.timestamp === beatId) {
          ev.chord = newChordLabel;
        }
      }
      if (cloned.linear_analysis) {
        cloned.linear_analysis.events = events;
      }
      setIsDirty(true);
      return cloned;
    });
  }, []);

  const updateSection = useCallback((sectionId: string, patch: { label?: string; color?: string }) => {
    setSongData((prev) => {
      if (!prev) return prev;
      const cloned = structuredClone(prev);
      if (!cloned.structural_map || !Array.isArray(cloned.structural_map.sections)) return cloned;
      cloned.structural_map.sections = cloned.structural_map.sections.map((s: any) => {
        if (s.section_id === sectionId) {
          return { ...s, ...patch };
        }
        return s;
      });
      setIsDirty(true);
      return cloned;
    });
  }, []);

  const saveChanges = useCallback(async () => {
    if (!songData || (!songData.file_hash && !songData.fileHash)) return;
    setIsProcessing(true);
    try {
      const res = await globalThis.electron.recalcChords({
        fileHash: songData.file_hash || songData.fileHash,
        globalKey: globalKey,
        commit: true,
      });
      if (res?.success) {
        setIsDirty(false);
      }
    } catch (err) {
      console.error('[EditorContext] Failed to commit changes', err);
    } finally {
      setIsProcessing(false);
    }
  }, [songData, globalKey]);

  const setViewModeAction = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const setProcessing = useCallback((processing: boolean) => {
    setIsProcessing(processing);
  }, []);

  const setDirty = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  // Build context value
  const state: EditorState = {
    songData,
    globalKey,
    selection,
    viewMode,
    isProcessing,
    isDirty,
  };

  const actions: EditorActions = {
    selectObject,
    clearSelection,
    updateKey,
    updateSongData,
    updateChord,
    updateSection,
    saveChanges,
    setViewMode: setViewModeAction,
    setProcessing,
    setDirty,
  };

  const value: EditorContextValue = {
    state,
    actions,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

/**
 * Hook to access the Editor Context
 * Throws if used outside of EditorProvider
 */
export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}

