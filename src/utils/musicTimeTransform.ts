/**
 * Music Time Transformation Utilities
 * Converts linear time (seconds) to musical time (bars & beats)
 */

export interface BeatNode {
  id: string;
  beatIndex: number; // 0-3 within measure
  isAttack: boolean; // True if chord starts here
  chordLabel: string | null; // "Cmaj7" or null (rest/sustain)
  functionLabel?: string; // "V7" (Theorist data)
  isSelected: boolean;
  timestamp: number; // Original timestamp in seconds
  drums?: { hasKick: boolean; hasSnare: boolean; drums: string[] };
}

export interface Measure {
  index: number; // Bar number (1-indexed)
  beats: BeatNode[]; // [1, 2, 3, 4]
  progressionId?: string; // "ii-V-I-group-1"
  startTime: number; // Start time in seconds
  endTime: number; // End time in seconds
}

export interface Section {
  id: string;
  label: string; // "Verse", "Chorus", etc.
  measures: Measure[];
  startTime: number;
  endTime: number;
  color?: string; // Color code for visual distinction
}

export interface ProgressionGroup {
  id: string;
  label: string; // "ii-V-I Turnaround"
  measureIndices: number[]; // Which measures are part of this progression
  startMeasure: number;
  endMeasure: number;
}

/**
 * Transform linear analysis data to grid structure
 * @param linearAnalysis - Output from Pass 1 (The Listener)
 * @param structuralMap - Output from Pass 2/3 (The Architect/Theorist)
 * @returns Array of sections with measures and beats
 */
