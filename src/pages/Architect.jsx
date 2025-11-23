import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Upload, Sparkles, Grid3x3, Lightbulb, Trash2 } from 'lucide-react';
import useAppIPC from '../hooks/useAppIPC';
import SeamlessLoader from '../plugins/SeamlessLoader';
import ContextualBlockStatus from '../plugins/ContextualBlockStatus';
import ArrangementBlock from '../components/ArrangementBlock';
import SectionDetailPanel from '../components/SectionDetailPanel';
import SectionSculptor from '../components/SectionSculptor';
import SandboxMode from '../components/SandboxMode';
import { HarmonicGrid } from '../components/grid/HarmonicGrid';
import NoveltyCurveVisualizer from '../components/NoveltyCurveVisualizer';

export default function Architect() {
  const navigate = useNavigate();
  const { blocks: remoteBlocks, setBlocks } = useAppIPC();
  // local selection & drag state
  const [selectedId, setSelectedId] = React.useState(null);
  const [selectedSection, setSelectedSection] = React.useState(null);
  const [dragIndex, setDragIndex] = React.useState(null);
  const [viewMode, setViewMode] = React.useState('arrangement'); // arrangement, detail, sandbox, grid
  const [sandboxBlocks, setSandboxBlocks] = React.useState([]);
  const [analysisData, setAnalysisData] = React.useState(null);
  const [structuralMap, setStructuralMap] = React.useState(null);

  // Create synthetic analysis data from sandbox blocks for grid view
  const createSyntheticAnalysisFromBlocks = (blocks) => {
    if (!blocks || blocks.length === 0) return null;

    // Create synthetic beat grid
    const beatTimestamps = [];
    let currentTime = 0;
    const beatsPerBar = 4; // Assume 4 beats per bar
    const secondsPerBeat = 0.5; // 120 BPM = 0.5 seconds per beat

    blocks.forEach((block, blockIndex) => {
      const bars = block.bars || block.length || 4;
      const beatsInBlock = bars * beatsPerBar;

      for (let i = 0; i < beatsInBlock; i++) {
        beatTimestamps.push(currentTime);
        currentTime += secondsPerBeat;
      }
    });

    // Create synthetic events from block progressions
    const events = [];
    let eventTime = 0;

    blocks.forEach((block) => {
      const bars = block.bars || block.length || 4;
      const beatsInBlock = bars * beatsPerBar;
      const progression = block.harmonic_dna?.progression || [];

      for (let beatIndex = 0; beatIndex < beatsInBlock; beatIndex++) {
        const progressionIndex = beatIndex % progression.length;
        const chordEvent = progression[progressionIndex];

        if (chordEvent) {
          events.push({
            timestamp: eventTime,
            event_type: 'chord_candidate',
            chord_candidate: {
              root_candidates: [
                {
                  root:
                    chordEvent.chord?.root || chordEvent.functional_analysis?.roman_numeral || 'C',
                  confidence: chordEvent.probability_score || 0.8,
                },
              ],
              quality_candidates: [
                {
                  quality: chordEvent.chord?.quality || 'major',
                  confidence: chordEvent.probability_score || 0.8,
                },
              ],
            },
            confidence: chordEvent.probability_score || 0.8,
            source: 'synthetic',
          });
        }

        eventTime += secondsPerBeat;
      }
    });

    // Create synthetic structural map
    const sections = blocks.map((block, index) => {
      const bars = block.bars || block.length || 4;
      const startTime = index * bars * beatsPerBar * secondsPerBeat;
      const endTime = (index + 1) * bars * beatsPerBar * secondsPerBeat;

      return {
        id: block.id || `section-${index}`,
        section_id: block.id || `section-${index}`,
        section_label: block.section_label || block.label || 'Section',
        section_variant: block.section_variant || 1,
        time_range: {
          start_time: startTime,
          end_time: endTime,
        },
        harmonic_dna: block.harmonic_dna || {},
        rhythmic_dna: block.rhythmic_dna || {},
        probability_score: block.probability_score || 0.8,
      };
    });

    return {
      linear_analysis: {
        events,
        beat_grid: {
          beat_timestamps: beatTimestamps,
          tempo_bpm: 120,
        },
        metadata: {
          duration_seconds: currentTime,
          detected_key: 'C',
          detected_mode: 'major',
          sample_rate: 44100,
          hop_length: 512,
          frame_hop_seconds: 0.0116,
        },
      },
      structural_map: {
        sections,
      },
    };
  };

  // produce a fixed-size grid (rows x cols)
  const cols = 4;
  const rows = 3;
  const cellCount = cols * rows;

  // Move useRef to top level - cannot call hooks inside useMemo
  const prevBlocksRef = React.useRef(remoteBlocks);

  const blocks = React.useMemo(() => {
    // Only log when blocks actually change (not on every render)
    const blocksChanged = JSON.stringify(prevBlocksRef.current) !== JSON.stringify(remoteBlocks);

    if (blocksChanged) {
      console.log('Architect: remoteBlocks changed:', remoteBlocks?.length || 0);
      prevBlocksRef.current = remoteBlocks;
    }

    if (remoteBlocks && remoteBlocks.length) {
      // fill into cells, leave empty slots
      const arr = new Array(cellCount).fill(null);
      for (let i = 0; i < Math.min(remoteBlocks.length, cellCount); i++) {
        arr[i] = remoteBlocks[i];
      }
      return arr;
    }

    // Return empty array when no blocks - no placeholders
    return [];
  }, [remoteBlocks, cellCount]);

  function onSelect(id) {
    setSelectedId((s) => (s === id ? null : id));
    // Find the selected section data
    const selected = blocks.find((b) => b && b.id === id);
    if (selected && (selected.harmonic_dna || selected.section_label)) {
      setSelectedSection(selected);
      setViewMode('detail');
    } else {
      setSelectedSection(null);
    }
  }

  function onDragStart(e, index) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e, index) {
    e.preventDefault();
    const from = dragIndex;
    const to = index;
    if (from == null || to == null || from === to) return setDragIndex(null);

    const next = [...blocks];
    const tmp = next[from];
    next[from] = next[to];
    next[to] = tmp;

    // If remoteBlocks exists, try to map result back to remote shape
    try {
      // Map placeholder objects back to remoteBlocks if available
      if (remoteBlocks && remoteBlocks.length) {
        const mapped = next.filter(Boolean).slice(0, remoteBlocks.length);
        setBlocks(mapped);
      }
    } catch (err) {
      // ignore; keep local visual swap for placeholders
    }

    setDragIndex(null);
  }

  // Load analysis data when available
  React.useEffect(() => {
    // Listen for analysis data from AnalysisJobManager
    const handleAnalysisData = (event) => {
      if (event.detail?.linear_analysis) {
        setAnalysisData(event.detail.linear_analysis);
      }
      if (event.detail?.structural_map) {
        setStructuralMap(event.detail.structural_map);
      }
    };

    window.addEventListener('analysis:data', handleAnalysisData);

    // Also check if data is already in window
    if (window.__lastAnalysisData) {
      const data = window.__lastAnalysisData;
      if (data.linear_analysis) setAnalysisData(data.linear_analysis);
      if (data.structural_map) setStructuralMap(data.structural_map);
    }

    return () => {
      window.removeEventListener('analysis:data', handleAnalysisData);
    };
  }, []);

  // Listen for clear blocks event from ActivityBar
  React.useEffect(() => {
    const handleClearBlocks = () => {
      setBlocks([]);
      setSelectedId(null);
      setSelectedSection(null);
      setViewMode('arrangement');
    };

    window.addEventListener('CLEAR_BLOCKS', handleClearBlocks);
    globalThis.addEventListener('CLEAR_BLOCKS', handleClearBlocks);

    return () => {
      window.removeEventListener('CLEAR_BLOCKS', handleClearBlocks);
      globalThis.removeEventListener('CLEAR_BLOCKS', handleClearBlocks);
    };
  }, [setBlocks]);

  // Harmonic Grid view
  if (viewMode === 'grid') {
    return (
      <div style={{ height: '100vh', overflow: 'auto' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Harmonic Grid</h2>
            <button
              onClick={() => setViewMode('arrangement')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ← Back to Arrangement
            </button>
          </div>
        </div>
        <HarmonicGrid
          linearAnalysis={analysisData}
          structuralMap={structuralMap}
          onBeatClick={(beat) => {
            console.log('Beat clicked:', beat);
          }}
          onBeatEdit={(beat, newChord) => {
            console.log('Beat edit:', beat, newChord);
          }}
          onSectionEdit={(section) => {
            console.log('Section edit:', section);
          }}
          onSectionClone={(section) => {
            console.log('Section clone:', section);
          }}
          onProgressionEdit={(progression) => {
            console.log('Progression edit:', progression);
          }}
        />
      </div>
    );
  }

  // Three-level zoom interface
  if (viewMode === 'detail' && selectedSection) {
    return (
      <div style={{ display: 'flex', gap: 16, padding: 16, height: '100vh' }}>
        {/* Level A: Arrangement Map (left sidebar) */}
        <aside style={{ width: '250px', overflowY: 'auto' }}>
          <button
            onClick={() => {
              setBlocks([]);
              setSelectedId(null);
              setSelectedSection(null);
              setViewMode('arrangement');
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              color: '#6b7280',
              marginBottom: '10px',
            }}
            title="Back to Landing Page"
          >
            <Home size={20} />
          </button>
          <h3 style={{ marginBottom: '10px' }}>Arrangement Map</h3>
          <button
            onClick={() => setViewMode('arrangement')}
            style={{
              marginBottom: '15px',
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            ← Back to Grid
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {blocks.filter(Boolean).map((b) => (
              <ArrangementBlock
                key={b.id}
                block={b}
                onClick={() => onSelect(b.id)}
                className={selectedId === b.id ? 'ring-2 ring-blue-500' : ''}
              />
            ))}
          </div>
        </aside>

        {/* Level B: DNA Inspector (center) */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <SectionDetailPanel
            section={selectedSection}
            onClose={() => {
              setViewMode('arrangement');
              setSelectedSection(null);
            }}
          />
        </main>

        {/* Level C: Probability Dashboard (right sidebar) */}
        <aside
          style={{
            width: '320px',
            overflowY: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <SectionSculptor
            section={selectedSection}
            fileHash={globalThis.__lastAnalysisHash || globalThis.__currentFileHash || null}
            onUpdate={(update) => {
              console.log('Section update:', update);
            }}
          />
        </aside>
      </div>
    );
  }

  // Sandbox Mode
  if (viewMode === 'sandbox') {
    return (
      <div style={{ padding: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Blank Canvas (Sandbox Mode)</h2>
          <button
            onClick={() => setViewMode('arrangement')}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ← Back to Arrangement
          </button>
        </div>
        <SandboxMode
          onGenerate={async (constraints) => {
            try {
              console.log('[Architect] Generating structure with constraints:', constraints);
              const ipcAPI = globalThis?.electronAPI?.invoke || globalThis?.ipc?.invoke;
              if (ipcAPI) {
                const result = await ipcAPI('SANDBOX:GENERATE', constraints);
                console.log('[Architect] SANDBOX:GENERATE result:', result);
                if (result?.success) {
                  setSandboxBlocks(result.blocks || []);
                  setBlocks(result.blocks || []);
                } else if (result?.blocks) {
                  // Handle case where blocks are returned without success flag
                  setSandboxBlocks(result.blocks);
                  setBlocks(result.blocks);
                } else {
                  console.warn('[Architect] SANDBOX:GENERATE returned no blocks:', result);
                }
              } else {
                console.error('[Architect] No IPC API available');
              }
            } catch (error) {
              console.error('[Architect] Error generating structure:', error);
            }
          }}
          generatedBlocks={sandboxBlocks}
          onUpdateBlock={(blockId, update) => {
            setSandboxBlocks((prev) =>
              prev.map((b) => (b.id === blockId ? { ...b, ...update } : b)),
            );
            setBlocks((prev = []) =>
              prev.map((b) => (b && b.id === blockId ? { ...b, ...update } : b)),
            );
          }}
          setGlobalBlocks={setBlocks}
          onSwitchToGrid={() => {
            // Create synthetic linearAnalysis from sandbox blocks
            const syntheticAnalysis = createSyntheticAnalysisFromBlocks(sandboxBlocks);
            setAnalysisData(syntheticAnalysis);
            setViewMode('grid');
          }}
        />
      </div>
    );
  }

  // Default: Level A view (Arrangement Grid)
  // Show landing page if no blocks loaded
  if (!remoteBlocks || remoteBlocks.length === 0) {
    return (
      <div style={{ display: 'flex', gap: 16, padding: 16, height: '100%' }}>
        <main
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '2rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '3rem',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div
              onClick={() => navigate('/analysis')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <Upload size={32} style={{ color: '#2563eb' }} />
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Analyze</div>
            </div>

            <div
              onClick={() => setViewMode('sandbox')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <Sparkles size={32} style={{ color: '#10b981' }} />
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Blank Canvas</div>
            </div>

            <div
              onClick={() => {
                // Navigate to sandbox with grid view, or set viewMode if already in architect
                if (remoteBlocks && remoteBlocks.length > 0) {
                  setViewMode('grid');
                } else {
                  navigate('/sandbox');
                }
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <Grid3x3 size={32} style={{ color: '#7c3aed' }} />
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Edit Grid</div>
            </div>
          </div>
        </main>

        <aside
          style={{
            width: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <SeamlessLoader />
        </aside>
      </div>
    );
  }

  // Show arrangement grid when blocks are loaded
  // Filter out empty blocks - only show blocks with actual data
  const nonEmptyBlocks = blocks.filter((b) => b !== null && b !== undefined);

  return (
    <div style={{ display: 'flex', gap: 16, padding: 16, height: '100%' }}>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Icons at the top */}
        <div
          style={{
            display: 'flex',
            gap: '3rem',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: '2rem',
            paddingTop: '1rem',
          }}
        >
          <div
            onClick={() => navigate('/analysis')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <Upload size={32} style={{ color: '#2563eb' }} />
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Analyze</div>
          </div>

          <div
            onClick={() => setViewMode('sandbox')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <Sparkles size={32} style={{ color: '#10b981' }} />
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Blank Canvas</div>
          </div>

          <div
            onClick={() => setViewMode('grid')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <Grid3x3 size={32} style={{ color: '#7c3aed' }} />
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Edit Grid</div>
          </div>

          <div
            onClick={() => {
              setBlocks([]);
              setSelectedId(null);
              setSelectedSection(null);
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <Trash2 size={32} style={{ color: '#dc2626' }} />
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Clear Blocks</div>
          </div>
        </div>
        {nonEmptyBlocks.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 12,
            }}
          >
            {nonEmptyBlocks.map((b, displayIndex) => {
              // Find original index in the full blocks array for drag operations
              const originalIndex = blocks.findIndex((block) => block && block.id === b.id);

              // Ensure block has all necessary data for ArrangementBlock
              const blockWithData = {
                ...b,
                name: b.name || b.label || b.section_label || 'Untitled',
                label: b.label || b.section_label || b.name || 'Untitled',
                length: b.length || b.bars || b.barLength || 4,
                section_label: b.section_label,
                section_variant: b.section_variant,
                harmonic_dna: b.harmonic_dna || {},
                rhythmic_dna: b.rhythmic_dna || {},
                probability_score: b.probability_score,
              };

              return (
                <div
                  key={b.id}
                  draggable
                  onDragStart={(e) => {
                    if (originalIndex >= 0) {
                      onDragStart(e, originalIndex);
                    }
                  }}
                  onDrop={(e) => {
                    if (originalIndex >= 0) {
                      onDrop(e, originalIndex);
                    }
                  }}
                  onDragOver={(e) => {
                    if (originalIndex >= 0) {
                      onDragOver(e, originalIndex);
                    }
                  }}
                  onClick={() => onSelect(b.id)}
                  style={{
                    userSelect: 'none',
                    border:
                      selectedId && b.id === selectedId ? '2px solid #2563eb' : '1px solid #ddd',
                    borderRadius: 6,
                    cursor: 'grab',
                  }}
                >
                  <ArrangementBlock block={blockWithData} onClick={() => {}} className="" />
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: '#6b7280',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <p>No music sections loaded. Use the SeamlessLoader to analyze an audio file.</p>
          </div>
        )}
      </main>

      <aside
        style={{
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <SeamlessLoader />
        <ContextualBlockStatus selectedId={selectedId} />
        {structuralMap?.debug?.noveltyCurve && (
          <NoveltyCurveVisualizer structuralMap={structuralMap} />
        )}
      </aside>
    </div>
  );
}
