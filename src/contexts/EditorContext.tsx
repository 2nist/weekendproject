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
  Project,
} from '../types/editor';

const EditorContext = createContext<EditorContextValue | null>(null);

interface EditorProviderProps {
  children: React.ReactNode;
  initialData?: AnalysisData | null;
}

export function EditorProvider({ children, initialData = null }: EditorProviderProps) {
  // Core State
  const [songData, setSongData] = useState<AnalysisData | null>(initialData);
  const [project, setProject] = useState<Project | null>(null);
  const [globalKey, setGlobalKey] = useState<string>(
    initialData?.harmonic_context?.global_key?.primary_key ||
      initialData?.linear_analysis?.metadata?.detected_key ||
      'C',
  );
  const [selection, setSelection] = useState<SelectionTarget>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('harmony');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const hasLoadedRef = useRef(false);

  // Load analysis data if songData has fileHash but no linear_analysis
  useEffect(() => {
    const load = async () => {
      // Already have full analysis
      if (songData?.linear_analysis) {
        console.log('[EditorContext] Already have linear_analysis, skipping load');
        return;
      }

      // Get fileHash from songData (which might have been set by updateSongData)
      const fileHash =
        songData?.fileHash ||
        songData?.file_hash ||
        initialData?.fileHash ||
        initialData?.file_hash;
      if (!fileHash) {
        console.log('[EditorContext] No fileHash available, cannot load analysis');
        return;
      }

      // Prevent multiple simultaneous loads for the same hash
      const loadKey = `loading-${fileHash}`;
      if (hasLoadedRef.current === loadKey) {
        console.log('[EditorContext] Already loading this fileHash:', fileHash);
        return;
      }

      console.log('[EditorContext] Loading analysis for fileHash:', fileHash);
      hasLoadedRef.current = loadKey;

      try {
        const ipcAPI = globalThis?.electronAPI?.invoke || globalThis?.ipc?.invoke;
        if (!ipcAPI) {
          console.error('[EditorContext] No IPC API available');
          hasLoadedRef.current = false;
          return;
        }

        const res = await ipcAPI('ANALYSIS:GET_RESULT', fileHash);
        console.log('[EditorContext] ANALYSIS:GET_RESULT response:', {
          success: res?.success,
          hasAnalysis: !!res?.analysis,
          hasLinearAnalysis: !!res?.analysis?.linear_analysis,
          hasStructuralMap: !!res?.analysis?.structural_map,
        });

        if (res?.success && res.analysis) {
          console.log('[EditorContext] ✅ Setting analysis data from response');
          setSongData(res.analysis);
          hasLoadedRef.current = `loaded-${fileHash}`;
        } else if (res?.analysis) {
          console.log('[EditorContext] ✅ Setting analysis data (no success flag)');
          setSongData(res.analysis);
          hasLoadedRef.current = `loaded-${fileHash}`;
        } else {
          console.warn('[EditorContext] ⚠️ ANALYSIS:GET_RESULT returned no analysis object', res);
          hasLoadedRef.current = false; // Allow retry
        }
      } catch (e) {
        console.error('[EditorContext] ❌ Failed to load analysis:', e);
        hasLoadedRef.current = false; // Allow retry on error
      }
    };

    load();
  }, [
    songData?.fileHash,
    songData?.file_hash,
    songData?.linear_analysis,
    initialData?.fileHash,
    initialData?.file_hash,
  ]);

  // Load project data when analysis data is available
  useEffect(() => {
    const loadProject = async () => {
      if (!songData?.id) return; // Need analysis ID to find project

      try {
        const ipcAPI = globalThis?.electronAPI?.invoke || globalThis?.ipc?.invoke;
        if (!ipcAPI) return;

        // Get all projects and find the one with matching analysis_id
        const projectsRes = await ipcAPI('LIBRARY:GET_PROJECTS');
        if (projectsRes?.success && projectsRes.projects) {
          const project = projectsRes.projects.find((p: any) => p.analysis_id === songData.id);
          if (project) {
            console.log('[EditorContext] Found project for analysis:', project);
            setProject(project);
          } else {
            console.log('[EditorContext] No project found for analysis ID:', songData.id);
            setProject(null);
          }
        }
      } catch (e) {
        console.error('[EditorContext] Failed to load project:', e);
        setProject(null);
      }
    };

    loadProject();
  }, [songData?.id]);

  // Listen for chord recalculation updates
  useEffect(() => {
    if (!globalThis?.ipc?.on) return;

    const handleReloadRequest = async (fileHash: string) => {
      const currentHash = songData?.fileHash || songData?.file_hash;
      if (fileHash && fileHash === currentHash) {
        console.log('[EditorContext] Reloading analysis after chord update...');
        try {
          const res = await globalThis.ipc.invoke('ANALYSIS:GET_RESULT', fileHash);
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

    const unsubscribe = globalThis.ipc.on('ANALYSIS:RELOAD_REQUESTED', (data: any) => {
      if (data?.fileHash) {
        handleReloadRequest(data.fileHash);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [songData?.fileHash, songData?.file_hash]);

  // Actions
  const selectObject = useCallback(
    (type: 'beat' | 'measure' | 'section', id: string, data: any) => {
      setSelection({ type, id, data } as SelectionTarget);
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const updateKey = useCallback(
    async (newKey: string) => {
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
    },
    [songData],
  );

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

  const updateBeat = useCallback(
    (
      beatId: string,
      patch: { chord?: string; hasKick?: boolean; hasSnare?: boolean; function?: string },
    ) => {
      setSongData((prev) => {
        if (!prev) return prev;
        const cloned = structuredClone(prev);
        const events = cloned.linear_analysis?.events || [];
        for (let ev of events) {
          if (ev.id === beatId || ev.timestamp === beatId) {
            if (patch.chord !== undefined) ev.chord = patch.chord;
            if (patch.function !== undefined) ev.function = patch.function;
            if (patch.hasKick !== undefined) {
              ev.drums = ev.drums || {};
              ev.drums.hasKick = Boolean(patch.hasKick);
            }
            if (patch.hasSnare !== undefined) {
              ev.drums = ev.drums || {};
              ev.drums.hasSnare = Boolean(patch.hasSnare);
            }
          }
        }
        if (cloned.linear_analysis) cloned.linear_analysis.events = events;
        setIsDirty(true);
        return cloned;
      });
    },
    [],
  );

  const updateSection = useCallback(
    (sectionId: string, patch: { label?: string; color?: string }) => {
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
    },
    [],
  );

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
    project,
    globalKey,
    selection,
    viewMode,
    isProcessing,
    isDirty,
    isPlaying,
    playbackTime,
  };

  const actions: EditorActions = {
    selectObject,
    clearSelection,
    updateKey,
    updateSongData,
    updateChord,
    updateBeat,
    updateSection,
    saveChanges,
    setViewMode: setViewModeAction,
    setProcessing,
    setDirty,
    setPlaybackTime,
    togglePlayback: useCallback(() => setIsPlaying((prev) => !prev), []),
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