export function transformAnalysisToGrid(
  linearAnalysis: any,
  structuralMap?: any,
): Section[] {
  const tempoBpm = linearAnalysis?.beat_grid?.tempo_bpm || 120;
  const beatTimestamps = linearAnalysis?.beat_grid?.beat_timestamps || [];
  const drumGrid = linearAnalysis?.beat_grid?.drum_grid || [];
  const downbeatTimestamps =
    linearAnalysis?.beat_grid?.downbeat_timestamps || [];
  const chordEvents =
    linearAnalysis?.events?.filter(
      (e: any) => e.event_type === 'chord_candidate',
    ) || [];

  const sections = structuralMap?.sections || [];
  const duration = linearAnalysis?.metadata?.duration_seconds || 0;

  // Calculate beats per second
  const beatsPerSecond = tempoBpm / 60;
  const secondsPerBeat = 1 / beatsPerSecond;
  const beatsPerMeasure = 4; // Assuming 4/4 time

  // If we have downbeats, use them; otherwise calculate from tempo
  const measures: Measure[] = [];
  let currentBar = 1;
  let currentBeatInBar = 0;

  // Create a map of chord events by timestamp with robust label extraction
  const chordMap = new Map<number, any>();
  chordEvents.forEach((event: any) => {
    const roundedTime = Math.round(event.timestamp * 10) / 10; // Round to 0.1s
    // Extract chord label: prefer annotated `chord` (from theorist), then fallback to chord_candidate root+quality
    let chordLabel = event.chord || null;
    if (!chordLabel && event.chord_candidate) {
      const root = event.chord_candidate?.root_candidates?.[0]?.root;
      const quality = event.chord_candidate?.quality_candidates?.[0]?.quality;
      if (root)
        chordLabel = `${root}${quality ? (quality[0] === 'm' ? 'm' : '') : ''}`; // basic quality format
    }
    if (!chordLabel && event.roman_numeral) chordLabel = event.roman_numeral;
    // preserve the label and event (use event as fallback)
    const wrapped = {
      ...event,
      _chord_label: chordLabel || event.chord || null,
    };
    if (
      !chordMap.has(roundedTime) ||
      event.confidence > (chordMap.get(roundedTime)?.confidence || 0)
    ) {
      chordMap.set(roundedTime, wrapped);
    }
    if (
      wrapped &&
      wrapped._chord_label &&
      wrapped.source !== 'TS_Viterbi_Engine'
    ) {
      // Warn once per non-TS chord event so devs can detect 'Event Soup'
      console.warn(
        '⚠️ UI rendering non-Viterbi chord event detected at',
        roundedTime,
        wrapped.source,
        wrapped._chord_label,
      );
    }
  });

  // If we have beat timestamps, use them for precise timing
  if (beatTimestamps.length > 0) {
    let measureStartTime = 0;
    let measureBeats: BeatNode[] = [];

    for (let i = 0; i < beatTimestamps.length; i++) {
      const beatTime = beatTimestamps[i];
      const beatIndex = i % beatsPerMeasure;
      const isDownbeat =
        downbeatTimestamps.includes(beatTime) || beatIndex === 0;

      // Find the closest chord event to this beat
      let chordEvent: any = null;
      let closestDistance = Infinity;

      chordMap.forEach((event, eventTime) => {
        const distance = Math.abs(eventTime - beatTime);
        if (distance < closestDistance && distance < secondsPerBeat * 0.5) {
          closestDistance = distance;
          chordEvent = event;
        }
      });

      // Determine if this is an attack (new chord) or sustain
      const chordLabelAtBeat =
        chordEvent?._chord_label ||
        chordEvent?.chord ||
        chordEvent?.roman_numeral ||
        null;
      const isAttack =
        chordEvent !== null &&
        (measureBeats.length === 0 ||
          measureBeats[measureBeats.length - 1]?.chordLabel !==
            chordLabelAtBeat);

      const drums = (function () {
        // preferred: index mapping when lengths match
        if (drumGrid && drumGrid.length === beatTimestamps.length) {
          const d = drumGrid[i] || { drums: [] };
          const hasKick = Array.isArray(d.drums) && d.drums.includes('kick');
          const hasSnare = Array.isArray(d.drums) && d.drums.includes('snare');
          return { hasKick, hasSnare, drums: d.drums || [] };
        }
        // fallback: nearest timestamp
        let closest = null;
        let dist = Infinity;
        for (const dg of drumGrid) {
          const dt = Math.abs((dg.time || dg.timestamp || 0) - beatTime);
          if (dt < dist) {
            dist = dt;
            closest = dg;
          }
        }
        if (closest && dist < 0.15) {
          const hasKick =
            Array.isArray(closest.drums) && closest.drums.includes('kick');
          const hasSnare =
            Array.isArray(closest.drums) && closest.drums.includes('snare');
          return { hasKick, hasSnare, drums: closest.drums || [] };
        }
        return { hasKick: false, hasSnare: false, drums: [] };
      })();
      const beatNode: BeatNode = {
        id: `beat-${currentBar}-${beatIndex + 1}`,
        beatIndex,
        isAttack,
        chordLabel: chordLabelAtBeat,
        functionLabel: chordEvent?.function || chordEvent?.roman_numeral,
        isSelected: false,
        drums: drums || { hasKick: false, hasSnare: false, drums: [] },
        timestamp: beatTime,
      };

      measureBeats.push(beatNode);

      // If we've completed a measure (4 beats) or hit a downbeat
      if (
        beatIndex === beatsPerMeasure - 1 ||
        (isDownbeat && measureBeats.length === beatsPerMeasure)
      ) {
        const measureEndTime = beatTime;
        measures.push({
          index: currentBar,
          beats: [...measureBeats],
          startTime: measureStartTime,
          endTime: measureEndTime,
        });

        measureStartTime = beatTime;
        measureBeats = [];
        currentBar++;
      }
    }

    // Handle remaining beats if song doesn't end on a measure boundary
    if (measureBeats.length > 0) {
      const lastBeatTime = beatTimestamps[beatTimestamps.length - 1];
      measures.push({
        index: currentBar,
        beats: measureBeats,
        startTime: measureStartTime,
        endTime: lastBeatTime,
      });
    }
  } else {
    // Fallback: Calculate measures from tempo
    const totalBeats = Math.ceil(duration * beatsPerSecond);
    const totalMeasures = Math.ceil(totalBeats / beatsPerMeasure);

    for (let bar = 1; bar <= totalMeasures; bar++) {
      const measureStartTime = (bar - 1) * beatsPerMeasure * secondsPerBeat;
      const measureBeats: BeatNode[] = [];

      for (let beat = 0; beat < beatsPerMeasure; beat++) {
        const beatTime = measureStartTime + beat * secondsPerBeat;

        // Find closest chord event
        let chordEvent: any = null;
        let closestDistance = Infinity;

        chordMap.forEach((event, eventTime) => {
          const distance = Math.abs(eventTime - beatTime);
          if (distance < closestDistance && distance < secondsPerBeat * 0.5) {
            closestDistance = distance;
            chordEvent = event;
          }
        });

        const chordLabelAtBeat =
          chordEvent?._chord_label ||
          chordEvent?.chord ||
          chordEvent?.roman_numeral ||
          null;
        const isAttack =
          chordEvent !== null &&
          (beat === 0 ||
            measureBeats[beat - 1]?.chordLabel !== chordLabelAtBeat);

        measureBeats.push({
          id: `beat-${bar}-${beat + 1}`,
          beatIndex: beat,
          isAttack,
          chordLabel: chordLabelAtBeat,
          functionLabel: chordEvent?.function || chordEvent?.roman_numeral,
          isSelected: false,
          timestamp: beatTime,
        });
      }

      measures.push({
        index: bar,
        beats: measureBeats,
        startTime: measureStartTime,
        endTime: measureStartTime + beatsPerMeasure * secondsPerBeat,
      });
    }
  }

  // Group measures into sections
  const sectionMap = new Map<string, Section>();

  if (sections.length > 0) {
    sections.forEach((section: any) => {
      const sectionStart = section.time_range?.start_time || 0;
      const sectionEnd = section.time_range?.end_time || duration;
      const sectionMeasures = measures.filter(
        (m) => m.startTime >= sectionStart && m.startTime < sectionEnd,
      );

      if (sectionMeasures.length > 0) {
        const sectionId =
          section.section_id || `section-${sectionMap.size + 1}`;
        sectionMap.set(sectionId, {
          id: sectionId,
          label: section.section_label || 'Unknown',
          measures: sectionMeasures,
          startTime: sectionStart,
          endTime: sectionEnd,
          // color intentionally omitted; UI maps section_label -> theme color
        });
      }
    });
  } else {
    // If no sections, create one default section
    sectionMap.set('section-1', {
      id: 'section-1',
      label: 'Song',
      measures,
      startTime: 0,
      endTime: duration,
    });
  }

  return Array.from(sectionMap.values());
}

