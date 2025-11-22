import React, { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CheckSquare, Square, User } from 'lucide-react';

interface Benchmark {
  id: string;
  title: string;
  filename: string;
  genre?: string;
  isUserAdded: boolean;
  weight: number;
  referenceKey: string;
}

interface CalibrationDatasetProps {
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
}

export const CalibrationDataset: React.FC<CalibrationDatasetProps> = ({
  selectedIds,
  onSelectionChange,
}) => {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBenchmarks();
  }, []);

  const loadBenchmarks = async () => {
    try {
      setLoading(true);
      console.log('[CalibrationDataset] Requesting benchmarks...');
      const result = await window.electronAPI?.invoke('CALIBRATION:GET_BENCHMARKS');
      console.log('[CalibrationDataset] Received result:', result);
      if (result?.success && result.benchmarks) {
        console.log('[CalibrationDataset] Found', result.benchmarks.length, 'benchmarks');
        setBenchmarks(result.benchmarks);
        // Auto-select all if nothing selected
        if (selectedIds.length === 0 && result.benchmarks.length > 0) {
          onSelectionChange(result.benchmarks.map((b: Benchmark) => b.id));
        }
      } else {
        console.warn('[CalibrationDataset] No benchmarks found or error:', result);
      }
    } catch (error) {
      console.error('[CalibrationDataset] Failed to load benchmarks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    onSelectionChange(benchmarks.map(b => b.id));
  };

  const handleSelectNone = () => {
    onSelectionChange([]);
  };

  const baseSongs = benchmarks.filter(b => !b.isUserAdded);
  const userSongs = benchmarks.filter(b => b.isUserAdded);

  if (loading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="pt-6">
          <div className="text-center py-4 text-slate-400">Loading benchmarks...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Calibration Dataset</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="text-xs"
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectNone}
              className="text-xs"
            >
              <Square className="w-3 h-3 mr-1" />
              Select None
            </Button>
          </div>
        </div>
        <p className="text-sm text-slate-400 mt-2">
          Choose which reference songs to use for calibration. Selected: {selectedIds.length} / {benchmarks.length}
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {/* Base Songs */}
            {baseSongs.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-2">Reference Songs</h4>
                <div className="space-y-2">
                  {baseSongs.map((benchmark) => (
                    <div
                      key={benchmark.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer"
                      onClick={() => handleToggle(benchmark.id)}
                    >
                      <Checkbox
                        checked={selectedIds.includes(benchmark.id)}
                        onCheckedChange={() => handleToggle(benchmark.id)}
                        className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{benchmark.title}</span>
                          {benchmark.weight > 1.0 && (
                            <span className="text-xs px-1.5 py-0.5 bg-cyan-900/30 text-cyan-400 rounded">
                              {benchmark.weight}x
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {benchmark.filename} • {benchmark.referenceKey}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User-Added Songs */}
            {userSongs.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-cyan-400" />
                  Your Corrections (2x Weight)
                </h4>
                <div className="space-y-2">
                  {userSongs.map((benchmark) => (
                    <div
                      key={benchmark.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer border border-cyan-800/30 bg-cyan-900/10"
                      onClick={() => handleToggle(benchmark.id)}
                    >
                      <Checkbox
                        checked={selectedIds.includes(benchmark.id)}
                        onCheckedChange={() => handleToggle(benchmark.id)}
                        className="data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{benchmark.title}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-cyan-900/50 text-cyan-300 rounded font-semibold">
                            2.0x
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {benchmark.filename} • {benchmark.referenceKey}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {benchmarks.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <p>No benchmarks found.</p>
                <p className="text-xs mt-2">Add songs to the test directory or promote corrections from Sandbox.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default CalibrationDataset;

