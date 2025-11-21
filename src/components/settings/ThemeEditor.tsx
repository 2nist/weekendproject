import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { hexToTailwindHsl } from '@/lib/colorUtils';
import { RefreshCcw, Save } from 'lucide-react';

// Token definitions
const THEME_TOKENS = [
  {
    section: 'Rhythm',
    items: [
      { label: 'Kick Drum', cssVar: '--music-kick', default: '#06b6d4' },
      { label: 'Snare Drum', cssVar: '--music-snare', default: '#d946ef' },
    ],
  },
  {
    section: 'Harmony',
    items: [
      { label: 'Tonic (Stable)', cssVar: '--music-tonic', default: '#1e3a8a' },
      {
        label: 'Dominant (Tension)',
        cssVar: '--music-dominant',
        default: '#7f1d1d',
      },
      {
        label: 'Subdominant (Flow)',
        cssVar: '--music-subdominant',
        default: '#064e3b',
      },
      {
        label: 'Diminished (Clash)',
        cssVar: '--music-diminished',
        default: '#581c87',
      },
    ],
  },
];

export const ThemeEditor: React.FC = () => {
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    THEME_TOKENS.forEach((group) => {
      group.items.forEach((token) => {
        initial[token.cssVar] = token.default;
        updateCssVar(token.cssVar, token.default);
      });
    });
    setColors(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCssVar = (variable: string, hex: string) => {
    const hsl = hexToTailwindHsl(hex);
    // We expect HSL in form "217 91% 60%" and Tailwind uses HSL without alpha by default
    document.documentElement.style.setProperty(variable, hsl);
  };

  const handleColorChange = (cssVar: string, hex: string) => {
    setColors((prev) => ({ ...prev, [cssVar]: hex }));
    updateCssVar(cssVar, hex);
  };

  const resetToDefaults = () => {
    THEME_TOKENS.forEach((group) => {
      group.items.forEach((token) => {
        handleColorChange(token.cssVar, token.default);
      });
    });
  };

  const saveTheme = () => {
    // TODO: Save to user preferences (sqlite or local state)
    console.log('Saving Theme:', colors);
  };

  return (
    <div className="space-y-6 max-w-2xl p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Theme Editor</h2>
          <p className="text-muted-foreground">
            Customize the visualization colors.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetToDefaults}>
            <RefreshCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
          <Button size="sm" onClick={saveTheme}>
            <Save className="w-4 h-4 mr-2" /> Save Theme
          </Button>
        </div>
      </div>

      <Card className="bg-slate-950 border-slate-800">
        <CardContent className="pt-6 flex justify-center gap-4">
          <div className="h-24 w-20 rounded-lg border-b-4 flex flex-col items-center justify-center bg-music-tonic border-b-music-kick text-white">
            <span className="font-bold">I</span>
            <span className="text-xs opacity-75">Kick</span>
          </div>
          <div className="h-24 w-20 rounded-lg border-t-4 flex flex-col items-center justify-center bg-music-dominant border-t-music-snare text-white">
            <span className="font-bold">V7</span>
            <span className="text-xs opacity-75">Snare</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {THEME_TOKENS.map((group) => (
          <Card key={group.section}>
            <CardHeader>
              <CardTitle>{group.section} Colors</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {group.items.map((token) => (
                <div
                  key={token.cssVar}
                  className="flex items-center justify-between"
                >
                  <label className="text-sm font-medium">{token.label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colors[token.cssVar] || token.default}
                      onChange={(e) =>
                        handleColorChange(token.cssVar, e.target.value)
                      }
                      aria-label={token.label}
                      className="w-12 h-8 p-1 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-muted-foreground w-16">
                      {colors[token.cssVar] || token.default}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ThemeEditor;
