/**
 * Grid Transformers
 * Transforms analysis data to grid structure using Stable Core logic
 */

import { transformAnalysisToGrid as baseTransform } from './musicTimeTransform';
import type { Section, Measure, BeatNode, GridMeasure } from '../types/audio';

// Re-export types for convenience
export type { Section, Measure, BeatNode, GridMeasure } from '../types/audio';

/**
 * Transform analysis data to grid structure using Stable Core logic
 * 
 * Stable Core Logic:
 * - Groups beats by Time Signature Numerator
 * - For chords: Uses the most stable/confident chord within each measure
 * - Prefers chords that persist across multiple beats (core stability)
 * 
 * @param analysisData - Analysis data from backend (linear_analysis + structural_map)
 * @returns Array of sections with measures and beats
 */
export function transformAnalysisToGrid(analysisData: any): Section[] {
  if (!analysisData) return [];
  
  // Extract linear_analysis and structural_map
  const linearAnalysis = analysisData.linear_analysis || analysisData;
  const structuralMap = analysisData.structural_map || analysisData.structuralMap;
  
  // Use base transformer to get initial structure
  const sections = baseTransform(linearAnalysis, structuralMap);
  
  // Apply Stable Core logic: For each measure, find the most stable chord
  // A stable chord is one that appears in the majority of beats within a measure
  const sectionsWithStableCore = sections.map(section => ({
    ...section,
    measures: section.measures.map(measure => {
      // Count chord occurrences within this measure
      const chordCounts = new Map<string, { count: number; confidence: number }>();
      
      measure.beats.forEach(beat => {
        if (beat.chordLabel) {
          const existing = chordCounts.get(beat.chordLabel) || { count: 0, confidence: 0 };
          chordCounts.set(beat.chordLabel, {
            count: existing.count + 1,
            confidence: existing.confidence + (beat.confidence || 0.5),
          });
        }
      });
      
      // Find the stable core chord (most frequent, or highest confidence if tied)
      let stableCoreChord: string | null = null;
      let maxCount = 0;
      let maxConfidence = 0;
      
      chordCounts.forEach((stats, chord) => {
        if (stats.count > maxCount || (stats.count === maxCount && stats.confidence > maxConfidence)) {
          maxCount = stats.count;
          maxConfidence = stats.confidence;
          stableCoreChord = chord;
        }
      });
      
      // If stable core exists and appears in majority of beats, mark beats accordingly
      // This doesn't change the data, just helps with visualization
      const beatsWithStableCore = measure.beats.map(beat => ({
        ...beat,
        // Mark if this beat's chord matches the stable core
        isStableCore: beat.chordLabel === stableCoreChord,
      }));
      
      return {
        ...measure,
        beats: beatsWithStableCore,
        stableCoreChord, // Add metadata about the stable core
      };
    }),
  }));
  
  return sectionsWithStableCore;
}

