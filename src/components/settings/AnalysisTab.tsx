import React, { useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Save } from 'lucide-react';

export const AnalysisTab: React.FC = () => {
  const { settings, loading, updateSetting } = useSettings();
  const [localSettings, setLocalSettings] = useState({
    default_bpm: settings.default_bpm || '120',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    if (settings) {
      setLocalSettings({
        default_bpm: settings.default_bpm || '120',
      });
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const result = await updateSetting('default_bpm', localSettings.default_bpm);
      if (result.success) {
        setMessage({ type: 'success', text: 'Settings saved successfully' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const validateBPM = (bpm: string): boolean => {
    const bpmNum = parseInt(bpm, 10);
    return !isNaN(bpmNum) && bpmNum > 0 && bpmNum <= 300;
  };

  if (loading) {
    return <div className="text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Analysis Settings</h2>
        <p className="text-slate-400 mt-1 text-sm">Configure default analysis parameters and preferences.</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-900/20 border-green-700 text-green-400'
              : 'bg-red-900/20 border-red-700 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Default Parameters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Default BPM
              </label>
              <input
                type="number"
                value={localSettings.default_bpm}
                onChange={(e) => handleChange('default_bpm', e.target.value)}
                min="1"
                max="300"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {!validateBPM(localSettings.default_bpm) && (
                <p className="text-xs text-red-400 mt-1">Invalid BPM (1-300)</p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Default tempo used for analysis when not detected from audio
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analysis Engine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-400">
              <p>Additional analysis engine settings will be available here in future updates.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          onClick={handleSave}
          disabled={saving || !validateBPM(localSettings.default_bpm)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};

export default AnalysisTab;

