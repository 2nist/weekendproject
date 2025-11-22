import { useState, useMemo, useEffect } from 'react';
import { transformAnalysisToGrid } from '../utils/musicTimeTransform';

export function useAnalysisSandbox(initialData: any) {
  const [songData, setSongData] = useState(initialData);
  const [globalKey, setGlobalKey] = useState(
    initialData?.harmonic_context?.global_key?.primary_key ||
      initialData?.linear_analysis?.metadata?.detected_key ||
      'C',
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const grid = useMemo(() => {
    try {
      if (!songData?.linear_analysis) {
        return [];
      }
      const sections = transformAnalysisToGrid(songData.linear_analysis || {}, songData.structural_map);
      // Flatten sections to get all measures
      if (!Array.isArray(sections)) {
        return [];
      }
      const measures: any[] = [];
      sections.forEach((section: any) => {
        if (section?.measures && Array.isArray(section.measures)) {
          measures.push(...section.measures);
        }
      });
      return measures;
    } catch (error) {
      console.error('[useAnalysisSandbox] Error transforming grid:', error);
      return [];
    }
  }, [songData]);

  // Listen for chord recalculation updates
  useEffect(() => {
    if (!window?.ipc?.on) return;
    
    const handleReloadRequest = async (fileHash: string) => {
      const currentHash = songData?.fileHash || songData?.file_hash;
      if (fileHash && fileHash === currentHash) {
        console.log('[useAnalysisSandbox] Reloading analysis after chord update...');
        try {
          const res = await window.ipc.invoke('ANALYSIS:GET_RESULT', fileHash);
          if (res?.success && res.analysis) {
            setSongData(res.analysis);
            console.log('[useAnalysisSandbox] Analysis reloaded with updated chords');
          } else if (res?.analysis) {
            setSongData(res.analysis);
          }
        } catch (err) {
          console.error('[useAnalysisSandbox] Failed to reload:', err);
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

  // If initialData doesn't include linear_analysis but includes a fileHash, fetch it
  useEffect(() => {
    const load = async () => {
      // Already have full analysis
      if (songData?.linear_analysis) return;
      const fileHash = initialData?.fileHash || initialData?.file_hash;
      if (!fileHash) {
        console.log('[useAnalysisSandbox] No fileHash in initialData, cannot load analysis');
        return;
      }
      console.log('[useAnalysisSandbox] Loading analysis for fileHash:', fileHash);
      try {
        // Try electronAPI first, then fallback to ipc
        const ipcAPI = window?.electronAPI?.invoke || window?.ipc?.invoke;
        if (!ipcAPI) {
          console.error('[useAnalysisSandbox] No IPC API available');
          return;
        }
        const res = await ipcAPI('ANALYSIS:GET_RESULT', fileHash);
        console.log('[useAnalysisSandbox] ANALYSIS:GET_RESULT response:', res);
        // Expect shape { success, analysis }
        if (res?.success && res.analysis) {
          console.log('[useAnalysisSandbox] Setting analysis data from response');
          setSongData(res.analysis);
        } else if (res?.analysis) {
          console.log('[useAnalysisSandbox] Setting analysis data (no success flag)');
          setSongData(res.analysis);
        } else {
          console.warn('[useAnalysisSandbox] ANALYSIS:GET_RESULT returned no analysis object', res);
        }
      } catch (e) {
        console.error('[useAnalysisSandbox] Failed to load analysis for sandbox:', e);
      }
    };
    load();
  }, [initialData?.fileHash, initialData?.file_hash, songData?.linear_analysis]);

  const updateKey = async (newKey: string) => {
    setGlobalKey(newKey);
    setIsProcessing(true);
    try {
      const res = await globalThis.electron.recalcChords({
        fileHash: songData.file_hash,
        globalKey: newKey,
      });
      if (res?.success) {
        setSongData((prev) => ({
          ...prev,
          linear_analysis: {
            ...prev.linear_analysis,
            events: res.events,
          },
        }));
        setIsDirty(true);
      }
    } catch (e) {
      console.error('Recalc chord failed', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateChord = (beatId: string, newChordLabel: string) => {
    setSongData((prev) => {
      const cloned = structuredClone(prev);
      const events = cloned.linear_analysis.events || [];
      for (let ev of events) {
        if (ev.id === beatId || ev.timestamp === beatId) {
          ev.chord = newChordLabel;
        }
      }
      cloned.linear_analysis.events = events;
      setIsDirty(true);
      return cloned;
    });
  };

  const saveChanges = async () => {
    if (!songData || !songData.file_hash) return;
    setIsProcessing(true);
    try {
      const res = await globalThis.electron.recalcChords({
        fileHash: songData.file_hash,
        globalKey: globalKey,
        commit: true,
      });
      if (res?.success) {
        setIsDirty(false);
      }
    } catch (err) {
      console.error('Failed to commit changes', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Small helper: update a section (e.g., label or time range)
  const updateSection = (sectionId: string, patch: any) => {
    setSongData((prev) => {
      const cloned = structuredClone(prev);
      if (!cloned.structural_map || !Array.isArray(cloned.structural_map.sections)) return cloned;
      cloned.structural_map.sections = cloned.structural_map.sections.map((s) => {
        if (s.section_id === sectionId) {
          return { ...s, ...patch };
        }
        return s;
      });
      setIsDirty(true);
      return cloned;
    });
  };

  // Build simple progression groups: group measures by 4-bar phrases per section
  function detectProgressions(gridMeasures: any[], sections: any[]) {
    const progressions: any[] = [];
    sections.forEach((section: any) => {
      const start = section.time_range?.start_time || 0;
      const end = section.time_range?.end_time || Infinity;
      const sectionMeasures = gridMeasures.filter((m) => m.startTime >= start && m.startTime < end);
      for (let i = 0; i < sectionMeasures.length; i += 4) {
        const phrase = sectionMeasures.slice(i, i + 4);
        if (phrase.length > 0) {
          progressions.push({ section_id: section.section_id, startBar: phrase[0].index, length: phrase.length, measures: phrase, label: `Phrase ${phrase[0].index}` });
        }
      }
    });
    return progressions;
  }

  const progressionGroups = useMemo(() => detectProgressions(grid, songData.structural_map?.sections || []), [grid, songData.structural_map]);

  return {
    grid,
    sections: songData.structural_map?.sections || [],
    globalKey,
    isProcessing,
    isDirty,
    progressionGroups,
    actions: { updateKey, updateChord, updateSection, saveChanges },
  };
}
