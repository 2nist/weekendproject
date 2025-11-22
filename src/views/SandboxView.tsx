import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useAnalysisSandbox } from '@/hooks/useAnalysisSandbox';
import { SectionContainer } from '@/components/grid/SectionContainer';
import { Measure } from '@/components/grid/Measure';
import { BeatCard } from '@/components/grid/BeatCard';
import KeySelector from '@/components/tools/KeySelector';
import ProgressionOverlay from '@/components/grid/ProgressionOverlay';
import { Button } from '@/components/ui/button';
import { Save, Play, Pause, Paintbrush, Eye, GraduationCap } from 'lucide-react';
import { AudioEngine, AudioEngineRef } from '@/components/player/AudioEngine';
import { ContextualInspector, SelectedObject } from '@/components/grid/ContextualInspector';
import { NavigationTimeline } from '@/components/grid/NavigationTimeline';

export const SandboxView = ({ data }: { data: any }) => {
  const { grid, sections, progressionGroups, globalKey, actions, isDirty, isProcessing } =
    useAnalysisSandbox(data);
  
  // Audio playback state
  const audioRef = useRef<AudioEngineRef>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined);
  
  // Selection state for ContextualInspector
  const [selectedObject, setSelectedObject] = useState<SelectedObject>(null);
  
  // Paint Mode state
  const [paintMode, setPaintMode] = useState(false);
  const [paintChord, setPaintChord] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const paintedBeatsRef = useRef<Set<string>>(new Set());
  
  // Confidence Heatmap state
  const [showConfidence, setShowConfidence] = useState(false);
  
  // Ref for scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Get duration and novelty curve from data
  const duration = data?.linear_analysis?.metadata?.duration_seconds || 0;
  const noveltyCurve = data?.structural_map?.debug?.noveltyCurve || 
                       data?.structural_map?.debug?.novelty_curve || 
                       [];
  
  // Expose current fileHash globally for AnalysisTuner to consume
  useEffect(() => {
    if (data?.fileHash || data?.file_hash) {
      globalThis.__currentFileHash = data.fileHash || data.file_hash;
    }
  }, [data]);

  // Get audio file path from analysis data
  useEffect(() => {
    if (data?.file_path) {
      // Convert Windows path to file:// URL for Electron
      // Handle both Windows (C:\path) and Unix (/path) paths
      let fileUrl = data.file_path;
      if (!fileUrl.startsWith('file://')) {
        // Normalize path separators and add file:// protocol
        fileUrl = fileUrl.replace(/\\/g, '/');
        // If it's an absolute Windows path (C:/), keep it as is
        // If it's a relative path, make it absolute
        if (fileUrl.match(/^[A-Z]:/)) {
          // Windows absolute path
          fileUrl = `file:///${fileUrl}`;
        } else if (!fileUrl.startsWith('/')) {
          // Relative path - might need to be resolved
          fileUrl = `file:///${fileUrl}`;
        } else {
          // Unix absolute path
          fileUrl = `file://${fileUrl}`;
        }
      }
      setAudioSrc(fileUrl);
    }
  }, [data?.file_path]);

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
  const handleTimelineSeek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.seek(time);
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }, [isPlaying]);

  // Handle beat click - seek to timestamp and select
  const handleBeatClick = useCallback((beat: any) => {
    if (audioRef.current && beat.timestamp) {
      // Seek audio to beat timestamp
      audioRef.current.seek(beat.timestamp);
    }
    
    // Select beat in sidebar
    setSelectedObject({ type: 'beat', data: beat });
  }, []);

  // Handle measure click
  const handleMeasureClick = useCallback((measure: any) => {
    setSelectedObject({ type: 'measure', data: measure });
  }, []);

  // Handle section click
  const handleSectionClick = useCallback((section: any) => {
    setSelectedObject({ type: 'section', data: section });
  }, []);

  // Handle chord change from Inspector (for paint mode)
  const handleChordChange = useCallback((chord: string | null) => {
    if (paintMode) {
      setPaintChord(chord);
    }
  }, [paintMode]);

  // Handle beat updates from sidebar
  const handleBeatUpdate = useCallback((beatId: string, updates: { chord?: string; function?: string; hasKick?: boolean; hasSnare?: boolean }) => {
    if (updates.chord !== undefined) {
      actions.updateChord(beatId, updates.chord);
      // Update paint chord if we're painting
      if (paintMode) {
        setPaintChord(updates.chord);
      }
    }
    // TODO: Implement function, hasKick, hasSnare updates
  }, [actions, paintMode]);

  // Handle paint mode - paint chord on beat
  const handleBeatPaint = useCallback((beat: any) => {
    if (!paintMode || !paintChord || isDragging === false) return;
    
    // Prevent painting the same beat multiple times in one drag
    const beatId = beat.id || beat.timestamp?.toString();
    if (!beatId || paintedBeatsRef.current.has(beatId)) return;
    
    paintedBeatsRef.current.add(beatId);
    actions.updateChord(beatId, paintChord);
    
    // Update the beat data in selectedObject if it's the same beat
    if (selectedObject?.type === 'beat' && selectedObject.data.id === beatId) {
      setSelectedObject({
        type: 'beat',
        data: { ...selectedObject.data, chordLabel: paintChord },
      });
    }
  }, [paintMode, paintChord, isDragging, actions, selectedObject]);

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
  const handleSectionUpdate = useCallback((sectionId: string, updates: { label?: string; color?: string }) => {
    actions.updateSection(sectionId, updates);
  }, [actions]);

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

  const activeBeatId = getActiveBeat(allBeats, currentTime);

  return (
    <div className="flex flex-col h-screen text-white bg-slate-950">
      {/* Audio Engine (hidden) */}
      <AudioEngine
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />


      <div className="flex items-center h-16 gap-4 px-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
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

        <div className="w-px h-6 bg-slate-700" />

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-400">
            DETECTED KEY:
          </span>
          <KeySelector value={globalKey} onChange={actions.updateKey} />
        </div>
        <div className="w-px h-6 mx-2 bg-slate-700" />
        <span className="font-mono text-xs text-green-400">
          ENGINE: VITERBI (TS) ACTIVE
        </span>
        
        {/* Paint Mode Toggle */}
        <div className="w-px h-6 mx-2 bg-slate-700" />
        <Button
          onClick={() => setPaintMode(!paintMode)}
          variant={paintMode ? 'default' : 'outline'}
          className={`gap-2 ${paintMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'}`}
          title={paintMode ? 'Paint Mode: ON - Click and drag to paint chords' : 'Paint Mode: OFF - Click to enable'}
        >
          <Paintbrush className="w-4 h-4" />
          Paint {paintMode && paintChord && `(${paintChord})`}
        </Button>
        
        {/* Confidence Heatmap Toggle */}
        <div className="w-px h-6 mx-2 bg-slate-700" />
        <Button
          onClick={() => setShowConfidence(!showConfidence)}
          variant={showConfidence ? 'default' : 'outline'}
          className={`gap-2 ${showConfidence ? 'bg-cyan-600 text-white hover:bg-cyan-700' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'}`}
          title={showConfidence ? 'Confidence Heatmap: ON - Low confidence beats are ghosted' : 'Confidence Heatmap: OFF - Click to show confidence visualization'}
        >
          <Eye className="w-4 h-4" />
          Confidence
        </Button>
        
        <div className="flex items-center gap-4 ml-auto">
          <div className="flex flex-col items-end mr-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
              State
            </span>
            <span
              className={`text-xs font-mono ${isDirty ? 'text-amber-400' : 'text-slate-400'}`}
            >
              {isDirty ? 'UNSAVED CHANGES' : 'SYNCED'}
            </span>
          </div>
          
          {/* Save Dropdown Menu */}
          <div className="relative group">
            <Button
              onClick={() => actions.saveChanges && actions.saveChanges()}
              disabled={!isDirty || isProcessing}
              className={`${isDirty ? 'gap-2 font-bold transition-all bg-music-kick text-black hover:bg-music-kick/80 shadow-[0_0_15px_hsl(var(--music-kick)/0.4)]' : 'gap-2 font-bold transition-all bg-slate-800 text-slate-500'}`}
            >
              <Save className="w-4 h-4" />
              {isProcessing ? 'Saving...' : 'Commit Changes'}
            </Button>
            
            {/* Dropdown Menu */}
            {!isProcessing && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <button
                  onClick={async () => {
                    try {
                      // Get current fileHash from data
                      const fileHash = data?.fileHash || data?.file_hash;
                      if (!fileHash) {
                        alert('No analysis data available. Please save changes first.');
                        return;
                      }
                      
                      // Get analysis to find project
                      const analysis = await window.electronAPI?.invoke('ANALYSIS:GET_RESULT', fileHash);
                      if (!analysis) {
                        alert('Analysis not found. Please save changes first.');
                        return;
                      }
                      
                      // Find project by analysis_id
                      const projectsResult = await window.electronAPI?.invoke('LIBRARY:GET_PROJECTS');
                      const project = projectsResult?.projects?.find((p: any) => p.analysis_id === analysis.id);
                      
                      if (!project) {
                        alert('Project not found. Please ensure this analysis is linked to a project.');
                        return;
                      }
                      
                      const result = await window.electronAPI?.invoke('LIBRARY:PROMOTE_TO_BENCHMARK', {
                        projectId: project.id,
                      });
                      
                      if (result?.success) {
                        alert('✅ Successfully added to calibration set! Your corrections will improve future AI accuracy.');
                      } else {
                        alert(`Failed to add to calibration set: ${result?.error || 'Unknown error'}`);
                      }
                    } catch (error) {
                      console.error('Error promoting to benchmark:', error);
                      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
                    }
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                  title="Use your corrections to improve the AI's future accuracy"
                >
                  <GraduationCap className="w-4 h-4 text-cyan-400" />
                  <span>Add to Calibration Set</span>
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
          <div className="flex gap-6">
          {(!sections || sections.length === 0) && (
            <div className="text-center text-slate-400 p-8">
              No sections available. Load an analysis to view the grid.
            </div>
          )}
          {sections && sections.length > 0 && sections.map((section: any) => {
            const sectionMeasures = (grid || []).filter(
              (m: any) =>
                m?.beats && Array.isArray(m.beats) && m.beats.length > 0 &&
                m.beats[0]?.timestamp >= (section.time_range?.start_time || 0) &&
                m.beats[0]?.timestamp <
                  (section.time_range?.end_time || Infinity),
            );
            if (sectionMeasures.length === 0) return null;
            return (
              <SectionContainer
                key={section.section_id}
                label={section.section_label}
                type={(section.section_label || '').toLowerCase()}
                onClick={() => handleSectionClick(section)}
                data-section-id={section.section_id}
              >
                {groupMeasuresByPhrase(sectionMeasures).map((phrase, pi) => (
                  <div key={`phrase-${pi}`} className="relative">
                    <ProgressionOverlay label={detectCadence(phrase)} widthInMeasures={phrase.length} onEdit={() => console.log('Edit progression')} />
                    {/* Flex container handles any number of measures (odd or even) gracefully */}
                    <div className={`flex gap-3 ${isProcessing ? 'opacity-50 blur-[1px] transition-all' : ''}`}>
                      {phrase.map((measure: any) => (
                        <Measure 
                          key={measure?.index || Math.random()} 
                          barNumber={measure?.index || 0}
                          numerator={measure?.timeSignature?.numerator ?? measure?.beats?.length ?? 4}
                          onEdit={() => handleMeasureClick(measure)}
                        >
                          {measure?.beats && Array.isArray(measure.beats) ? measure.beats.map((beat: any) => (
                            <BeatCard
                              key={beat.id || Math.random()}
                              beatIndex={beat.beatIndex}
                              chord={beat.chordLabel}
                              isAttack={beat.isAttack}
                              isSustain={beat.isSustain}
                              isKick={beat.drums?.hasKick}
                              isSnare={beat.drums?.hasSnare}
                              timestamp={beat.timestamp}
                              isPlaying={activeBeatId === beat.id && isPlaying}
                              selected={selectedObject?.type === 'beat' && selectedObject.data.id === beat.id}
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
                          )) : null}
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
          selected={selectedObject}
          onClose={() => setSelectedObject(null)}
          onUpdateBeat={handleBeatUpdate}
          onUpdateSection={handleSectionUpdate}
          onChordChange={handleChordChange}
          onDeleteSection={(sectionId) => {
            // TODO: Implement section deletion
            console.log('Delete section:', sectionId);
          }}
          onDuplicateSection={(sectionId) => {
            // TODO: Implement section duplication
            console.log('Duplicate section:', sectionId);
          }}
          onSplitSection={(sectionId) => {
            // TODO: Implement section splitting
            console.log('Split section:', sectionId);
          }}
        />
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
