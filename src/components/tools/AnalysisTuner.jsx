import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Button from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import KeySelector from '@/components/tools/KeySelector';

const DEFAULTS = {
  transitionProb: 0.8,
  diatonicBonus: 0.1,
  rootPeakBias: 0.1,
  temperature: 0.1,
  windowShift: 0, // Window shift in seconds (-0.05 to +0.05)
  bassWeight: 0, // Bass weight for inversion detection (0-1)
  // V1 fallback kernel
  noveltyKernel: 5,
  // V2 parameters
  detailLevel: 0.5, // 0..1 -> phrase vs movement emphasis
  adaptiveSensitivity: 1.5, // MAD multiplier for peaks
  mfccWeight: 0.5, // timbre separation weight
};

export default function AnalysisTuner({ fileHash, onUpdate = () => {} }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');

  // Load Analysis Lab settings from DB on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (window.electronAPI && window.electronAPI.invoke) {
          const result = await window.electronAPI.invoke('DB:GET_SETTINGS');
          if (result?.success && result.settings) {
            const dbSettings = result.settings;
            setSettings({
              transitionProb: parseFloat(dbSettings.analysis_transitionProb) || DEFAULTS.transitionProb,
              diatonicBonus: parseFloat(dbSettings.analysis_diatonicBonus) || DEFAULTS.diatonicBonus,
              rootPeakBias: parseFloat(dbSettings.analysis_rootPeakBias) || DEFAULTS.rootPeakBias,
              temperature: parseFloat(dbSettings.analysis_temperature) || DEFAULTS.temperature,
              noveltyKernel: parseInt(dbSettings.analysis_noveltyKernel) || DEFAULTS.noveltyKernel,
              detailLevel: parseFloat(dbSettings.analysis_detailLevel) || DEFAULTS.detailLevel,
              adaptiveSensitivity: parseFloat(dbSettings.analysis_adaptiveSensitivity) || DEFAULTS.adaptiveSensitivity,
              mfccWeight: parseFloat(dbSettings.analysis_mfccWeight) || DEFAULTS.mfccWeight,
            });
            if (dbSettings.analysis_globalKey) {
              setSelectedKey(dbSettings.analysis_globalKey);
            }
            console.log('✅ Loaded Analysis Lab settings from database');
          }
        }
      } catch (err) {
        console.warn('Failed to load Analysis Lab settings from DB:', err);
      }
    };
    loadSettings();
  }, []);

  const handleChordUpdate = async (newSettings) => {
    const merged = { ...settings, ...newSettings, globalKey: selectedKey };
    setSettings(merged);
    setLoading(true);
    try {
      await globalThis.electron.recalcChords({ fileHash, options: { ...merged, commit: false } });
      onUpdate();
    } catch (err) {
      console.error('recalc preview failed', err);
    } finally {
      setLoading(false);
    }
  };

  const applyHarmonyCommit = async () => {
    setLoading(true);
    try {
      await globalThis.electron.recalcChords({
        fileHash,
        options: { ...settings, globalKey: selectedKey, commit: true },
      });
      // Save Analysis Lab settings to DB for future analyses
      await saveAnalysisLabSettings({ ...settings, globalKey: selectedKey });
      onUpdate();
    } catch (err) {
      console.error('commit failed', err);
    } finally {
      setLoading(false);
    }
  };

  // Save Analysis Lab settings to database
  const saveAnalysisLabSettings = async (opts) => {
    try {
      if (window.electronAPI && window.electronAPI.invoke) {
        // Save harmony parameters
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_transitionProb', value: String(opts.transitionProb ?? 0.8) });
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_diatonicBonus', value: String(opts.diatonicBonus ?? 0.1) });
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_rootPeakBias', value: String(opts.rootPeakBias ?? 0.1) });
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_temperature', value: String(opts.temperature ?? 0.1) });
        if (opts.globalKey) {
          await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_globalKey', value: opts.globalKey });
        }
        // Save structure parameters
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_noveltyKernel', value: String(opts.noveltyKernel ?? 5) });
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_sensitivity', value: String(opts.sensitivity ?? 0.6) });
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_mergeChromaThreshold', value: String(opts.mergeChromaThreshold ?? 0.92) });
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_minSectionDurationSec', value: String(opts.minSectionDurationSec ?? 8.0) });
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_forceOverSeg', value: String(opts.forceOverSeg ?? false) });
        // Save V2 parameters
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_detailLevel', value: String(opts.detailLevel ?? 0.5) });
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_adaptiveSensitivity', value: String(opts.adaptiveSensitivity ?? 1.5) });
        await window.electronAPI.invoke('DB:SET_SETTING', { key: 'analysis_mfccWeight', value: String(opts.mfccWeight ?? 0.5) });
        console.log('✅ Analysis Lab settings saved to database');
      }
    } catch (err) {
      console.error('Failed to save Analysis Lab settings:', err);
    }
  };

  const transformGrid = async (operation, value = 0, commit = false) => {
    try {
      await globalThis.electron.transformGrid({ fileHash, operation, value, commit });
      onUpdate();
    } catch (err) {
      console.error('transformGrid failed', err);
    }
  };

  return (
    <div className="p-2 rounded bg-slate-900 text-slate-200 border border-slate-800 w-full max-w-full">
      <Tabs defaultValue="harmony" className="w-full">
        <div className="border-b border-slate-800 p-2">
          <TabsList className="grid grid-cols-3 w-full gap-1">
            <TabsTrigger value="harmony" className="text-xs px-2 py-1">Harmony</TabsTrigger>
            <TabsTrigger value="structure" className="text-xs px-2 py-1">Structure</TabsTrigger>
            <TabsTrigger value="rhythm" className="text-xs px-2 py-1">Rhythm</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="harmony" className="p-2 space-y-2">
          <div className="space-y-1">
            <label className="text-xs" htmlFor="tuner-key-select">Key</label>
            <KeySelector value={selectedKey} onChange={(k) => setSelectedKey(k)} />
          </div>
          <Control
            label="Chord Stability"
            value={settings.transitionProb}
            min={0.5}
            max={0.99}
            step={0.01}
            desc="Low = Jazz/Fast Changes. High = Pop/Sustained."
            onChange={(v) => handleChordUpdate({ transitionProb: v })}
          />
          <Control
            label="Key Adherence"
            value={settings.diatonicBonus}
            min={0}
            max={0.5}
            step={0.05}
            desc="How strictly it follows detected key"
            onChange={(v) => handleChordUpdate({ diatonicBonus: v })}
          />
          <Control
            label="Bass Sensitivity"
            value={settings.rootPeakBias}
            min={0}
            max={0.5}
            step={0.05}
            desc="Higher if inversions appear as root mistakes"
            onChange={(v) => handleChordUpdate({ rootPeakBias: v })}
          />
          <div className="pt-1">
            <Button onClick={applyHarmonyCommit} className="w-full text-xs py-1.5 bg-blue-600" disabled={loading}>
              Apply Harmony Changes
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="structure" className="p-2 space-y-3">
          <SliderBlock
            label="Detail Level"
            value={settings.detailLevel}
            desc="Left=Big Blocks, Right=Fine Detail"
            onChange={(v) => setSettings((s) => ({ ...s, detailLevel: v }))}
          />
          <SliderBlock
            label="Transition Strength"
            value={settings.adaptiveSensitivity}
            min={0.8}
            max={2.2}
            step={0.05}
            desc="Higher = Only strongest spikes become cuts"
            onChange={(v) => setSettings((s) => ({ ...s, adaptiveSensitivity: v }))}
          />
          <SliderBlock
            label="Timbre Separation"
            value={settings.mfccWeight}
            min={0}
            max={1}
            step={0.05}
            desc="Higher = Groove / Timbre changes drive splits"
            onChange={(v) => setSettings((s) => ({ ...s, mfccWeight: v }))}
          />
          <div className="space-y-2 pt-2">
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const scaleWeights = computeScaleWeights(settings.detailLevel);
                    await globalThis.electronAPI.invoke('ANALYSIS:RESEGMENT', {
                      fileHash,
                      options: {
                        version: 'v2',
                        adaptiveSensitivity: settings.adaptiveSensitivity,
                        mfccWeight: settings.mfccWeight,
                        scaleWeights,
                        forceOverSeg: false,
                      },
                      commit: false,
                    });
                    onUpdate();
                  } catch (err) {
                    console.error(err);
                  }
                  setLoading(false);
                }}
                className="w-full text-xs py-1.5"
              >Preview Structure (V2)</Button>
              <Button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const scaleWeights = computeScaleWeights(settings.detailLevel);
                    await globalThis.electronAPI.invoke('ANALYSIS:RESEGMENT', {
                      fileHash,
                      options: {
                        version: 'v2',
                        adaptiveSensitivity: settings.adaptiveSensitivity,
                        mfccWeight: settings.mfccWeight,
                        scaleWeights,
                        forceOverSeg: false,
                      },
                      commit: true,
                    });
                    // Save structure settings to DB for future analyses
                    await saveAnalysisLabSettings(settings);
                    onUpdate();
                  } catch (err) {
                    console.error(err);
                  }
                  setLoading(false);
                }}
                className="w-full text-xs py-1.5 bg-blue-600"
                disabled={loading}
              >Commit Structure</Button>
            </div>
            <div className="text-[10px] text-slate-400">Uses Architect V2 multi-scale novelty + adaptive peaks</div>
          </div>
        </TabsContent>

        <TabsContent value="rhythm" className="p-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => transformGrid('half_time', 0, false)} className="text-xs py-1.5">½ Half Time</Button>
            <Button variant="outline" onClick={() => transformGrid('double_time', 0, false)} className="text-xs py-1.5">2x Double Time</Button>
          </div>
          <div className="pt-1">
            <label className="text-xs font-bold text-slate-400" htmlFor="grid-offset">Grid Offset (ms)</label>
            <div className="flex gap-1 mt-1">
              <Button size="sm" variant="ghost" onClick={() => transformGrid('shift', -0.01, false)} className="text-xs flex-1">-10ms</Button>
              <Button size="sm" variant="ghost" onClick={() => transformGrid('shift', 0.01, false)} className="text-xs flex-1">+10ms</Button>
            </div>
          </div>
          <div className="pt-1">
            <label className="text-xs font-bold text-slate-400" htmlFor="set-bpm">Set BPM</label>
            <input type="number" min="20" max="300" className="px-2 py-1 mt-1 w-full bg-slate-800 text-white rounded text-xs" onBlur={(e) => transformGrid('set_bpm', Number(e.target.value), false)} />
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
