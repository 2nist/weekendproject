/**
 * useAnalysisSandbox Hook
 * Consumer of EditorContext that provides computed grid data
 * This hook transforms the raw analysis data into a grid structure
 * for easy consumption by UI components
 */

import { useMemo } from 'react';
import { transformAnalysisToGrid } from '../utils/gridTransformers';
import { useEditor } from '../contexts/EditorContext';

export function useAnalysisSandbox() {
  const { state, actions } = useEditor();
  const { songData } = state;

  // Compute grid from songData
  const grid = useMemo(() => {
    try {
      if (!songData?.linear_analysis) {
        return [];
      }
      // Use new transformer with Stable Core logic - pass full analysis data
      const sections = transformAnalysisToGrid(songData);
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
          progressions.push({ 
            section_id: section.section_id, 
            startBar: phrase[0].index, 
            length: phrase.length, 
            measures: phrase, 
            label: `Phrase ${phrase[0].index}` 
          });
        }
      }
    });
    return progressions;
  }

  const progressionGroups = useMemo(
    () => detectProgressions(grid, songData?.structural_map?.sections || []), 
    [grid, songData?.structural_map]
  );

  return {
    grid,
    sections: songData?.structural_map?.sections || [],
    globalKey: state.globalKey,
    isProcessing: state.isProcessing,
    isDirty: state.isDirty,
    progressionGroups,
    actions: {
      updateKey: actions.updateKey,
      updateChord: actions.updateChord,
      updateSection: actions.updateSection,
      saveChanges: actions.saveChanges,
    },
  };
}
