import React, { useEffect, useState } from 'react';
import StylePreview from '@/components/settings/StylePreview';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { RefreshCcw, Save } from 'lucide-react';
import { DEFAULT_THEME, applyTheme, loadTheme, saveTheme, loadCurrentTheme } from '@/lib/themeUtils';

type SettingItem = {
  key: string;
  label: string;
  desc: string;
  type?: 'color' | 'select';
  options?: string[];
};

const SETTING_GROUPS: Record<string, SettingItem[]> = {
  'Base Colors': [
    { key: '--background', label: 'Background', desc: 'Main page background color', type: 'color' },
    { key: '--foreground', label: 'Foreground', desc: 'Primary text color', type: 'color' },
  ],
  'Text Colors': [
    { key: '--card-foreground', label: 'Card Text', desc: 'Text color on cards', type: 'color' },
    { key: '--popover-foreground', label: 'Dropdown Text', desc: 'Text in dropdowns/selects', type: 'color' },
    { key: '--muted-foreground', label: 'Muted Text', desc: 'Secondary/muted text color', type: 'color' },
    { key: '--primary-foreground', label: 'Primary Text', desc: 'Text on primary buttons', type: 'color' },
    { key: '--secondary-foreground', label: 'Secondary Text', desc: 'Text on secondary elements', type: 'color' },
    { key: '--accent-foreground', label: 'Accent Text', desc: 'Text on accent elements', type: 'color' },
    { key: '--destructive-foreground', label: 'Destructive Text', desc: 'Text on destructive buttons', type: 'color' },
  ],
  'Background Colors': [
    { key: '--card', label: 'Card Background', desc: 'Background for cards', type: 'color' },
    { key: '--popover', label: 'Popover Background', desc: 'Background for popovers/dropdowns', type: 'color' },
    { key: '--muted', label: 'Muted Background', desc: 'Muted/subtle background areas', type: 'color' },
    { key: '--accent', label: 'Accent Background', desc: 'Accent/highlight background', type: 'color' },
    { key: '--secondary', label: 'Secondary Background', desc: 'Secondary element backgrounds', type: 'color' },
  ],
  'Interactive Elements': [
    { key: '--primary', label: 'Primary Button', desc: 'Primary button/action color', type: 'color' },
    { key: '--secondary', label: 'Secondary Button', desc: 'Secondary button color', type: 'color' },
    { key: '--destructive', label: 'Destructive Button', desc: 'Delete/danger button color', type: 'color' },
  ],
  'Borders & Inputs': [
    { key: '--border', label: 'Border Color', desc: 'General border color', type: 'color' },
    { key: '--input', label: 'Input Border', desc: 'Input field border color', type: 'color' },
    { key: '--ring', label: 'Focus Ring', desc: 'Focus/highlight ring color', type: 'color' },
  ],
  'Typography': [
    { key: '--radius', label: 'Border Radius', desc: 'Global rounded corner scale', type: 'select', options: ['0rem', '0.25rem', '0.5rem', '0.75rem', '1rem', '1.25rem', '1.5rem'] },
    { key: '--font-sans', label: 'Sans Font', desc: 'Primary UI font family', type: 'select', options: [
      'Inter', 'Roboto', 'system-ui', 'Open Sans', 'Segoe UI', 
      'Poppins', 'Montserrat', 'Lato', 'Nunito', 'Source Sans Pro',
      'Work Sans', 'DM Sans', 'Manrope', 'Plus Jakarta Sans', 'Outfit',
      'Space Grotesk', 'Figtree', 'Geist Sans', 'SF Pro Display', 'Helvetica Neue'
    ] },
    { key: '--font-mono', label: 'Mono Font', desc: 'Code / metrics font family', type: 'select', options: [
      'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Consolas', 'Menlo',
      'Source Code Pro', 'Cascadia Code', 'Monaco', 'Courier New', 'Inconsolata',
      'Roboto Mono', 'Space Mono', 'Ubuntu Mono', 'Dank Mono', 'Operator Mono',
      'SF Mono', 'Geist Mono', 'Victor Mono', 'Hack', 'Anonymous Pro'
    ] },
    { key: '--font-serif', label: 'Serif Font', desc: 'Serif font for headings/emphasis', type: 'select', options: [
      'Georgia', 'Times New Roman', 'Merriweather', 'Lora', 'Playfair Display',
      'Crimson Text', 'Libre Baskerville', 'PT Serif', 'Source Serif Pro', 'EB Garamond',
      'Cormorant Garamond', 'Bitter', 'Vollkorn', 'Charter', 'system-serif'
    ] },
    { key: '--font-display', label: 'Display Font', desc: 'Decorative font for titles', type: 'select', options: [
      'system-ui', 'Inter', 'Poppins', 'Montserrat', 'Oswald',
      'Bebas Neue', 'Righteous', 'Bungee', 'Fredoka One', 'Comfortaa',
      'Raleway', 'Quicksand', 'Rubik', 'Kanit', 'Archivo Black'
    ] },
  ],
  'Harmony': [
    { key: '--music-tonic', label: 'Tonic (Stable)', desc: 'Background for I chords (Home)', type: 'color' },
    { key: '--music-subdominant', label: 'Subdominant (Moving)', desc: 'Background for ii / IV chords', type: 'color' },
    { key: '--music-dominant', label: 'Dominant (Tension)', desc: 'Background for V / vii° chords', type: 'color' },
    { key: '--music-diminished', label: 'Diminished/Rel', desc: 'Background for dissonant chords', type: 'color' },
  ],
  'Rhythm': [
    { key: '--music-kick', label: 'Kick Drum (Low)', desc: 'Bottom border color for kick events', type: 'color' },
    { key: '--music-snare', label: 'Snare Drum (High)', desc: 'Top border color for snare events', type: 'color' },
  ],
};

