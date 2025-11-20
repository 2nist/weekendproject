import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sectionsToBlocks } from '../utils/architectBlocks';
import YouTubeInput from './importer/YouTubeInput';
import ProbabilityDashboard from './ProbabilityDashboard';

/**
 * Analysis Job Manager
 * UI for uploading files and managing analysis jobs
 */
export default function AnalysisJobManager() {
  const [filePath, setFilePath] = useState('');
  const [userHints, setUserHints] = useState({
    genre: 'pop',
    expected_form: '',
    key_hint: '',
    mode_hint: 'ionian',
    harmonic_complexity: 50,
    tempo_hint: '',
  });
  const [analysisStatus, setAnalysisStatus] = useState(null);
  const [progress, setProgress] = useState({ overall: 0, pass1: 0, pass2: 0, pass3: 0 });
  const [currentStep, setCurrentStep] = useState('');
  const [fileHash, setFileHash] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const progressUnsubscribeRef = useRef(null);

  const sendBlocksToArchitect = useCallback(
    async (hash, sections) => {
      if (!sections || sections.length === 0) return;

      const fallbackDispatch = (blocks) => {
        window.__lastBlocks = blocks;
        window.dispatchEvent(new CustomEvent('UI:BLOCKS_UPDATE', { detail: blocks }));
        setAnalysisResult((prev) => ({
          ...(prev || {}),
          loadResult: { success: true, fallback: true, count: blocks.length, blocks },
        }));
      };

      if (window.electronAPI && window.electronAPI.invoke) {
        try {
          console.log('Loading analysis results into Architect view...');
          const loadResult = await window.electronAPI.invoke('ANALYSIS:LOAD_TO_ARCHITECT', hash);
          if (loadResult?.success) {
            console.log(`✓ Successfully loaded ${loadResult.count} sections into Architect view`);
            setAnalysisResult((prev) => ({ ...(prev || {}), loadResult }));
          } else {
            console.warn('Failed to load analysis to Architect via IPC:', loadResult?.error);
            fallbackDispatch(sectionsToBlocks(sections));
          }
        } catch (error) {
          console.error('Error loading analysis to Architect:', error);
          fallbackDispatch(sectionsToBlocks(sections));
        }
      } else {
        console.log('Browser fallback: dispatching blocks locally');
        fallbackDispatch(sectionsToBlocks(sections));
      }
    },
    [setAnalysisResult],
  );

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (progressUnsubscribeRef.current) {
        try {
          progressUnsubscribeRef.current();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  const handleFileSelect = async () => {
    try {
      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.showOpenDialog) {
        alert('File selection is not available. Please ensure you are running in Electron.');
        console.error('electronAPI.showOpenDialog is not available');
        return;
      }

      // Use Electron's dialog API to get the actual file path
      const result = await window.electronAPI.showOpenDialog({
        title: 'Select Audio File',
        filters: [
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'aac'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        setFilePath(selectedPath);
        setAnalysisStatus(null);
        setProgress({ overall: 0, pass1: 0, pass2: 0, pass3: 0 });
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      alert(`Error selecting file: ${error.message || 'Unknown error'}`);
    }
  };

  const handleStartAnalysis = async () => {
    if (!filePath) {
      alert('Please select an audio file');
      return;
    }

    setAnalysisStatus('starting');
    setProgress({ overall: 0, pass1: 0, pass2: 0, pass3: 0 });
    setCurrentStep('Starting analysis...');

    try {
      // Set up progress listener BEFORE starting analysis
      if (window.ipc && typeof window.ipc.on === 'function') {
        console.log('Setting up progress listener...');
        const unsubscribe = window.ipc.on('ANALYSIS:PROGRESS', (data) => {
          console.log('Progress update received:', data);
          if (data && data.progress) {
            setProgress(data.progress);
            console.log(`Progress: Overall=${data.progress.overall}%, Pass1=${data.progress.pass1}%, Pass2=${data.progress.pass2}%, Pass3=${data.progress.pass3}%`);
          }
          if (data && data.state) {
            setAnalysisStatus(data.state === 'completed' ? 'completed' : 'processing');
            console.log(`State changed to: ${data.state}`);
          }
          if (data && data.fileHash) {
            setFileHash(data.fileHash);
          }
          // Map state to step name
          const stepNames = {
            pass1: 'The Listener (DSP Analysis)',
            pass2: 'The Architect (Structure Detection)',
            pass3: 'The Theorist (Theory Correction)',
            completed: 'Analysis Complete',
            failed: 'Analysis Failed',
          };
          setCurrentStep(stepNames[data?.state] || data?.state || '');
        });
        progressUnsubscribeRef.current = unsubscribe;
        console.log('Progress listener set up successfully');
      } else {
        console.warn('window.ipc.on is not available - progress updates may not work');
      }

      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.invoke) {
        alert('Analysis is not available. Please ensure you are running in Electron.');
        console.error('electronAPI.invoke is not available');
        return;
      }

      // Small delay to ensure listener is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('Starting analysis for:', filePath);
      // Start analysis
      const result = await window.electronAPI.invoke('ANALYSIS:START', {
        filePath,
        userHints,
      });
      console.log('Analysis result:', result);

      if (result?.success) {
        setFileHash(result.fileHash);
        setAnalysisStatus('completed');
        setCurrentStep('Analysis Complete');
        
        try {
          let analysisData = null;
          if (window.electronAPI && window.electronAPI.invoke) {
            console.log('Fetching analysis results for fileHash:', result.fileHash);
            analysisData = await window.electronAPI.invoke('ANALYSIS:GET_RESULT', result.fileHash);
          }

          if (analysisData) {
            console.log('Analysis data received:', {
              hasData: !!analysisData,
              hasLinearAnalysis: !!analysisData?.linear_analysis,
              hasStructuralMap: !!analysisData?.structural_map,
              sectionCount: analysisData?.structural_map?.sections?.length || 0,
              eventCount: analysisData?.linear_analysis?.events?.length || 0,
            });

            setAnalysisResult(analysisData);
            console.log('Analysis results set in state');

            // Dispatch analysis data event for HarmonicGrid
            if (analysisData?.linear_analysis || analysisData?.structural_map) {
              window.dispatchEvent(new CustomEvent('analysis:data', {
                detail: {
                  linear_analysis: analysisData.linear_analysis,
                  structural_map: analysisData.structural_map,
                }
              }));
              // Also store in window for direct access
              window.__lastAnalysisData = {
                linear_analysis: analysisData.linear_analysis,
                structural_map: analysisData.structural_map,
              };
              console.log('Analysis data dispatched for HarmonicGrid');
            }

            if (!analysisData.linear_analysis || !analysisData.structural_map) {
              console.error('Analysis data missing required fields!', analysisData);
            }

            await sendBlocksToArchitect(
              result.fileHash,
              analysisData.structural_map?.sections || [],
            );
          } else {
            console.warn('No analysis data returned after analysis completion');
          }
        } catch (error) {
          console.error('Error fetching analysis results:', error);
        }
      } else {
        setAnalysisStatus('failed');
        setCurrentStep('Analysis Failed');
        alert(result?.error || 'Analysis failed');
      }
    } catch (error) {
      setAnalysisStatus('failed');
      setCurrentStep('Analysis Failed');
      console.error('Analysis error:', error);
      alert(`Analysis error: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h2>Audio Analysis</h2>

      <div style={{ marginBottom: '20px' }}>
        <div>
          <strong>Audio File:</strong>
          <button
            onClick={handleFileSelect}
            style={{
              marginLeft: '10px',
              padding: '8px 16px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            Select Audio File...
          </button>
        </div>
        <div style={{ marginTop: '12px' }}>
          <YouTubeInput onFileReady={(path) => setFilePath(path)} />
        </div>
        {filePath && (
          <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#f0f0f0', borderRadius: '5px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Selected:</div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>{filePath}</div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Analysis Hints (Optional)</h3>
        <p style={{ fontSize: '12px', color: '#666' }}>
          Useful for non-stereotypical song forms
        </p>

        <div style={{ marginTop: '10px' }}>
          <label>
            Genre:
            <select
              value={userHints.genre}
              onChange={(e) => setUserHints({ ...userHints, genre: e.target.value })}
              style={{ marginLeft: '10px', padding: '5px' }}
            >
              <option value="pop">Pop</option>
              <option value="jazz">Jazz</option>
                      <option value="jazz_traditional">Jazz / Traditional</option>
              <option value="neo_soul">Neo-Soul</option>
              <option value="rock">Rock</option>
            </select>
          </label>
        </div>

        <div style={{ marginTop: '10px' }}>
          <label>
            Expected Form:
            <input
              type="text"
              value={userHints.expected_form}
              onChange={(e) =>
                setUserHints({ ...userHints, expected_form: e.target.value })
              }
              placeholder="e.g., Verse-Chorus, AABA"
              style={{ marginLeft: '10px', padding: '5px', width: '200px' }}
            />
          </label>
        </div>

        <div style={{ marginTop: '10px' }}>
          <label>
            Key Hint:
            <input
              type="text"
              value={userHints.key_hint}
              onChange={(e) => setUserHints({ ...userHints, key_hint: e.target.value })}
              placeholder="e.g., C, G, F"
              style={{ marginLeft: '10px', padding: '5px', width: '100px' }}
            />
          </label>
        </div>

                <div style={{ marginTop: '10px' }}>
                  <label>
                    BPM Hint:
                    <input
                      type="number"
                      min="40"
                      max="240"
                      value={userHints.tempo_hint}
                      onChange={(e) =>
                        setUserHints({
                          ...userHints,
                          tempo_hint: e.target.value,
                        })
                      }
                      placeholder="e.g., 116"
                      style={{ marginLeft: '10px', padding: '5px', width: '120px' }}
                    />
                  </label>
                </div>

        <div style={{ marginTop: '10px' }}>
          <label>
            Harmonic Complexity (0-100):
            <input
              type="range"
              min="0"
              max="100"
              value={userHints.harmonic_complexity}
              onChange={(e) =>
                setUserHints({
                  ...userHints,
                  harmonic_complexity: parseInt(e.target.value),
                })
              }
              style={{ marginLeft: '10px', width: '200px' }}
            />
            <span style={{ marginLeft: '10px' }}>{userHints.harmonic_complexity}%</span>
          </label>
        </div>
      </div>

      <button
        onClick={handleStartAnalysis}
        disabled={!filePath || analysisStatus === 'processing'}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: analysisStatus === 'processing' ? 'not-allowed' : 'pointer',
        }}
      >
        {analysisStatus === 'processing' ? 'Analyzing...' : 'Start Analysis'}
      </button>

      {analysisStatus && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
          <div style={{ marginBottom: '10px' }}>
            <strong>Status:</strong> {currentStep || analysisStatus}
          </div>

          {analysisStatus === 'processing' && (
            <div>
              <div style={{ marginBottom: '5px' }}>
                <strong>Overall Progress:</strong> {Math.round(progress.overall || 0)}%
              </div>
              <div style={{ width: '100%', height: '20px', backgroundColor: '#ddd', borderRadius: '10px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${progress.overall || 0}%`,
                    height: '100%',
                    backgroundColor: '#2563eb',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              <div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
                <div>Pass 1 (Listener): {Math.round(progress.pass1 || 0)}%</div>
                <div>Pass 2 (Architect): {Math.round(progress.pass2 || 0)}%</div>
                <div>Pass 3 (Theorist): {Math.round(progress.pass3 || 0)}%</div>
              </div>
            </div>
          )}

          {analysisStatus === 'completed' && (
            <div>
              <div style={{ color: '#059669', fontWeight: 'bold', marginBottom: '10px' }}>
                ✓ Analysis completed successfully!
                {fileHash && <div style={{ fontSize: '12px', marginTop: '5px', color: '#666' }}>File Hash: {fileHash.substring(0, 8)}...</div>}
              </div>
              
                  {analysisResult && analysisResult.loadResult && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#dcfce7', borderRadius: '5px', fontSize: '12px' }}>
                      <strong>✓ {analysisResult.loadResult.count} sections loaded into Architect view</strong>
                      <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
                        Switch to the Architect tab to view them. If they don't appear, click "Refresh Blocks" in the Architect view.
                      </div>
                    </div>
                  )}
                  
                  {analysisResult && (
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '15px' }}>
                  <div style={{ flex: '1 1 320px', padding: '10px', backgroundColor: '#fff', borderRadius: '5px', border: '1px solid #ddd' }}>
                    <h4 style={{ marginBottom: '10px' }}>Analysis Results:</h4>
                    
                    {analysisResult.linear_analysis && (
                      <div style={{ marginBottom: '10px', fontSize: '12px' }}>
                        <strong>Linear Analysis:</strong>
                        <div style={{ marginLeft: '10px', marginTop: '5px' }}>
                          <div>Duration: {analysisResult.linear_analysis.metadata?.duration_seconds?.toFixed(2) || 'N/A'} seconds</div>
                          <div>Sample Rate: {analysisResult.linear_analysis.metadata?.sample_rate || 'N/A'} Hz</div>
                          <div>Detected Key: {analysisResult.linear_analysis.metadata?.detected_key || 'N/A'} {analysisResult.linear_analysis.metadata?.detected_mode || ''}</div>
                          <div>Tempo: {analysisResult.linear_analysis.beat_grid?.tempo_bpm?.toFixed(1) || 'N/A'} BPM</div>
                          <div>Beats Detected: {analysisResult.linear_analysis.beat_grid?.beat_timestamps?.length || 0}</div>
                          <div>Events: {analysisResult.linear_analysis.events?.length || 0}</div>
                          <div>Chroma Frames: {analysisResult.linear_analysis.chroma_frames?.length || 0}</div>
                        </div>
                      </div>
                    )}
                    
                    {analysisResult.structural_map && (
                      <div style={{ marginBottom: '10px', fontSize: '12px' }}>
                        <strong>Structural Map:</strong>
                        <div style={{ marginLeft: '10px', marginTop: '5px' }}>
                          <div>Sections: {analysisResult.structural_map.sections?.length || 0}</div>
                          {analysisResult.structural_map.sections && analysisResult.structural_map.sections.length > 0 && (
                            <div style={{ marginTop: '5px' }}>
                              <strong>Section Labels:</strong>
                              <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
                                {analysisResult.structural_map.sections.map((section, idx) => (
                                  <li key={idx}>
                                    {section.section_label || 'Unknown'} ({section.section_variant || 1})
                                    {section.time_range && (
                                      <span style={{ color: '#666' }}>
                                        {' '} - {section.time_range.start_time?.toFixed(2)}s to {section.time_range.end_time?.toFixed(2)}s
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {analysisResult.arrangement_flow && (
                      <div style={{ marginBottom: '10px', fontSize: '12px' }}>
                        <strong>Arrangement Flow:</strong>
                        <div style={{ marginLeft: '10px', marginTop: '5px' }}>
                          <div>Form: {analysisResult.arrangement_flow.form || 'N/A'}</div>
                          <div>Timeline Items: {analysisResult.arrangement_flow.timeline?.length || 0}</div>
                        </div>
                      </div>
                    )}
                    
                    {analysisResult.harmonic_context && (
                      <div style={{ marginBottom: '10px', fontSize: '12px' }}>
                        <strong>Harmonic Context:</strong>
                        <div style={{ marginLeft: '10px', marginTop: '5px' }}>
                          <div>Global Key: {analysisResult.harmonic_context.global_key?.primary_key || 'N/A'} {analysisResult.harmonic_context.global_key?.mode || ''}</div>
                          <div>Genre: {analysisResult.harmonic_context.genre_profile?.detected_genre || 'N/A'}</div>
                        </div>
                      </div>
                    )}
                    
                    <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f0f9ff', borderRadius: '5px', fontSize: '11px', color: '#666' }}>
                      <strong>Note:</strong> Navigate to the "Architect" tab to view the full structural analysis and edit the song.
                      {analysisResult?.loadResult?.success && (
                        <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#dcfce7', borderRadius: '4px' }}>
                          ✓ {analysisResult.loadResult.count} sections have been loaded into the Architect view. Click "Refresh Blocks" if they don't appear.
                        </div>
                      )}
                    </div>
                  </div>

                  <ProbabilityDashboard analysis={analysisResult} />
                </div>
              )}
              
              {!analysisResult && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fef3c7', borderRadius: '5px', fontSize: '12px', color: '#92400e' }}>
                  Loading analysis results...
                </div>
              )}
            </div>
          )}

          {analysisStatus === 'failed' && (
            <div style={{ color: '#dc2626', fontWeight: 'bold' }}>
              ✗ Analysis failed. Please check the console for details.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

