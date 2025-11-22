import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Play, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { CalibrationDataset } from './CalibrationDataset';

interface CalibrationResult {
  songId: string;
  title: string;
  keyScore: number;
  chordRatio: number;
  segmentRatio: number;
  totalScore: number;
  status: 'success' | 'error';
  error?: string;
}

interface CalibrationSummary {
  avgKeyScore: number;
  avgChordRatio: number;
  avgSegmentRatio: number;
  avgTotalScore: number;
  songsPassed: number;
  songsTotal: number;
}

interface CalibrationComparison {
  baselineScore: number;
  bestScore: number;
  improvement: number;
  bestConfig?: any;
}

export const CalibrationTab: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSong, setCurrentSong] = useState<string>('');
  const [results, setResults] = useState<CalibrationResult[]>([]);
  const [summary, setSummary] = useState<CalibrationSummary | null>(null);
  const [comparison, setComparison] = useState<CalibrationComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleRunCalibration = async () => {
    setIsRunning(true);
    setProgress(0);
    setCurrentSong('');
    setResults([]);
    setSummary(null);
    setError(null);

    let removeListener: (() => void) | null = null;

    try {
      // Listen for progress updates via IPC
      removeListener = window.ipc.on('CALIBRATION:PROGRESS', (data: any) => {
        if (data.progress !== undefined) {
          setProgress(data.progress);
        }
        if (data.currentSong) {
          setCurrentSong(data.currentSong);
        }
        if (data.result) {
          setResults((prev) => [...prev, data.result]);
        }
        if (data.summary) {
          setSummary(data.summary);
        }
        if (data.baselineScore !== undefined && data.bestScore !== undefined) {
          setComparison({
            baselineScore: data.baselineScore,
            bestScore: data.bestScore,
            improvement: data.bestScore - data.baselineScore,
            bestConfig: data.bestConfig,
          });
        }
        if (data.error) {
          setError(data.error);
        }
        if (data.complete) {
          setIsRunning(false);
          if (removeListener) {
            removeListener();
          }
        }
      });

      // Start calibration with selected song IDs
      const result = await window.ipc.invoke('CALIBRATION:RUN', { selectedIds: selectedIds.length > 0 ? selectedIds : null });
      
      if (!result.success) {
        setError(result.error || 'Calibration failed');
        setIsRunning(false);
        if (removeListener) {
          removeListener();
        }
      }
    } catch (err) {
      console.error('Calibration error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
      if (removeListener) {
        removeListener();
      }
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 50) return <CheckCircle className="w-4 h-4 text-green-400" />;
    return <XCircle className="w-4 h-4 text-red-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Calibration</h2>
          <p className="text-slate-400 mt-1 text-sm">
            Select reference songs and run calibration to optimize analysis engine parameters.
          </p>
        </div>
        <Button
          onClick={handleRunCalibration}
          disabled={isRunning || selectedIds.length === 0}
          className="bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run Calibration ({selectedIds.length} songs)
            </>
          )}
        </Button>
      </div>

      {/* Dataset Selection */}
      <CalibrationDataset
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      {error && (
        <Card className="bg-red-900/20 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Error: {error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isRunning && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Progress</span>
                <span className="text-slate-300">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {currentSong && (
                <p className="text-sm text-slate-400">Analyzing: {currentSong}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {comparison && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg">Calibration Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-xs text-slate-500 mb-1">Before Calibration</div>
                  <div className={`text-3xl font-bold ${getScoreColor(comparison.baselineScore)}`}>
                    {comparison.baselineScore.toFixed(1)}%
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-xs text-slate-500 mb-1">After Calibration</div>
                  <div className={`text-3xl font-bold ${getScoreColor(comparison.bestScore)}`}>
                    {comparison.bestScore.toFixed(1)}%
                  </div>
                </div>
              </div>
              {comparison.improvement > 0 && (
                <div className="p-4 rounded-lg bg-green-900/20 border border-green-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <div>
                      <div className="text-sm font-medium text-green-400">
                        Accuracy Improved: +{comparison.improvement.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        New optimized parameters have been saved and will be used for all future analyses.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {comparison.improvement <= 0 && (
                <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="text-sm text-slate-400">
                    Current configuration is already optimal. No changes were made.
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg">Detailed Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">Key Detection</div>
                <div className={`text-2xl font-bold ${getScoreColor(summary.avgKeyScore)}`}>
                  {summary.avgKeyScore.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Chord Accuracy</div>
                <div className={`text-2xl font-bold ${getScoreColor(summary.avgChordRatio * 100)}`}>
                  {(summary.avgChordRatio * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Section Accuracy</div>
                <div className={`text-2xl font-bold ${getScoreColor(summary.avgSegmentRatio * 100)}`}>
                  {(summary.avgSegmentRatio * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Overall Score</div>
                <div className={`text-2xl font-bold ${getScoreColor(summary.avgTotalScore)}`}>
                  {summary.avgTotalScore.toFixed(1)}%
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="text-sm text-slate-400">
                Songs Passed: <span className="text-white font-medium">{summary.songsPassed}</span> /{' '}
                <span className="text-white font-medium">{summary.songsTotal}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg">Song Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((result) => (
                <div
                  key={result.songId}
                  className="p-3 rounded-lg bg-slate-950/50 border border-slate-800"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getScoreIcon(result.totalScore)}
                      <span className="font-medium text-white">{result.title}</span>
                    </div>
                    <span className={`text-lg font-bold ${getScoreColor(result.totalScore)}`}>
                      {result.totalScore.toFixed(1)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Key: </span>
                      <span className={getScoreColor(result.keyScore)}>
                        {result.keyScore.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Chords: </span>
                      <span className={getScoreColor(result.chordRatio * 100)}>
                        {(result.chordRatio * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Sections: </span>
                      <span className={getScoreColor(result.segmentRatio * 100)}>
                        {(result.segmentRatio * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {result.error && (
                    <div className="mt-2 text-xs text-red-400">{result.error}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!isRunning && results.length === 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4">
                Calibration uses 7 reference songs from the test dataset to optimize analysis parameters.
              </p>
              <p className="text-sm text-slate-500">
                Test files are located in: <code className="text-xs bg-slate-800 px-2 py-1 rounded">electron/analysis/test/</code>
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CalibrationTab;