/**
 * Alias for clarity: `linearToGrid` maps a linear analysis and structural map to UI grid sections
 */
export function linearToGrid(
  linearAnalysis: any,
  structuralMap?: any,
): Section[] {
  return transformAnalysisToGrid(linearAnalysis, structuralMap);
}

/**
 * Get color code for section type
 */
function getSectionColor(sectionLabel?: string): string {
  const colorMap: Record<string, string> = {
    intro: 'blue',
    verse: 'indigo',
    chorus: 'green',
    bridge: 'purple',
    pre_chorus: 'yellow',
    outro: 'red',
    instrumental: 'orange',
    solo: 'pink',
  };

  return colorMap[sectionLabel?.toLowerCase() || ''] || 'gray';
}

/**
 * Detect progression groups in measures
 * @param measures - Array of measures
 * @returns Array of progression groups
 */
export function detectProgressionGroups(
  measures: Measure[],
): ProgressionGroup[] {
  const progressions: ProgressionGroup[] = [];
  let currentProgression: number[] = [];
  let progressionStart = 0;

  for (let i = 0; i < measures.length; i++) {
    const measure = measures[i];

    // Check if this measure has a progression ID
    if (measure.progressionId) {
      if (currentProgression.length === 0) {
        progressionStart = i;
      }
      currentProgression.push(i);
    } else {
      // End of current progression
      if (currentProgression.length > 0) {
        const label =
          measures[currentProgression[0]]?.progressionId || 'Progression';
        progressions.push({
          id: `prog-${progressions.length + 1}`,
          label: formatProgressionLabel(label),
          measureIndices: currentProgression,
          startMeasure: measures[currentProgression[0]].index,
          endMeasure:
            measures[currentProgression[currentProgression.length - 1]].index,
        });
        currentProgression = [];
      }
    }
  }

  // Handle progression at end
  if (currentProgression.length > 0) {
    const label =
      measures[currentProgression[0]]?.progressionId || 'Progression';
    progressions.push({
      id: `prog-${progressions.length + 1}`,
      label: formatProgressionLabel(label),
      measureIndices: currentProgression,
      startMeasure: measures[currentProgression[0]].index,
      endMeasure:
        measures[currentProgression[currentProgression.length - 1]].index,
    });
  }

  return progressions;
}

/**
 * Format progression ID into readable label
 */
function formatProgressionLabel(progressionId: string): string {
  // Convert "ii-V-I-group-1" to "ii-V-I Turnaround"
  return (
    progressionId
      .replace(/-group-\d+/, '')
      .replace(/-/g, '-')
      .toUpperCase()
      .replace(/([IVX]+)/g, '$1') + // Preserve Roman numerals
    ' Turnaround'
  );
}
