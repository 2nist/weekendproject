import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import Button from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import KeySelector from '@/components/tools/KeySelector';
import { Loader2, CheckCircle2 } from 'lucide-react';

const DEFAULTS = {
  transitionProb: 0.8,
  diatonicBonus: 0.1,
  rootPeakBias: 0.1,
  temperature: 0.1,
  // V1 fallback kernel
  noveltyKernel: 5,
  // V2 parameters
  detailLevel: 0.5, // 0..1 -> phrase vs movement emphasis
  adaptiveSensitivity: 1.5, // MAD multiplier for peaks
  mfccWeight: 0.5, // timbre separation weight
};

export default function AnalysisTuner({ fileHash, onUpdate = () => {} }) {
  // Local settings state - updates instantly on slider move
  const [localSettings, setLocalSettings] = useState(DEFAULTS);
  const [selectedKey, setSelectedKey] = useState('');
  
  // Loading states
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [previewSuccess, setPreviewSuccess] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(false);

  // Handle slider change - visual only, fast update
  const handleSliderChange = useCallback((key, value) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    // Clear success indicators when settings change
    setPreviewSuccess(false);
    setCommitSuccess(false);
  }, []);

  // Handle Preview Click (Backend - Slow)
  const handlePreview = useCallback(async () => {
    if (!fileHash) {
      console.error('[AnalysisTuner] No fileHash provided');
      return;
    }

    setLoadingPreview(true);
    setPreviewSuccess(false);
    
    try {
      console.log('[AnalysisTuner] Preview - Calling ANALYSIS:RESEGMENT with:', {
        fileHash,
        options: localSettings,
        commit: false,
      });

      const ipcAPI = globalThis?.electronAPI?.invoke || globalThis?.electron?.resegment || globalThis?.ipc?.invoke;
      
      if (!ipcAPI) {
        throw new Error('IPC API not available');
      }

      const result = await ipcAPI('ANALYSIS:RESEGMENT', {
        fileHash,
        options: {
          ...localSettings,
          globalKey: selectedKey,
        },
        commit: false,
      });

      console.log('[AnalysisTuner] Preview result:', result);

      if (result?.success) {
        setPreviewSuccess(true);
        onUpdate();
        // Clear success indicator after 2 seconds
        setTimeout(() => setPreviewSuccess(false), 2000);
      } else {
        throw new Error(result?.error || 'Preview failed');
      }
    } catch (err) {
      console.error('[AnalysisTuner] Preview error:', err);
      alert(`Preview failed: ${err.message || err}`);
    } finally {
      setLoadingPreview(false);
    }
  }, [fileHash, localSettings, selectedKey, onUpdate]);

  // Handle Commit Click (Backend - Slow, saves to DB)
  const handleCommit = useCallback(async () => {
    if (!fileHash) {
      console.error('[AnalysisTuner] No fileHash provided');
      return;
    }

    setLoadingCommit(true);
    setCommitSuccess(false);
    
    try {
      console.log('[AnalysisTuner] Commit - Calling ANALYSIS:RESEGMENT with:', {
        fileHash,
        options: localSettings,
        commit: true,
      });

      const ipcAPI = globalThis?.electronAPI?.invoke || globalThis?.electron?.resegment || globalThis?.ipc?.invoke;
      
      if (!ipcAPI) {
        throw new Error('IPC API not available');
      }

      const result = await ipcAPI('ANALYSIS:RESEGMENT', {
        fileHash,
        options: {
          ...localSettings,
          globalKey: selectedKey,
        },
        commit: true,
      });

      console.log('[AnalysisTuner] Commit result:', result);

      if (result?.success) {
        setCommitSuccess(true);
        onUpdate();
        // Clear success indicator after 3 seconds
        setTimeout(() => setCommitSuccess(false), 3000);
      } else {
        throw new Error(result?.error || 'Commit failed');
      }
    } catch (err) {
      console.error('[AnalysisTuner] Commit error:', err);
      alert(`Commit failed: ${err.message || err}`);
    } finally {
      setLoadingCommit(false);
    }
  }, [fileHash, localSettings, selectedKey, onUpdate]);

  // Handle Harmony Preview (chord recalculation)
  const handleHarmonyPreview = useCallback(async () => {
    if (!fileHash) {
      console.error('[AnalysisTuner] No fileHash provided');
      return;
    }

    setLoadingPreview(true);
    setPreviewSuccess(false);
    
    try {
      const ipcAPI = globalThis?.electron?.recalcChords || globalThis?.electronAPI?.invoke;
      
      if (!ipcAPI) {
        throw new Error('IPC API not available');
      }

      const result = await ipcAPI('ANALYSIS:RECALC_CHORDS', {
        fileHash,
        options: {
          ...localSettings,
          globalKey: selectedKey,
          commit: false,
        },
      });

      if (result?.success) {
        setPreviewSuccess(true);
        onUpdate();
        setTimeout(() => setPreviewSuccess(false), 2000);
      } else {
        throw new Error(result?.error || 'Harmony preview failed');
      }
    } catch (err) {
      console.error('[AnalysisTuner] Harmony preview error:', err);
      alert(`Harmony preview failed: ${err.message || err}`);
    } finally {
      setLoadingPreview(false);
    }
  }, [fileHash, localSettings, selectedKey, onUpdate]);

  // Handle Harmony Commit
  const handleHarmonyCommit = useCallback(async () => {
    if (!fileHash) {
      console.error('[AnalysisTuner] No fileHash provided');
      return;
    }

    setLoadingCommit(true);
    setCommitSuccess(false);
    
    try {
      const ipcAPI = globalThis?.electron?.recalcChords || globalThis?.electronAPI?.invoke;
      
      if (!ipcAPI) {
        throw new Error('IPC API not available');
      }

      const result = await ipcAPI('ANALYSIS:RECALC_CHORDS', {
        fileHash,
        options: {
          ...localSettings,
          globalKey: selectedKey,
          commit: true,
        },
      });

      if (result?.success) {
        setCommitSuccess(true);
        onUpdate();
        setTimeout(() => setCommitSuccess(false), 3000);
      } else {
        throw new Error(result?.error || 'Harmony commit failed');
      }
    } catch (err) {
      console.error('[AnalysisTuner] Harmony commit error:', err);
      alert(`Harmony commit failed: ${err.message || err}`);
    } finally {
      setLoadingCommit(false);
    }
  }, [fileHash, localSettings, selectedKey, onUpdate]);

  // Handle structure slider change (updates local state only)
  const handleStructureSliderChange = useCallback((key, value) => {
    handleSliderChange(key, value);
  }, [handleSliderChange]);

  // Handle Preview Structure (V2)
  const handlePreviewStructure = useCallback(async () => {
    if (!fileHash) {
      console.error('[AnalysisTuner] No fileHash provided');
      return;
    }

    setLoadingPreview(true);
    setPreviewSuccess(false);
    
    try {
      const scaleWeights = computeScaleWeights(localSettings.detailLevel);
      const ipcAPI = globalThis?.electronAPI?.invoke || globalThis?.electron?.resegment || globalThis?.ipc?.invoke;
      
      if (!ipcAPI) {
        throw new Error('IPC API not available');
      }

      const result = await ipcAPI('ANALYSIS:RESEGMENT', {
        fileHash,
        options: {
          version: 'v2',
          adaptiveSensitivity: localSettings.adaptiveSensitivity,
          mfccWeight: localSettings.mfccWeight,
          scaleWeights,
          forceOverSeg: false,
        },
        commit: false,
      });

      if (result?.success) {
        setPreviewSuccess(true);
        onUpdate();
        setTimeout(() => setPreviewSuccess(false), 2000);
      } else {
        throw new Error(result?.error || 'Structure preview failed');
      }
    } catch (err) {
      console.error('[AnalysisTuner] Structure preview error:', err);
      alert(`Structure preview failed: ${err.message || err}`);
    } finally {
      setLoadingPreview(false);
    }
  }, [fileHash, localSettings, onUpdate]);

  // Handle Commit Structure
  const handleCommitStructure = useCallback(async () => {
    if (!fileHash) {
      console.error('[AnalysisTuner] No fileHash provided');
      return;
    }

    setLoadingCommit(true);
    setCommitSuccess(false);
    
    try {
      const scaleWeights = computeScaleWeights(localSettings.detailLevel);
      const ipcAPI = globalThis?.electronAPI?.invoke || globalThis?.electron?.resegment || globalThis?.ipc?.invoke;
      
      if (!ipcAPI) {
        throw new Error('IPC API not available');
      }

      const result = await ipcAPI('ANALYSIS:RESEGMENT', {
        fileHash,
        options: {
          version: 'v2',
          adaptiveSensitivity: localSettings.adaptiveSensitivity,
          mfccWeight: localSettings.mfccWeight,
          scaleWeights,
          forceOverSeg: false,
        },
        commit: true,
      });

      if (result?.success) {
        setCommitSuccess(true);
        onUpdate();
        setTimeout(() => setCommitSuccess(false), 3000);
      } else {
        throw new Error(result?.error || 'Structure commit failed');
      }
    } catch (err) {
      console.error('[AnalysisTuner] Structure commit error:', err);
      alert(`Structure commit failed: ${err.message || err}`);
    } finally {
      setLoadingCommit(false);
    }
  }, [fileHash, localSettings, onUpdate]);

  // Transform grid operations
  const transformGrid = useCallback(async (operation, value = 0, commit = false) => {
    try {
      const ipcAPI = globalThis?.electron?.transformGrid || globalThis?.electronAPI?.invoke;
      if (ipcAPI) {
        await ipcAPI('ANALYSIS:TRANSFORM_GRID', { fileHash, operation, value, commit });
        onUpdate();
      }
    } catch (err) {
      console.error('[AnalysisTuner] transformGrid failed:', err);
    }
  }, [fileHash, onUpdate]);

  return (
    <div className="p-2 rounded bg-slate-900 text-slate-200 border border-slate-800 w-full">
      <Tabs defaultValue="harmony" className="w-full">
        <div className="border-b border-slate-800 p-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="harmony">Harmony</TabsTrigger>
            <TabsTrigger value="structure">Structure</TabsTrigger>
            <TabsTrigger value="rhythm">Rhythm</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="harmony" className="p-3 space-y-3">
          <div className="space-y-2">
            <label className="text-xs" htmlFor="tuner-key-select">Key</label>
            <KeySelector value={selectedKey} onChange={(k) => setSelectedKey(k)} />
          </div>
          <Control
            label="Chord Stability"
            value={localSettings.transitionProb}
            min={0.5}
            max={0.99}
            step={0.01}
            desc="Low = Jazz/Fast Changes. High = Pop/Sustained."
            onChange={(v) => handleSliderChange('transitionProb', v)}
          />
          <Control
            label="Key Adherence"
            value={localSettings.diatonicBonus}
            min={0}
            max={0.5}
            step={0.05}
            desc="How strictly it follows detected key"
            onChange={(v) => handleSliderChange('diatonicBonus', v)}
          />
          <Control
            label="Bass Sensitivity"
            value={localSettings.rootPeakBias}
            min={0}
            max={0.5}
            step={0.05}
            desc="Higher if inversions appear as root mistakes"
            onChange={(v) => handleSliderChange('rootPeakBias', v)}
          />
          <div className="pt-2 space-y-2">
            <Button
              onClick={handleHarmonyPreview}
              className="w-full bg-blue-500 hover:bg-blue-600"
              disabled={loadingPreview || loadingCommit || !fileHash}
            >
              {loadingPreview ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Processing...
                </>
              ) : previewSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 inline text-green-400" />
                  Preview Applied
                </>
              ) : (
                'Preview Harmony'
              )}
            </Button>
            <Button
              onClick={handleHarmonyCommit}
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={loadingPreview || loadingCommit || !fileHash}
            >
              {loadingCommit ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Saving...
                </>
              ) : commitSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 inline text-green-400" />
                  Saved
                </>
              ) : (
                'Apply Harmony Changes'
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="structure" className="p-3 space-y-4">
          <SliderBlock
            label="Detail Level"
            value={localSettings.detailLevel}
            desc="Left=Big Blocks, Right=Fine Detail"
            onChange={(v) => handleStructureSliderChange('detailLevel', v)}
          />
          <SliderBlock
            label="Transition Strength"
            value={localSettings.adaptiveSensitivity}
            min={0.8}
            max={2.2}
            step={0.05}
            desc="Higher = Only strongest spikes become cuts"
            onChange={(v) => handleStructureSliderChange('adaptiveSensitivity', v)}
          />
          <SliderBlock
            label="Timbre Separation"
            value={localSettings.mfccWeight}
            min={0}
            max={1}
            step={0.05}
            desc="Higher = Groove / Timbre changes drive splits"
            onChange={(v) => handleStructureSliderChange('mfccWeight', v)}
          />
          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePreviewStructure}
                disabled={loadingPreview || loadingCommit || !fileHash}
                className="flex-1"
              >
                {loadingPreview ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                    Processing...
                  </>
                ) : previewSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2 inline text-green-400" />
                    Preview Applied
                  </>
                ) : (
                  'Preview Structure (V2)'
                )}
              </Button>
              <Button
                onClick={handleCommitStructure}
                disabled={loadingPreview || loadingCommit || !fileHash}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {loadingCommit ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                    Saving...
                  </>
                ) : commitSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2 inline text-green-400" />
                    Saved
                  </>
                ) : (
                  'Commit Structure'
                )}
              </Button>
            </div>
            <div className="text-[10px] text-slate-400">Uses Architect V2 multi-scale novelty + adaptive peaks</div>
          </div>
        </TabsContent>

        <TabsContent value="rhythm" className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => transformGrid('half_time', 0, false)}>½ Half Time</Button>
            <Button variant="outline" onClick={() => transformGrid('double_time', 0, false)}>2x Double Time</Button>
          </div>
          <div className="pt-2">
            <label className="text-xs font-bold text-slate-400" htmlFor="grid-offset">Grid Offset (ms)</label>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => transformGrid('shift', -0.01, false)}>-10ms</Button>
              <Button size="sm" variant="ghost" onClick={() => transformGrid('shift', 0.01, false)}>+10ms</Button>
            </div>
          </div>
          <div className="pt-2">
            <label className="text-xs font-bold text-slate-400" htmlFor="set-bpm">Set BPM</label>
            <input
              type="number"
              min="20"
              max="300"
              className="px-2 py-1 w-full bg-slate-800 text-white rounded"
              onBlur={(e) => transformGrid('set_bpm', Number(e.target.value), false)}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Control({ label, value, min, max, step, desc, onChange }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-slate-400 font-mono">{Number(value).toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <p className="text-[10px] text-slate-400">{desc}</p>
    </div>
  );
}

Control.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  desc: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

function SliderBlock({ label, value, min = 0, max = 1, step = 0.01, desc, onChange }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-slate-400 font-mono">{Number(value).toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <p className="text-[10px] text-slate-400">{desc}</p>
    </div>
  );
}

SliderBlock.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  desc: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

AnalysisTuner.propTypes = {
  fileHash: PropTypes.string,
  onUpdate: PropTypes.func,
};

function computeScaleWeights(detailLevel) {
  // detailLevel 0 => movement emphasis, detailLevel 1 => phrase emphasis
  const phrase = detailLevel;
  const section = 0.2; // fixed middle scale contribution for context
  let movement = 1 - phrase - section;
  if (movement < 0) movement = 0.05;
  const sum = phrase + section + movement || 1;
  return {
    phrase: phrase / sum,
    section: section / sum,
    movement: movement / sum,
  };
}
