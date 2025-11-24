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
import { analysisCache, projectCache, invalidateAnalysisCache } from '../utils/cache';
import logger from '@/lib/logger';
import { handleAsyncError, AppError, showErrorToast } from '../utils/errorHandling';

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
  const loadedHashRef = useRef<string | null>(null);

  // Load analysis data if songData has fileHash but no linear_analysis
  // ✅ FIX: Use ref to track loaded hash, break dependency cycle
  useEffect(() => {
    const load = async () => {
      // Already have full analysis
      if (songData?.linear_analysis) {
        logger.debug('[EditorContext] Already have linear_analysis, skipping load');
        return;
      }

      // Get fileHash from songData (which might have been set by updateSongData)
      const fileHash =
        songData?.fileHash ||
        songData?.file_hash ||
        initialData?.fileHash ||
        initialData?.file_hash;
      if (!fileHash) {
        logger.debug('[EditorContext] No fileHash available, cannot load analysis');
        return;
      }

      // ✅ FIX: Skip if we've already loaded this hash
      if (loadedHashRef.current === fileHash) {
        logger.debug('[EditorContext] Already loaded this fileHash:', fileHash);
        return;
      }

      // Check cache first
      const cachedAnalysis = analysisCache.get(fileHash);
      if (cachedAnalysis) {
        console.log('[EditorContext] Using cached analysis for:', fileHash);
        setSongData(cachedAnalysis);
        loadedHashRef.current = fileHash;
        return;
      }

      logger.debug('[EditorContext] Loading analysis for fileHash:', fileHash);
      loadedHashRef.current = fileHash; // Mark as loading

      try {
        const ipcAPI = globalThis?.electronAPI?.invoke || globalThis?.ipc?.invoke;
        if (!ipcAPI) {
          logger.error('[EditorContext] No IPC API available');
          hasLoadedRef.current = false;
          return;
        }

        const res = await ipcAPI('ANALYSIS:GET_RESULT', fileHash);
        logger.debug('[EditorContext] ANALYSIS:GET_RESULT response:', {
          success: res?.success,
          hasAnalysis: !!res?.analysis,
          hasLinearAnalysis: !!res?.analysis?.linear_analysis || !!res?.linear_analysis,
          hasStructuralMap: !!res?.analysis?.structural_map || !!res?.structural_map,
          isDirectAnalysis: !!(res?.linear_analysis || res?.structural_map),
        });

        // Handle both wrapped response { success: true, analysis: {...} } and direct analysis object
        let analysisData = null;
        if (res?.success && res.analysis) {
          analysisData = res.analysis;
        } else if (res?.analysis) {
          analysisData = res.analysis;
        } else if (res?.linear_analysis || res?.structural_map || res?.file_hash) {
          // Response IS the analysis object directly
          analysisData = res;
        }

        if (analysisData) {
          logger.debug('[EditorContext] ✅ Setting analysis data:', {
            hasLinearAnalysis: !!analysisData.linear_analysis,
            hasStructuralMap: !!analysisData.structural_map,
            hasFilePath: !!analysisData.file_path,
            fileHash: analysisData.file_hash,
          });
          // Cache the analysis data
          analysisCache.set(fileHash, analysisData);
          setSongData(analysisData);
        } else {
          logger.warn('[EditorContext] ⚠️ ANALYSIS:GET_RESULT returned no analysis object', res);
          loadedHashRef.current = null; // ✅ Allow retry if no data
        }
      } catch (e) {
        const appError = handleAsyncError(e, 'EditorContext.loadAnalysis');
        logger.error('[EditorContext] ❌ Failed to load analysis:', appError.message);
        loadedHashRef.current = null; // ✅ Allow retry on error
      }
    };

    load();
  }, [
    songData?.fileHash,
    songData?.file_hash,
    // ✅ REMOVED: songData?.linear_analysis - causes infinite loop!
  ]);

  // Load project data when analysis data is available
  useEffect(() => {
    const loadProject = async () => {
      if (!songData?.id) return; // Need analysis ID to find project

      // Check cache first
      const cachedProject = projectCache.get(songData.id);
      if (cachedProject) {
        logger.debug('[EditorContext] Using cached project for analysis:', songData.id);
        setProject(cachedProject);
        return;
      }

      try {
        const ipcAPI = globalThis?.electronAPI?.invoke || globalThis?.ipc?.invoke;
        if (!ipcAPI) return;

        // Get all projects and find the one with matching analysis_id
        const projectsRes = await ipcAPI('LIBRARY:GET_PROJECTS');
        if (projectsRes?.success && projectsRes.projects) {
          const project = projectsRes.projects.find((p: any) => p.analysis_id === songData.id);
          if (project) {
            logger.debug('[EditorContext] Found project for analysis:', project);
            projectCache.set(songData.id, project);
            setProject(project);
          } else {
            logger.debug('[EditorContext] No project found for analysis ID:', songData.id);
            setProject(null);
          }
        }
      } catch (e) {
        const appError = handleAsyncError(e, 'EditorContext.loadProject');
        logger.error('[EditorContext] Failed to load project:', appError.message);
        showErrorToast(appError);
        setProject(null);
      }
    };

    loadProject();
  }, [songData?.id]);

  // Listen for chord recalculation updates
  // ✅ FIX: Register listener ONCE, use ref to access latest data
  useEffect(() => {
    if (!globalThis?.ipc?.on) return;

    // ✅ Use ref to access latest songData without dependency
    const songDataRef = { current: songData };

    // Update ref whenever songData changes (outside this effect)
    const updateRef = () => {
      songDataRef.current = songData;
    };
    updateRef();

    const handleReloadRequest = async (fileHash: string) => {
      const currentHash = songDataRef.current?.fileHash || songDataRef.current?.file_hash;
      if (fileHash && fileHash === currentHash) {
        console.log('[EditorContext] Reloading analysis after chord update...');
        try {
          const res = await globalThis.ipc.invoke('ANALYSIS:GET_RESULT', fileHash);
          if (res?.success && res.analysis) {
            setSongData(res.analysis);
            console.log('[EditorContext] Analysis reloaded with updated chords');
          } else if (res?.analysis) {
            setSongData(res.analysis);
          } else {
            const error = new AppError(
              'Failed to reload analysis after chord update',
              'RELOAD_FAILED',
              'The analysis could not be reloaded. Your changes may not be visible.',
              false, // Not critical, user can manually refresh
            );
            console.warn('[EditorContext] Reload failed:', error.message);
            showErrorToast(error);
          }
        } catch (err) {
          const appError = handleAsyncError(err, 'EditorContext.handleReloadRequest');
          console.error('[EditorContext] Failed to reload:', appError.message);
          showErrorToast(appError);
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
  }, []); // ✅ FIXED: Empty deps - register ONCE

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
        } else {
          const error = new AppError(
            res?.error || 'Failed to recalculate chords for new key',
            'RECALC_FAILED',
            'Could not update chords for the new key. Please try again.',
            true,
          );
          console.error('[EditorContext] Recalc chord failed:', error.message);
          showErrorToast(error);
        }
      } catch (e) {
        const appError = handleAsyncError(e, 'EditorContext.updateKey');
        console.error('[EditorContext] Recalc chord failed:', appError.message);
        showErrorToast(appError);
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
      } else {
        const error = new AppError(
          res?.error || 'Failed to save changes',
          'SAVE_FAILED',
          'Could not save your changes. Please try again.',
          true,
        );
        console.error('[EditorContext] Failed to commit changes:', error.message);
        showErrorToast(error);
      }
    } catch (err) {
      const appError = handleAsyncError(err, 'EditorContext.saveChanges');
      console.error('[EditorContext] Failed to commit changes:', appError.message);
      showErrorToast(appError);
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
