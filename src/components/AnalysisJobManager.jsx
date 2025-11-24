import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sectionsToBlocks } from '../utils/architectBlocks';
import YouTubeInput from './importer/YouTubeInput';
import ProbabilityDashboard from './ProbabilityDashboard';
import AnalysisTuner from './tools/AnalysisTuner';
import {
  AppError,
  handleAsyncError,
  showErrorToast,
  useAsyncOperation,
  LoadingSpinner,
  ProgressBar,
  StatusIndicator,
} from '../utils/errorHandling';

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

  // Async operation for file selection
  const fileSelectOperation = useAsyncOperation(
    async () => {
      if (!window.electronAPI || !window.electronAPI.showOpenDialog) {
        throw new AppError(
          'File selection is not available',
          'ELECTRON_API_MISSING',
          'File selection is not available. Please ensure you are running in Electron.',
          false,
        );
      }

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

      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        return result.filePaths[0];
      }

      throw new AppError(
        'No file selected',
        'USER_CANCELLED',
        'File selection was cancelled.',
        true,
      );
    },
    {
      onSuccess: (selectedPath) => {
        setFilePath(selectedPath);
        setAnalysisStatus(null);
        setProgress({ overall: 0, pass1: 0, pass2: 0, pass3: 0 });
      },
      onError: (error) => {
        showErrorToast(error);
      },
    },
  );

  // Async operation for analysis
  const analysisOperation = useAsyncOperation(
    async (filePath) => {
      if (!filePath) {
        throw new AppError(
          'No file selected',
          'INVALID_INPUT',
          'Please select an audio file first.',
          true,
        );
      }

      setAnalysisStatus('starting');
      setProgress({ overall: 0, pass1: 0, pass2: 0, pass3: 0 });

      // Start analysis via IPC
      const result = await window.electronAPI.invoke('ANALYSIS:START', { filePath });

      if (!result?.success) {
        throw new AppError(
          result?.error || 'Analysis failed',
          'ANALYSIS_FAILED',
          'Failed to analyze the audio file. Please try a different file or check the file format.',
          true,
        );
      }

      return result;
    },
    {
      onSuccess: (result) => {
        setFileHash(result.fileHash);
        setAnalysisStatus('completed');
        // Progress will be updated via IPC subscription
      },
      onError: (error) => {
        setAnalysisStatus('error');
        showErrorToast(error);
      },
    },
  );

  const sendBlocksToArchitect = useCallback(
    async (hash, sections) => {
      if (!sections || sections.length === 0) return;

      const fallbackDispatch = (blocks) => {
        window.__lastBlocks = blocks;
        window.dispatchEvent(new CustomEvent('UI:BLOCKS_UPDATE', { detail: blocks }));
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
          const loadResult = await window.electronAPI.invoke('ANALYSIS:LOAD_TO_ARCHITECT', hash);
          if (loadResult?.success) {
            console.log(`Successfully loaded ${loadResult.count} sections into Architect view`);
            setAnalysisResult((prev) => ({ ...(prev || {}), loadResult }));
          } else {
            const error = new AppError(
              loadResult?.error || 'Failed to load analysis to Architect',
              'LOAD_FAILED',
              'Could not load analysis results into the Architect view. The analysis completed but the results may not be visible.',
              false, // Not critical, fallback available
            );
            console.warn('Failed to load analysis to Architect via IPC:', error.message);
            showErrorToast(error);
            fallbackDispatch(sectionsToBlocks(sections));
          }
        } catch (error) {
          const appError = new AppError(
            'Error loading analysis to Architect',
            'IPC_ERROR',
            'Failed to communicate with the analysis engine. Using fallback display mode.',
            false, // Not critical, fallback available
          );
          console.error('Error loading analysis to Architect:', error);
          showErrorToast(appError);
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

  // Listen for analysis progress updates
  useEffect(() => {
    if (!window.ipc || !window.ipc.on) return;

    const handleProgressUpdate = (progressData) => {
      console.log('[AnalysisJobManager] Progress update:', progressData);
      if (progressData && typeof progressData === 'object') {
        setProgress((prev) => ({
          ...prev,
          overall: progressData.progress?.overall || progressData.progress || 0,
          pass1:
            progressData.progress?.pass1 ||
            (progressData.state === 'pass1' ? progressData.progress : prev.pass1) ||
            0,
          pass2:
            progressData.progress?.pass2 ||
            (progressData.state === 'pass2' ? progressData.progress : prev.pass2) ||
            0,
          pass3:
            progressData.progress?.pass3 ||
            (progressData.state === 'pass3' ? progressData.progress : prev.pass3) ||
            0,
        }));

        // Update current step based on state
        if (progressData.state) {
          setCurrentStep(progressData.state.replace('pass', 'Pass ').replace('step', 'Step '));
        }

        setAnalysisStatus('processing');
      }
    };

    const unsubscribe = window.ipc.on('ANALYSIS:PROGRESS', handleProgressUpdate);
    progressUnsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleFileSelect = useCallback(() => {
    fileSelectOperation.execute();
  }, [fileSelectOperation]);

  const handleStartAnalysis = useCallback(() => {
    if (!filePath) {
      showErrorToast(
        new AppError(
          'No file selected',
          'INVALID_INPUT',
          'Please select an audio file first.',
          true,
        ),
      );
      return;
    }

    analysisOperation.execute(filePath);
  }, [filePath, analysisOperation]);

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
            <div className="text-xs text-muted-foreground mb-2">Selected:</div>
            <div className="font-mono text-xs text-card-foreground break-all">{filePath}</div>
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
        onClick={handleFileSelect}
        disabled={fileSelectOperation.loading}
        className="px-5 py-2.5 text-base bg-secondary text-secondary-foreground border-none rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mr-3"
      >
        {fileSelectOperation.loading ? (
          <>
            <LoadingSpinner size="sm" className="mr-2" />
            Selecting...
          </>
        ) : (
          'Select Audio File'
        )}
      </button>

      <button
        onClick={handleStartAnalysis}
        disabled={!filePath || analysisOperation.loading}
        className="px-5 py-2.5 text-base bg-primary text-primary-foreground border-none rounded-md cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {analysisOperation.loading ? (
          <>
            <LoadingSpinner size="sm" className="mr-2" />
            Analyzing...
          </>
        ) : (
          'Start Analysis'
        )}
      </button>

      {analysisStatus && (
        <div className="mt-5 p-4 bg-card border border-border rounded-md">
          <div className="mb-3">
            <StatusIndicator
              status={
                analysisStatus === 'completed'
                  ? 'success'
                  : analysisStatus === 'error'
                    ? 'error'
                    : analysisStatus === 'processing'
                      ? 'loading'
                      : 'info'
              }
              message={currentStep || analysisStatus}
            />
          </div>

          {analysisOperation.loading && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Overall Progress</span>
                  <span>{Math.round(progress.overall || 0)}%</span>
                </div>
                <ProgressBar progress={progress.overall || 0} />
              </div>

              <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                <div>
                  <div className="font-medium mb-1">Pass 1 (Listener)</div>
                  <ProgressBar
                    progress={progress.pass1 || 0}
                    showPercentage={false}
                    className="h-1"
                  />
                  <div className="text-center mt-1">{Math.round(progress.pass1 || 0)}%</div>
                </div>
                <div>
                  <div className="font-medium mb-1">Pass 2 (Architect)</div>
                  <ProgressBar
                    progress={progress.pass2 || 0}
                    showPercentage={false}
                    className="h-1"
                  />
                  <div className="text-center mt-1">{Math.round(progress.pass2 || 0)}%</div>
                </div>
                <div>
                  <div className="font-medium mb-1">Pass 3 (Theorist)</div>
                  <ProgressBar
                    progress={progress.pass3 || 0}
                    showPercentage={false}
                    className="h-1"
                  />
                  <div className="text-center mt-1">{Math.round(progress.pass3 || 0)}%</div>
                </div>
              </div>
            </div>
          )}

          {analysisStatus === 'completed' && (
            <div>
              <div className="text-green-600 font-bold mb-3">
                Analysis completed successfully!
                {fileHash && (
                  <div className="text-xs text-muted-foreground mt-1">
                    File Hash: {fileHash.substring(0, 8)}...
                  </div>
                )}
              </div>

              {/* Fallback Alert */}
              {analysisResult?.linear_analysis?.metadata?.fallback_used && (
                <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-md text-yellow-400">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">⚠️</span>
                    <strong>Analysis Fallback Used</strong>
                  </div>
                  <div className="text-sm">
                    The enhanced Python+Librosa analysis was not available, so the system fell back
                    to{' '}
                    <span className="font-semibold">
                      {analysisResult.linear_analysis.metadata.analysis_method
                        ?.replace('_', ' ')
                        .toUpperCase()}
                    </span>{' '}
                    analysis.
                    {analysisResult.linear_analysis.metadata.fallback_reason && (
                      <div className="mt-1 text-xs opacity-80">
                        Reason:{' '}
                        {analysisResult.linear_analysis.metadata.fallback_reason.replace('_', ' ')}
                      </div>
                    )}
                    <div className="mt-2 text-xs">
                      For better results, install Python with librosa:{' '}
                      <code className="bg-yellow-900/40 px-1 rounded">
                        pip install librosa numpy scipy
                      </code>
                    </div>
                  </div>
                </div>
              )}

              {analysisResult && analysisResult.loadResult && (
                <div className="mt-3 p-3 bg-green-900/20 border border-green-700/30 rounded-md text-xs text-green-400">
                  <strong>
                    {analysisResult.loadResult.count} sections loaded into Architect view
                  </strong>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Switch to the Architect tab to view them. If they don't appear, click "Refresh
                    Blocks" in the Architect view.
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
                            {analysisResult.linear_analysis.metadata?.sample_rate || 'N/A'} Hz
                          </div>
                          <div>
                            Detected Key:{' '}
                            {analysisResult.linear_analysis.metadata?.detected_key || 'N/A'}{' '}
                            {analysisResult.linear_analysis.metadata?.detected_mode || ''}
                          </div>
                          <div>
                            Tempo:{' '}
                            {analysisResult.linear_analysis.beat_grid?.tempo_bpm?.toFixed(1) ||
                              'N/A'}{' '}
                            BPM
                          </div>
                          <div>
                            Beats Detected:{' '}
                            {analysisResult.linear_analysis.beat_grid?.beat_timestamps?.length || 0}
                          </div>
                          <div>Events: {analysisResult.linear_analysis.events?.length || 0}</div>
                          <div>
                            Chroma Frames:{' '}
                            {analysisResult.linear_analysis.chroma_frames?.length || 0}
                          </div>
                          {/* Analysis Quality Indicator */}
                          {analysisResult.linear_analysis.metadata?.analysis_method && (
                            <div className="mt-2">
                              <strong>Analysis Method:</strong>{' '}
                              <span
                                className={`font-semibold ${
                                  analysisResult.linear_analysis.metadata.analysis_quality ===
                                  'enhanced'
                                    ? 'text-green-600'
                                    : analysisResult.linear_analysis.metadata.analysis_quality ===
                                        'standard'
                                      ? 'text-yellow-600'
                                      : 'text-red-600'
                                }`}
                              >
                                {analysisResult.linear_analysis.metadata.analysis_method
                                  .replace('_', ' ')
                                  .toUpperCase()}{' '}
                                ({analysisResult.linear_analysis.metadata.analysis_quality})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {analysisResult.structural_map && (
                      <div className="mb-3 text-xs text-card-foreground">
                        <strong>Structural Map:</strong>
                        <div className="ml-3 mt-1 space-y-1">
                          <div>Sections: {analysisResult.structural_map.sections?.length || 0}</div>
                          {analysisResult.structural_map.sections &&
                            analysisResult.structural_map.sections.length > 0 && (
                              <div style={{ marginTop: '5px' }}>
                                <strong>Section Labels:</strong>
                                <ul
                                  style={{
                                    marginLeft: '20px',
                                    marginTop: '5px',
                                  }}
                                >
                                  {analysisResult.structural_map.sections.map((section, idx) => (
                                    <li key={idx} className="text-card-foreground">
                                      {section.section_label || 'Unknown'} (
                                      {section.section_variant || 1})
                                      {section.time_range && (
                                        <span className="text-muted-foreground">
                                          {' '}
                                          - {section.time_range.start_time?.toFixed(2)}s to{' '}
                                          {section.time_range.end_time?.toFixed(2)}s
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
                      <div className="mb-3 text-xs text-card-foreground">
                        <strong>Arrangement Flow:</strong>
                        <div className="ml-3 mt-1 space-y-1">
                          <div>Form: {analysisResult.arrangement_flow.form || 'N/A'}</div>
                          <div>
                            Timeline Items: {analysisResult.arrangement_flow.timeline?.length || 0}
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
                            {analysisResult.harmonic_context.global_key?.primary_key || 'N/A'}{' '}
                            {analysisResult.harmonic_context.global_key?.mode || ''}
                          </div>
                          <div>
                            Genre:{' '}
                            {analysisResult.harmonic_context.genre_profile?.detected_genre || 'N/A'}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 p-3 bg-muted border border-border rounded-md text-xs text-muted-foreground">
                      <strong>Note:</strong> Navigate to the "Architect" tab to view the full
                      structural analysis and edit the song.
                      {analysisResult?.loadResult?.success && (
                        <div className="mt-2 p-2 bg-green-900/20 border border-green-700/30 rounded text-green-400">
                          {analysisResult.loadResult.count} sections have been loaded into the
                          Architect view. Click "Refresh Blocks" if they don't appear.
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
