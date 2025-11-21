import React, { useEffect, useState } from 'react';
import StylePreview from '@/components/settings/StylePreview';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { RefreshCcw, Save } from 'lucide-react';
import { DEFAULT_THEME, applyTheme, loadTheme, saveTheme } from '@/lib/themeUtils';

const SETTING_GROUPS = {
  rhythm: [
    { key: '--music-kick', label: 'Kick Drum (Low)', desc: 'Bottom border color for kick events' },
    { key: '--music-snare', label: 'Snare Drum (High)', desc: 'Top border color for snare events' },
  ],
  harmony: [
    { key: '--music-tonic', label: 'Tonic (Stable)', desc: 'Background for I chords (Home)' },
    { key: '--music-subdominant', label: 'Subdominant (Moving)', desc: 'Background for ii / IV chords' },
    { key: '--music-dominant', label: 'Dominant (Tension)', desc: 'Background for V / vii° chords' },
    { key: '--music-diminished', label: 'Diminished/Rel', desc: 'Background for dissonant chords' },
  ],
};

export const SettingsView: React.FC = () => {
  const [theme, setTheme] = useState<Record<string, string>>(DEFAULT_THEME);

  useEffect(() => {
    const saved = loadTheme();
    if (saved) {
      setTheme({ ...DEFAULT_THEME, ...saved });
      applyTheme({ ...DEFAULT_THEME, ...saved });
    } else {
      applyTheme(DEFAULT_THEME);
    }
  }, []);

  const handleChange = (key: string, val: string) => {
    const updated = { ...theme, [key]: val };
    setTheme(updated);
    applyTheme(updated);
  };

  const handleSave = () => {
    saveTheme(theme);
  };

  const handleReset = () => {
    setTheme(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
    saveTheme(DEFAULT_THEME);
  };

  return (
    <div className="p-8 min-h-screen bg-slate-950 text-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-7 space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-white">Studio Appearance</h1>
            <p className="text-slate-400 mt-2">Customize the visual language of your analysis engine.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset} className="border-slate-700 hover:bg-slate-800">
              <RefreshCcw className="w-4 h-4 mr-2" /> Reset
            </Button>
            <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500 text-white">
              <Save className="w-4 h-4 mr-2" /> Save Changes
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {Object.entries(SETTING_GROUPS).map(([groupName, items]) => (
            <Card key={groupName}>
              <CardHeader>
                <CardTitle>{groupName.charAt(0).toUpperCase() + groupName.slice(1)}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {items.map((item) => (
                  <div key={item.key} className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/30 border border-slate-800/50">
                    <div className="relative group">
                      <div
                        className="w-12 h-12 rounded-lg border-2 border-slate-700 shadow-lg"
                        style={{ backgroundColor: theme[item.key as keyof typeof theme] }}
                      />
                      <input
                        aria-label={item.label}
                        type="color"
                        value={theme[item.key as keyof typeof theme]}
                        onChange={(e) => handleChange(item.key, e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-medium text-slate-200">{item.label}</div>
                      <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                    </div>
                    <div className="w-24">
                      <input
                        aria-label={`${item.label} hex`}
                        value={theme[item.key as keyof typeof theme]}
                        onChange={(e) => handleChange(item.key, e.target.value)}
                        className="font-mono text-xs bg-slate-950 border-slate-800 text-center uppercase w-full"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="lg:col-span-5">
        <StylePreview />
      </div>
    </div>
  );
};

export default SettingsView;
