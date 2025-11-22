import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sectionsToBlocks } from '../utils/architectBlocks';
import YouTubeInput from './importer/YouTubeInput';
import ProbabilityDashboard from './ProbabilityDashboard';
import AnalysisTuner from './tools/AnalysisTuner';

/**
 * Analysis Job Manager
 * UI for uploading files and managing analysis jobs
 */
export default function AnalysisJobManager() {
  const [filePath, setFilePath] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState(null);
  const [progress, setProgress] = useState({
    overall: 0,
    pass1: 0,
    pass2: 0,
    pass3: 0,
  });
  const [currentStep, setCurrentStep] = useState('');
  const [fileHash, setFileHash] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const progressUnsubscribeRef = useRef(null);

  const sendBlocksToArchitect = useCallback(
    async (hash, sections) => {
      if (!sections || sections.length === 0) return;

      const fallbackDispatch = (blocks) => {
        window.__lastBlocks = blocks;
        window.dispatchEvent(
          new CustomEvent('UI:BLOCKS_UPDATE', { detail: blocks }),
        );
        setAnalysisResult((prev) => ({
          ...(prev || {}),
          loadResult: {
            success: true,
            fallback: true,
            count: blocks.length,
            blocks,
          },
        }));
      };

      if (window.electronAPI && window.electronAPI.invoke) {
        try {
          console.log('Loading analysis results into Architect view...');
          const loadResult = await window.electronAPI.invoke(
            'ANALYSIS:LOAD_TO_ARCHITECT',
            hash,
          );
          if (loadResult?.success) {
            console.log(
              `✓ Successfully loaded ${loadResult.count} sections into Architect view`,
            );
            setAnalysisResult((prev) => ({ ...(prev || {}), loadResult }));
          } else {
            console.warn(
              'Failed to load analysis to Architect via IPC:',
              loadResult?.error,
            );
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
        alert(
          'File selection is not available. Please ensure you are running in Electron.',
        );
        console.error('electronAPI.showOpenDialog is not available');
        return;
      }

      // Use Electron's dialog API to get the actual file path
      const result = await window.electronAPI.showOpenDialog({
        title: 'Select Audio File',
        filters: [
          {
            name: 'Audio Files',
            extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'aac'],
          },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (
        result &&
        !result.canceled &&
        result.filePaths &&
        result.filePaths.length > 0
      ) {
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
            console.log(
              `Progress: Overall=${data.progress.overall}%, Pass1=${data.progress.pass1}%, Pass2=${data.progress.pass2}%, Pass3=${data.progress.pass3}%`,
            );
          }
          if (data && data.state) {
            setAnalysisStatus(
              data.state === 'completed' ? 'completed' : 'processing',
            );
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
        console.warn(
          'window.ipc.on is not available - progress updates may not work',
        );
      }

      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.invoke) {
        alert(
          'Analysis is not available. Please ensure you are running in Electron.',
        );
        console.error('electronAPI.invoke is not available');
        return;
      }

      // Small delay to ensure listener is ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log('Starting analysis for:', filePath);
      // Start analysis (userHints removed - use Analysis Lab for fine-tuning)
      const result = await window.electronAPI.invoke('ANALYSIS:START', {
        filePath,
        userHints: {}, // Analysis Lab handles fine-tuning after analysis
      });
      console.log('Analysis result:', result);

      if (result?.success) {
        setFileHash(result.fileHash);
        setAnalysisStatus('completed');
        setCurrentStep('Analysis Complete');

        try {
          let analysisData = null;
          if (window.electronAPI && window.electronAPI.invoke) {
            console.log(
              'Fetching analysis results for fileHash:',
              result.fileHash,
            );
            analysisData = await window.electronAPI.invoke(
              'ANALYSIS:GET_RESULT',
              result.fileHash,
            );
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
              window.dispatchEvent(
                new CustomEvent('analysis:data', {
                  detail: {
                    linear_analysis: analysisData.linear_analysis,
                    structural_map: analysisData.structural_map,
                  },
                }),
              );
              // Also store in window for direct access
              window.__lastAnalysisData = {
                linear_analysis: analysisData.linear_analysis,
                structural_map: analysisData.structural_map,
              };
              console.log('Analysis data dispatched for HarmonicGrid');
            }

            if (!analysisData.linear_analysis || !analysisData.structural_map) {
              console.error(
                'Analysis data missing required fields!',
                analysisData,
              );
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
    <div className="p-5 max-w-3xl">
      <h2 className="text-2xl font-bold text-foreground mb-5">Audio Analysis</h2>

      <div className="mb-5">
        <div className="flex items-center gap-3 mb-3">
          <strong className="text-foreground">Audio File:</strong>
          <button
            onClick={handleFileSelect}
            className="px-4 py-2 bg-primary text-primary-foreground border-none rounded-md cursor-pointer hover:opacity-90 transition-opacity"
          >
            Select Audio File...
          </button>
        </div>
        <div className="mt-3">
          <YouTubeInput onFileReady={(path) => setFilePath(path)} />
        </div>
        {filePath && (
          <div className="mt-3 p-3 bg-card border border-border rounded-md">
            <div className="text-xs text-muted-foreground mb-2">
              Selected:
            </div>
            <div className="font-mono text-xs text-card-foreground break-all">
              {filePath}
            </div>
          </div>
        )}
      </div>

      {filePath && (
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-foreground mb-3">Analysis Lab</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Fine-tune analysis parameters before running or refine results after analysis
          </p>
          <AnalysisTuner
            fileHash={fileHash}
            onUpdate={() => {
              // Refresh analysis results if available
              if (fileHash && analysisResult) {
                // Could trigger a refresh of the analysis view here if needed
                console.log('Analysis updated, consider refreshing view');
              }
            }}
          />
        </div>
      )}

      <button
        onClick={handleStartAnalysis}
        disabled={!filePath || analysisStatus === 'processing'}
        className="px-5 py-2.5 text-base bg-primary text-primary-foreground border-none rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {analysisStatus === 'processing' ? 'Analyzing...' : 'Start Analysis'}
      </button>

      {analysisStatus && (
        <div className="mt-5 p-4 bg-card border border-border rounded-md">
          <div className="mb-3 text-foreground">
            <strong>Status:</strong> {currentStep || analysisStatus}
          </div>

          {analysisStatus === 'processing' && (
            <div>
              <div className="mb-2 text-foreground">
                <strong>Overall Progress:</strong>{' '}
                {Math.round(progress.overall || 0)}%
              </div>
              <div className="w-full h-5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress.overall || 0}%` }}
                />
              </div>

              <div className="mt-4 text-xs text-muted-foreground space-y-1">
                <div>Pass 1 (Listener): {Math.round(progress.pass1 || 0)}%</div>
                <div>
                  Pass 2 (Architect): {Math.round(progress.pass2 || 0)}%
                </div>
                <div>Pass 3 (Theorist): {Math.round(progress.pass3 || 0)}%</div>
              </div>
            </div>
          )}

          {analysisStatus === 'completed' && (
            <div>
              <div className="text-green-600 font-bold mb-3">
                ✓ Analysis completed successfully!
                {fileHash && (
                  <div className="text-xs text-muted-foreground mt-1">
                    File Hash: {fileHash.substring(0, 8)}...
                  </div>
                )}
              </div>

              {analysisResult && analysisResult.loadResult && (
                <div className="mt-3 p-3 bg-green-900/20 border border-green-700/30 rounded-md text-xs text-green-400">
                  <strong>
                    ✓ {analysisResult.loadResult.count} sections loaded into
                    Architect view
                  </strong>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Switch to the Architect tab to view them. If they don't
                    appear, click "Refresh Blocks" in the Architect view.
                  </div>
                </div>
              )}

              {analysisResult && (
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    flexWrap: 'wrap',
                    marginTop: '15px',
                  }}
                >
                  <div className="flex-1 min-w-[320px] p-3 bg-card border border-border rounded-md text-card-foreground">
                    <h4 className="mb-3 text-foreground font-semibold">Analysis Results:</h4>

                    {analysisResult.linear_analysis && (
                      <div className="mb-3 text-xs text-card-foreground">
                        <strong>Linear Analysis:</strong>
                        <div className="ml-3 mt-1 space-y-1">
                          <div>
                            Duration:{' '}
                            {analysisResult.linear_analysis.metadata?.duration_seconds?.toFixed(
                              2,
                            ) || 'N/A'}{' '}
                            seconds
                          </div>
                          <div>
                            Sample Rate:{' '}
                            {analysisResult.linear_analysis.metadata
                              ?.sample_rate || 'N/A'}{' '}
                            Hz
                          </div>
                          <div>
                            Detected Key:{' '}
                            {analysisResult.linear_analysis.metadata
                              ?.detected_key || 'N/A'}{' '}
                            {analysisResult.linear_analysis.metadata
                              ?.detected_mode || ''}
                          </div>
                          <div>
                            Tempo:{' '}
                            {analysisResult.linear_analysis.beat_grid?.tempo_bpm?.toFixed(
                              1,
                            ) || 'N/A'}{' '}
                            BPM
                          </div>
                          <div>
                            Beats Detected:{' '}
                            {analysisResult.linear_analysis.beat_grid
                              ?.beat_timestamps?.length || 0}
                          </div>
                          <div>
                            Events:{' '}
                            {analysisResult.linear_analysis.events?.length || 0}
                          </div>
                          <div>
                            Chroma Frames:{' '}
                            {analysisResult.linear_analysis.chroma_frames
                              ?.length || 0}
                          </div>
                        </div>
                      </div>
                    )}

                    {analysisResult.structural_map && (
                      <div className="mb-3 text-xs text-card-foreground">
                        <strong>Structural Map:</strong>
                        <div className="ml-3 mt-1 space-y-1">
                          <div>
                            Sections:{' '}
                            {analysisResult.structural_map.sections?.length ||
                              0}
                          </div>
                          {analysisResult.structural_map.sections &&
                            analysisResult.structural_map.sections.length >
                              0 && (
                              <div style={{ marginTop: '5px' }}>
                                <strong>Section Labels:</strong>
                                <ul
                                  style={{
                                    marginLeft: '20px',
                                    marginTop: '5px',
                                  }}
                                >
                                  {analysisResult.structural_map.sections.map(
                                    (section, idx) => (
                                      <li key={idx} className="text-card-foreground">
                                        {section.section_label || 'Unknown'} (
                                        {section.section_variant || 1})
                                        {section.time_range && (
                                          <span className="text-muted-foreground">
                                            {' '}
                                            -{' '}
                                            {section.time_range.start_time?.toFixed(
                                              2,
                                            )}
                                            s to{' '}
                                            {section.time_range.end_time?.toFixed(
                                              2,
                                            )}
                                            s
                                          </span>
                                        )}
                                      </li>
                                    ),
                                  )}
                                </ul>
                              </div>
                            )}
                        </div>
                      </div>
                    )}

                    {analysisResult.arrangement_flow && (
                      <div className="mb-3 text-xs text-card-foreground">
                        <strong>Arrangement Flow:</strong>
                        <div className="ml-3 mt-1 space-y-1">
                          <div>
                            Form:{' '}
                            {analysisResult.arrangement_flow.form || 'N/A'}
                          </div>
                          <div>
                            Timeline Items:{' '}
                            {analysisResult.arrangement_flow.timeline?.length ||
                              0}
                          </div>
                        </div>
                      </div>
                    )}

                    {analysisResult.harmonic_context && (
                      <div className="mb-3 text-xs text-card-foreground">
                        <strong>Harmonic Context:</strong>
                        <div className="ml-3 mt-1 space-y-1">
                          <div>
                            Global Key:{' '}
                            {analysisResult.harmonic_context.global_key
                              ?.primary_key || 'N/A'}{' '}
                            {analysisResult.harmonic_context.global_key?.mode ||
                              ''}
                          </div>
                          <div>
                            Genre:{' '}
                            {analysisResult.harmonic_context.genre_profile
                              ?.detected_genre || 'N/A'}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 p-3 bg-muted border border-border rounded-md text-xs text-muted-foreground">
                      <strong>Note:</strong> Navigate to the "Architect" tab to
                      view the full structural analysis and edit the song.
                      {analysisResult?.loadResult?.success && (
                        <div className="mt-2 p-2 bg-green-900/20 border border-green-700/30 rounded text-green-400">
                          ✓ {analysisResult.loadResult.count} sections have been
                          loaded into the Architect view. Click "Refresh Blocks"
                          if they don't appear.
                        </div>
                      )}
                    </div>
                  </div>

                  <ProbabilityDashboard analysis={analysisResult} />
                </div>
              )}

              {!analysisResult && (
                <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-md text-xs text-yellow-400">
                  Loading analysis results...
                </div>
              )}
            </div>
          )}

          {analysisStatus === 'failed' && (
            <div className="text-destructive font-bold">
              ✗ Analysis failed. Please check the console for details.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
