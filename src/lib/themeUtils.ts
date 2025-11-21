import hexToTailwindHsl from './colorUtils';

export const DEFAULT_THEME: Record<string, string> = {
  '--music-kick': '#06b6d4',
  '--music-snare': '#d946ef',
  '--music-tonic': '#1e3a8a',
  '--music-subdominant': '#064e3b',
  '--music-dominant': '#7f1d1d',
  '--music-diminished': '#581c87',
  '--background': '#020617',
};

export function hexToHsl(hex: string): string {
  // Reuse colorUtils mapping which returns Tailwind HSL format
  return hexToTailwindHsl(hex);
}

export function applyTheme(theme: Record<string, string>) {
  Object.entries(theme).forEach(([k, v]) => {
    const hsl = hexToHsl(v);
    document.documentElement.style.setProperty(k, hsl);
  });
}

export function saveTheme(theme: Record<string, string>, key = 'user_theme') {
  localStorage.setItem(key, JSON.stringify(theme));
}

export function loadTheme(key = 'user_theme') {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default { DEFAULT_THEME, hexToHsl, applyTheme, saveTheme, loadTheme };