export const AppearanceTab: React.FC = () => {
  const [theme, setTheme] = useState<Record<string, string>>(DEFAULT_THEME);

  useEffect(() => {
    // Load saved theme or current CSS values
    const saved = loadTheme();
    if (saved) {
      setTheme({ ...DEFAULT_THEME, ...saved });
      applyTheme({ ...DEFAULT_THEME, ...saved });
    } else {
      // Load current values from DOM
      const current = loadCurrentTheme();
      setTheme(current);
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

  // Helper to check contrast (simple luminance check)
  const getContrastWarning = (bgKey: string, fgKey: string): boolean => {
    const bg = theme[bgKey];
    const fg = theme[fgKey];
    if (!bg || !fg || !bg.startsWith('#') || !fg.startsWith('#')) return false;
    
    // Simple check - if colors are too similar, warn
    const bgNum = parseInt(bg.slice(1), 16);
    const fgNum = parseInt(fg.slice(1), 16);
    const diff = Math.abs(bgNum - fgNum);
    return diff < 0x333333; // If difference is less than ~20% of color space
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Appearance Settings</h2>
          <p className="text-slate-400 mt-1 text-sm">Customize the visual language of your analysis engine.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={handleReset} className="border-slate-700 hover:bg-slate-800">
            <RefreshCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
          <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500 text-white">
            <Save className="w-4 h-4 mr-2" /> Save Changes
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Settings Section - Takes 3 columns */}
        <div className="xl:col-span-3 space-y-4">
          {Object.entries(SETTING_GROUPS).map(([groupName, items]) => (
            <Card key={groupName} className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{groupName}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {items.map((item) => {
                    const value = theme[item.key as keyof typeof theme] || (item.type === 'color' ? '#000000' : '');
                    const isColor = item.type === 'color';
                    const hasValue = value && value !== '#000000' && value !== '';
                    
                    return (
                      <div
                        key={item.key}
                        className="p-2.5 rounded-lg bg-slate-950/30 border border-slate-800/30 hover:bg-slate-950/50 transition-colors"
                      >
                        {/* Label Section */}
                        <div className="mb-2">
                          <label className="block text-sm font-medium text-slate-200 leading-tight mb-0.5">
                            {item.label}
                          </label>
                          <p className="text-xs text-slate-500 line-clamp-2">{item.desc}</p>
                        </div>

                        {/* Control Section */}
                        <div className="flex items-center gap-2">
                          {isColor ? (
                            <>
                              {/* Color Swatch with preview */}
                              <div className="relative shrink-0">
                                <div
                                  className={`w-9 h-9 rounded border-2 shadow cursor-pointer hover:border-slate-500 transition-colors ${
                                    hasValue ? 'border-slate-600' : 'border-red-500 border-dashed'
                                  }`}
                                  style={{ backgroundColor: hasValue ? value : '#333' } as React.CSSProperties}
                                  onClick={() => {
                                    const input = document.getElementById(`color-${item.key}`) as HTMLInputElement;
                                    input?.click();
                                  }}
                                  title={hasValue ? value : 'Not set - click to set color'}
                                />
                                <input
                                  id={`color-${item.key}`}
                                  aria-label={item.label}
                                  type="color"
                                  value={hasValue ? value : '#000000'}
                                  onChange={(e) => handleChange(item.key, e.target.value)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                              </div>
                              {/* Hex Input */}
                              <input
                                type="text"
                                value={value || '#000000'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val.match(/^#[0-9A-Fa-f]{0,6}$/)) {
                                    handleChange(item.key, val);
                                  }
                                }}
                                className="flex-1 font-mono text-xs bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="#000000"
                              />
                            </>
                          ) : (
                            <select
                              value={value || ''}
                              onChange={(e) => handleChange(item.key, e.target.value)}
                              className="w-full text-sm bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              {item.options?.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Preview Section - Takes 1 column */}
        <div className="xl:col-span-1">
          <StylePreview />
        </div>
      </div>
    </div>
  );
};

export default AppearanceTab;
