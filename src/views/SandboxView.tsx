import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useAnalysisSandbox } from '@/hooks/useAnalysisSandbox';
import { useEditor } from '@/contexts/EditorContext';
import { SectionContainer } from '@/components/grid/SectionContainer';
import { Measure } from '@/components/grid/Measure';
import { BeatCard } from '@/components/grid/BeatCard';
import { SmartContextMenu } from '@/components/ui/SmartContextMenu';
import KeySelector from '@/components/tools/KeySelector';
import ProgressionOverlay from '@/components/grid/ProgressionOverlay';
import { Button } from '@/components/ui/button';
import { Save, Play, Pause, Paintbrush, Eye, GraduationCap } from 'lucide-react';
import { AudioEngine, AudioEngineRef } from '@/components/player/AudioEngine';
import { ContextualInspector } from '@/components/grid/ContextualInspector';
import { NavigationTimeline } from '@/components/grid/NavigationTimeline';
import LyricsPanel from '@/components/lyrics/LyricsPanel';
import {
  handleAsyncError,
  useAsyncOperation,
  showErrorToast,
  AppError,
} from '@/utils/errorHandling';
import logger from '@/lib/logger';
import type { SelectionTarget } from '@/types/editor';

export const SandboxView = ({ data }: { data: any }) => {
  const { grid, sections, progressionGroups, globalKey, actions, isDirty, isProcessing } =
    useAnalysisSandbox();
  const { state, actions: editorActions } = useEditor();
  const { selection } = state;

  // Async operation for promoting to calibration set
  const promoteToCalibrationOperation = useAsyncOperation(
    async () => {
      // Get current fileHash from data
      const fileHash = data?.fileHash || data?.file_hash;
      if (!fileHash) {
        throw new AppError(
          'No analysis data available',
          'INVALID_INPUT',
          'Please save changes first before adding to calibration set.',
          true,
        );
      }

      // Get analysis to find project
      const analysis = await window.electronAPI?.invoke('ANALYSIS:GET_RESULT', fileHash);
      if (!analysis) {
        throw new AppError(
          'Analysis not found',
          'ANALYSIS_NOT_FOUND',
          'Analysis data could not be found. Please save changes first.',
          true,
        );
      }

      // Find project by analysis_id
      const projectsResult = await window.electronAPI?.invoke('LIBRARY:GET_PROJECTS');
      const project = projectsResult?.projects?.find((p: any) => p.analysis_id === analysis.id);

      if (!project) {
        throw new AppError(
          'Project not found',
          'PROJECT_NOT_FOUND',
          'This analysis is not linked to a project. Please ensure the analysis is properly saved.',
          true,
        );
      }

      const result = await window.electronAPI?.invoke('LIBRARY:PROMOTE_TO_BENCHMARK', {
        projectId: project.id,
      });

      if (!result?.success) {
        throw new AppError(
          result?.error || 'Failed to add to calibration set',
          'PROMOTE_FAILED',
          'Could not add this analysis to the calibration set. Please try again.',
          true,
        );
      }

      return result;
    },
    {
      onSuccess: () => {
        alert(
          'Successfully added to calibration set! Your corrections will improve future AI accuracy.',
        );
      },
      onError: (error) => {
        logger.error('[SandboxView] Failed to promote to calibration:', error.message);
        showErrorToast(error);
      },
    },
  );

  // Track if we've already loaded data to prevent infinite loops
  const hasLoadedDataRef = React.useRef(false);
  const lastDataRef = React.useRef<any>(null);

  // Data flow logging for debugging (throttled to prevent spam)
  React.useEffect(() => {
    const logData = () => {
      logger.debug('[SandboxView] Grid Data:', {
        gridLength: grid?.length || 0,
        sectionsLength: sections?.length || 0,
        hasGrid: !!grid,
        hasSections: !!sections,
        gridSample: grid?.[0] || null,
        sectionsSample: sections?.[0] || null,
      });
    };

    // Throttle logging to once per second
    const timeoutId = setTimeout(logData, 1000);
    return () => clearTimeout(timeoutId);
  }, [grid?.length, sections?.length]); // Only depend on lengths, not full objects

  // Update EditorContext when data prop changes or load from fileHash
  // 🔴 CRITICAL FIX: Remove state.songData from deps to prevent infinite loop
  React.useEffect(() => {
    // Create a stable key for comparison
    const dataKey = data?.linear_analysis
      ? `analysis-${data.id || 'full'}`
      : data?.fileHash || data?.file_hash
        ? `hash-${data.fileHash || data.file_hash}`
        : 'empty';

    // Skip if we've already processed this exact data
    if (lastDataRef.current === dataKey) {
      logger.debug('[SandboxView] Skipping - already processed:', dataKey);
      return;
    }

    logger.debug('[SandboxView] Processing data:', {
      hasLinearAnalysis: !!data?.linear_analysis,
      hasFileHash: !!(data?.fileHash || data?.file_hash),
      dataKey,
    });

    if (data && (data.linear_analysis || data.fileHash || data.file_hash)) {
      // Only update if data actually changed
      if (!hasLoadedDataRef.current || lastDataRef.current !== dataKey) {
        logger.debug('[SandboxView] Updating EditorContext with data:', dataKey);
        editorActions.updateSongData(data);
        hasLoadedDataRef.current = true;
        lastDataRef.current = dataKey;
      }
    } else if (!hasLoadedDataRef.current) {
      // If no data prop, try to load from last analysis hash (only once)
      const fileHash =
        globalThis.__lastAnalysisHash ||
        globalThis.__currentFileHash ||
        data?.fileHash ||
        data?.file_hash;
      if (fileHash) {
        logger.debug('[SandboxView] Loading analysis from fileHash:', fileHash);
        // EditorContext will handle loading via its useEffect
        editorActions.updateSongData({ fileHash, file_hash: fileHash });
        hasLoadedDataRef.current = true;
        lastDataRef.current = `hash-${fileHash}`;
      } else {
        logger.warn('[SandboxView] No data and no fileHash available');
      }
    }
  }, [data, editorActions]); // 🔴 REMOVED state.songData from deps

  // Audio playback state
  const audioRef = useRef<AudioEngineRef>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined);

  // Paint Mode state
  const [paintMode, setPaintMode] = useState(false);
  const [paintChord, setPaintChord] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const paintedBeatsRef = useRef<Set<string>>(new Set());

  // Confidence Heatmap state
  const [showConfidence, setShowConfidence] = useState(false);

  // Ref for scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get duration and novelty curve from songData
  const songData = state.songData;
  const duration = songData?.linear_analysis?.metadata?.duration_seconds || 0;
  const noveltyCurve =
    songData?.structural_map?.debug?.noveltyCurve ||
    songData?.structural_map?.debug?.novelty_curve ||
    [];

  // Extract metadata for lyrics
  const metadata = songData?.metadata || songData?.linear_analysis?.metadata || {};
  const artist = metadata?.artist || 'Unknown Artist';
  const title = metadata?.title || metadata?.file_name || 'Unknown Track';
  const album = metadata?.album;

  // Expose current fileHash globally for AnalysisTuner to consume
  useEffect(() => {
    const fileHash = songData?.fileHash || songData?.file_hash;
    if (fileHash) {
      globalThis.__currentFileHash = fileHash;
    }
  }, [songData]);

  // Get audio file path from analysis data
  useEffect(() => {
    // Priority 1: Use fileHash for lookup (most reliable)
    const fileHash = songData?.fileHash || songData?.file_hash;
    if (fileHash) {
      const fileUrl = `app://${fileHash}`;
      if (fileUrl !== audioSrc) {
        logger.debug('[SandboxView] Setting audio src from fileHash:', fileUrl);
        setAudioSrc(fileUrl);
      }
      return;
    }

    // Priority 2: Use direct file path as fallback
    const filePath = songData?.file_path || songData?.metadata?.file_path || songData?.filePath;
    if (filePath) {
      // Convert to app:// protocol for Electron (handles local file access securely)
      let normalized = filePath.replace(/\\/g, '/');
      const fileUrl = `app://${normalized}`;
      if (fileUrl !== audioSrc) {
        logger.debug('[SandboxView] Setting audio src from file_path:', fileUrl);
        setAudioSrc(fileUrl);
      }
    } else {
      logger.warn('[SandboxView] No file_path or fileHash found in songData:', {
        hasFileHash: !!fileHash,
        hasFilePath: !!songData?.file_path,
        hasMetadataFilePath: !!songData?.metadata?.file_path,
        hasCamelFilePath: !!songData?.filePath,
        songDataKeys: songData ? Object.keys(songData) : null,
      });
    }
  }, [
    songData?.file_hash,
    songData?.fileHash,
    songData?.file_path,
    songData?.metadata?.file_path,
    songData?.filePath,
    audioSrc,
  ]);

  // Handle time updates from audio
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Toggle play/pause
  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }, [isPlaying]);

  // Handle timeline seek
  const handleTimelineSeek = useCallback(
    (time: number) => {
      if (audioRef.current) {
        audioRef.current.seek(time);
        if (!isPlaying) {
          audioRef.current.play();
          setIsPlaying(true);
        }
      }
    },
    [isPlaying],
  );

  // Handle beat click - seek to timestamp and select
  const handleBeatClick = useCallback(
    (beat: any) => {
      if (audioRef.current && beat.timestamp) {
        // Seek audio to beat timestamp
        audioRef.current.seek(beat.timestamp);
      }

      // Select beat using EditorContext
      editorActions.selectObject('beat', beat.id || beat.timestamp?.toString(), beat);
    },
    [editorActions],
  );

  // Handle measure click
  const handleMeasureClick = useCallback(
    (measure: any) => {
      editorActions.selectObject('measure', measure.index?.toString() || measure.id, measure);
    },
    [editorActions],
  );

  // Handle section click
  const handleSectionClick = useCallback(
    (section: any) => {
      editorActions.selectObject('section', section.section_id || section.id, section);
    },
    [editorActions],
  );

  // Handle chord change from Inspector (for paint mode)
  const handleChordChange = useCallback(
    (chord: string | null) => {
      if (paintMode) {
        setPaintChord(chord);
      }
    },
    [paintMode],
  );

  // Handle beat updates from sidebar
  const handleBeatUpdate = useCallback(
    (
      beatId: string,
      updates: { chord?: string; function?: string; hasKick?: boolean; hasSnare?: boolean },
    ) => {
      // Use EditorContext's updateBeat for any patch updates (chord, drums, etc.)
      actions.updateBeat && actions.updateBeat(beatId, updates as any);
      // Update paintChord if the chord was changed
      if (updates.chord !== undefined && paintMode) {
        setPaintChord(updates.chord);
      }
    },
    [actions, paintMode],
  );

  // Handle paint mode - paint chord on beat
  const handleBeatPaint = useCallback(
    (beat: any) => {
      if (!paintMode || !paintChord || isDragging === false) return;

      // Prevent painting the same beat multiple times in one drag
      const beatId = beat.id || beat.timestamp?.toString();
      if (!beatId || paintedBeatsRef.current.has(beatId)) return;

      paintedBeatsRef.current.add(beatId);
      actions.updateChord(beatId, paintChord);

      // Update the beat data in selection if it's the same beat
      if (selection?.type === 'beat' && selection.id === beatId) {
        editorActions.selectObject('beat', beatId, { ...selection.data, chordLabel: paintChord });
      }
    },
    [paintMode, paintChord, isDragging, actions, selection, editorActions],
  );

  // Handle paint drag start
  const handlePaintDragStart = useCallback(() => {
    if (paintMode && paintChord) {
      setIsDragging(true);
      paintedBeatsRef.current.clear();
    }
  }, [paintMode, paintChord]);

  // Handle paint drag end
  const handlePaintDragEnd = useCallback(() => {
    setIsDragging(false);
    paintedBeatsRef.current.clear();
  }, []);

  // Handle section updates from sidebar
  const handleSectionUpdate = useCallback(
    (sectionId: string, updates: { label?: string; color?: string }) => {
      actions.updateSection(sectionId, updates);
    },
    [actions],
  );

  // Keyboard shortcut: Spacebar for play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback]);

  // Find which beat is currently playing
  const getActiveBeat = useCallback((beats: any[], currentTime: number) => {
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const nextBeat = beats[i + 1];
      const startTime = beat.timestamp || 0;
      const endTime = nextBeat?.timestamp || startTime + 1;

      if (currentTime >= startTime && currentTime < endTime) {
        return beat.id;
      }
    }
    return null;
  }, []);

  // Flatten all beats for active beat detection
  const allBeats = React.useMemo(() => {
    const beats: any[] = [];
    if (!grid || !Array.isArray(grid)) {
      return beats;
    }
    grid.forEach((measure: any) => {
      if (measure && measure.beats && Array.isArray(measure.beats)) {
        measure.beats.forEach((beat: any) => {
          beats.push(beat);
        });
      }
    });
    return beats.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [grid]);

  function groupMeasuresByPhrase(measures: any[]) {
    const phraseLength = 4;
    const groups: any[] = [];
    for (let i = 0; i < measures.length; i += phraseLength) {
      groups.push(measures.slice(i, i + phraseLength));
    }
    return groups;
  }

  function detectCadence(measures: any[]) {
    if (!measures || measures.length === 0) return 'Phrase';
    return `Phrase ${measures[0].index}`;
  }

  // Memoize phrase grouping and cadence detection
  const sectionPhrases = React.useMemo(() => {
    const phrases: any[] = [];
    if (!sections || !grid) return phrases;

    sections.forEach((section: any) => {
      const sectionMeasures = (grid || []).filter(
        (m: any) =>
          m?.beats &&
          Array.isArray(m.beats) &&
          m.beats.length > 0 &&
          m.beats[0]?.timestamp >= (section.time_range?.start_time || 0) &&
          m.beats[0]?.timestamp < (section.time_range?.end_time || Infinity),
      );

      if (sectionMeasures.length > 0) {
        const groupedPhrases = groupMeasuresByPhrase(sectionMeasures).map((phrase, pi) => ({
          section,
          phrase,
          cadence: detectCadence(phrase),
          phraseIndex: pi,
          key: `${section.section_id}-phrase-${pi}`,
        }));
        phrases.push(...groupedPhrases);
      }
    });

    return phrases;
  }, [sections, grid]);

  const activeBeatId = getActiveBeat(allBeats, currentTime);

  return (
    <div className="flex flex-col h-full w-full text-foreground bg-background">
      {/* Audio Engine (hidden) */}
      <AudioEngine
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        syncWithContext={false}
      />

      {/* Debug Overlay */}
      <div className="absolute top-20 left-8 z-50 bg-black/80 text-white px-4 py-2 text-sm rounded shadow-lg">
        Grid: {grid?.length || 0} measures | Sections: {sections?.length || 0} | Audio:{' '}
        {audioSrc ? 'Loaded' : 'None'}
      </div>

      <div className="flex items-center h-16 gap-4 px-6 border-b border-border bg-card/50 backdrop-blur">
        {/* Play/Pause Button */}
        <Button
          onClick={togglePlayback}
          disabled={!audioSrc}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          title="Play/Pause (Spacebar)"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? 'Pause' : 'Play'}
        </Button>

        <div className="w-px h-6 bg-border" />

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-muted-foreground">DETECTED KEY:</span>
          <KeySelector value={globalKey} onChange={actions.updateKey} />
        </div>
        <div className="w-px h-6 mx-2 bg-border" />
        <span className="font-mono text-xs text-music-subdominant">
          ENGINE: VITERBI (TS) ACTIVE
        </span>

        {/* Paint Mode Toggle */}
        <div className="w-px h-6 mx-2 bg-border" />
        <Button
          onClick={() => setPaintMode(!paintMode)}
          variant={paintMode ? 'default' : 'outline'}
          className={`gap-2 ${paintMode ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card text-foreground hover:bg-muted border-border'}`}
          title={
            paintMode
              ? 'Paint Mode: ON - Click and drag to paint chords'
              : 'Paint Mode: OFF - Click to enable'
          }
        >
          <Paintbrush className="w-4 h-4" />
          Paint {paintMode && paintChord && `(${paintChord})`}
        </Button>

        {/* Confidence Heatmap Toggle */}
        <div className="w-px h-6 mx-2 bg-border" />
        <Button
          onClick={() => setShowConfidence(!showConfidence)}
          variant={showConfidence ? 'default' : 'outline'}
          className={`gap-2 ${showConfidence ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card text-foreground hover:bg-muted border-border'}`}
          title={
            showConfidence
              ? 'Confidence Heatmap: ON - Low confidence beats are ghosted'
              : 'Confidence Heatmap: OFF - Click to show confidence visualization'
          }
        >
          <Eye className="w-4 h-4" />
          Confidence
        </Button>

        <div className="flex items-center gap-4 ml-auto">
          <div className="flex flex-col items-end mr-4">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              State
            </span>
            <span
              className={`text-xs font-mono ${isDirty ? 'text-accent-foreground' : 'text-muted-foreground'}`}
            >
              {isDirty ? 'UNSAVED CHANGES' : 'SYNCED'}
            </span>
          </div>

          {/* Save Dropdown Menu */}
          <div className="relative group">
            <Button
              onClick={() => actions.saveChanges && actions.saveChanges()}
              disabled={!isDirty || isProcessing}
              className={`${isDirty ? 'gap-2 font-bold transition-all bg-music-kick text-card-foreground hover:bg-music-kick/80 shadow-[0_0_15px_hsl(var(--music-kick)/0.4)]' : 'gap-2 font-bold transition-all bg-card text-muted-foreground'}`}
            >
              <Save className="w-4 h-4" />
              {isProcessing ? 'Saving...' : 'Commit Changes'}
            </Button>

            {/* Dropdown Menu */}
            {!isProcessing && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <button
                  onClick={() => promoteToCalibrationOperation.execute()}
                  disabled={promoteToCalibrationOperation.loading}
                  className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted flex items-center gap-2 transition-colors"
                  title="Use your corrections to improve the AI's future accuracy"
                >
                  <GraduationCap className="w-4 h-4 text-primary" />
                  <span>
                    {promoteToCalibrationOperation.loading ? 'Adding...' : 'Add to Calibration Set'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="flex-1 p-8 overflow-x-auto overflow-y-auto"
          onMouseDown={handlePaintDragStart}
          onMouseUp={handlePaintDragEnd}
          onMouseLeave={handlePaintDragEnd}
        >
          <div className="flex gap-6 min-h-full">
            {(!sections || sections.length === 0 || !grid || grid.length === 0) && (
              <div className="flex-1 flex items-center justify-center text-center text-muted-foreground p-8">
                <div className="space-y-2">
                  <p className="text-lg font-semibold">No Analysis Data</p>
                  <p className="text-sm">Load an analysis to view the harmonic grid.</p>
                  <p className="text-xs mt-4">
                    Grid: {grid?.length || 0} measures | Sections: {sections?.length || 0}
                  </p>
                </div>
              </div>
            )}
            {sections &&
              sections.length > 0 &&
              // Group sections by their ID for rendering
              [...new Set(sectionPhrases.map((p) => p.section.section_id))].map((sectionId) => {
                const sectionPhrasesForSection = sectionPhrases.filter(
                  (p) => p.section.section_id === sectionId,
                );
                if (sectionPhrasesForSection.length === 0) return null;

                const section = sectionPhrasesForSection[0].section;
                return (
                  <SectionContainer
                    key={section.section_id}
                    label={section.section_label}
                    type={(section.section_label || '').toLowerCase()}
                    onClick={() => handleSectionClick(section)}
                    data-section-id={section.section_id}
                  >
                    {sectionPhrasesForSection.map((phraseData) => (
                      <div key={phraseData.key} className="relative">
                        <ProgressionOverlay
                          label={phraseData.cadence}
                          widthInMeasures={phraseData.phrase.length}
                          onEdit={() => logger.debug('Edit progression')}
                        />
                        {/* Flex container handles any number of measures (odd or even) gracefully */}
                        <div
                          className={`flex gap-3 ${isProcessing ? 'opacity-50 blur-[1px] transition-all' : ''}`}
                        >
                          {phraseData.phrase.map((measure: any) => (
                            <Measure
                              key={measure?.index || Math.random()}
                              barNumber={measure?.index || 0}
                              numerator={
                                measure?.timeSignature?.numerator ?? measure?.beats?.length ?? 4
                              }
                              onEdit={() => handleMeasureClick(measure)}
                            >
                              {measure?.beats && Array.isArray(measure.beats)
                                ? measure.beats.map((beat: any) => (
                                    <SmartContextMenu
                                      key={beat.id || Math.random()}
                                      menuType="beat"
                                      entityId={beat.id || beat.timestamp?.toString() || 'unknown'}
                                      data={beat}
                                    >
                                      <BeatCard
                                        beatIndex={beat.beatIndex}
                                        chord={beat.chordLabel}
                                        isAttack={beat.isAttack}
                                        isSustain={beat.isSustain}
                                        isKick={beat.drums?.hasKick}
                                        isSnare={beat.drums?.hasSnare}
                                        timestamp={beat.timestamp}
                                        isPlaying={activeBeatId === beat.id && isPlaying}
                                        selected={
                                          selection?.type === 'beat' && selection.id === beat.id
                                        }
                                        onEdit={() => handleBeatClick(beat)}
                                        paintMode={paintMode}
                                        paintChord={paintChord}
                                        isDragging={isDragging}
                                        onPaint={() => handleBeatPaint(beat)}
                                        beat={beat}
                                        showConfidence={showConfidence}
                                        confidence={beat.confidence}
                                        hasConflict={beat.hasConflict}
                                      />
                                    </SmartContextMenu>
                                  ))
                                : null}
                            </Measure>
                          ))}
                        </div>
                      </div>
                    ))}
                  </SectionContainer>
                );
              })}
          </div>
        </div>

        {/* Contextual Inspector Sidebar */}
        <ContextualInspector
          selected={selection ? { type: selection.type, data: selection.data } : null}
          onClose={() => editorActions.clearSelection()}
          onUpdateBeat={handleBeatUpdate}
          onUpdateSection={handleSectionUpdate}
          onChordChange={handleChordChange}
          onDeleteSection={(sectionId) => {
            // TODO: Implement section deletion
            logger.debug('Delete section:', sectionId);
          }}
          onDuplicateSection={(sectionId) => {
            // TODO: Implement section duplication
            logger.debug('Duplicate section:', sectionId);
          }}
          onSplitSection={(sectionId) => {
            // TODO: Implement section splitting
            logger.debug('Split section:', sectionId);
          }}
        />

        {/* Lyrics Panel Sidebar */}
        <div className="w-80 h-full border-l border-border bg-card">
          <LyricsPanel
            artist={artist}
            title={title}
            album={album}
            duration={duration}
            currentTime={currentTime}
          />
        </div>
      </div>

      {/* Navigation Timeline (Bird's Eye Mini-Map) */}
      <NavigationTimeline
        sections={sections}
        noveltyCurve={noveltyCurve}
        duration={duration}
        currentTime={currentTime}
        onSeek={handleTimelineSeek}
        onSectionClick={handleSectionClick}
        scrollContainerRef={scrollContainerRef}
      />
    </div>
  );
};

export default SandboxView;
