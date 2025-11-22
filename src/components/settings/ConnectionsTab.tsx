import React, { useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Save, TestTube } from 'lucide-react';
import useAppIPC from '@/hooks/useAppIPC';

export const ConnectionsTab: React.FC = () => {
  const { settings, loading, updateSetting } = useSettings();
  const { connected } = useAppIPC();
  const [localSettings, setLocalSettings] = useState({
    reaper_port: settings.reaper_port || '9000',
    ableton_port: settings.ableton_port || '9001',
    track_list: settings.track_list || 'DRUMS,BASS,KEYS,VOCALS',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    if (settings) {
      setLocalSettings({
        reaper_port: settings.reaper_port || '9000',
        ableton_port: settings.ableton_port || '9001',
        track_list: settings.track_list || 'DRUMS,BASS,KEYS,VOCALS',
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
      const updates = [
        updateSetting('reaper_port', localSettings.reaper_port),
        updateSetting('ableton_port', localSettings.ableton_port),
        updateSetting('track_list', localSettings.track_list),
      ];

      const results = await Promise.all(updates);
      const failed = results.find((r) => !r.success);

      if (failed) {
        setMessage({ type: 'error', text: failed.error || 'Failed to save settings' });
      } else {
        setMessage({ type: 'success', text: 'Settings saved successfully' });
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

  const validatePort = (port: string): boolean => {
    const portNum = parseInt(port, 10);
    return !isNaN(portNum) && portNum > 0 && portNum <= 65535;
  };

  if (loading) {
    return <div className="text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Connection Settings</h2>
        <p className="text-slate-400 mt-1 text-sm">Configure OSC connections and DAW integration.</p>
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
            <CardTitle>OSC Connection Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Reaper Port
              </label>
              <input
                type="number"
                value={localSettings.reaper_port}
                onChange={(e) => handleChange('reaper_port', e.target.value)}
                min="1"
                max="65535"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {!validatePort(localSettings.reaper_port) && (
                <p className="text-xs text-red-400 mt-1">Invalid port number (1-65535)</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Ableton Port
              </label>
              <input
                type="number"
                value={localSettings.ableton_port}
                onChange={(e) => handleChange('ableton_port', e.target.value)}
                min="1"
                max="65535"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {!validatePort(localSettings.ableton_port) && (
                <p className="text-xs text-red-400 mt-1">Invalid port number (1-65535)</p>
              )}
            </div>

            <div className="pt-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    connected ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm text-slate-400">
                  Status: {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DAW Integration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Track List
              </label>
              <input
                type="text"
                value={localSettings.track_list}
                onChange={(e) => handleChange('track_list', e.target.value)}
                placeholder="DRUMS,BASS,KEYS,VOCALS"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Comma-separated list of track names
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          onClick={handleSave}
          disabled={saving || !validatePort(localSettings.reaper_port) || !validatePort(localSettings.ableton_port)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};

export default ConnectionsTab;

