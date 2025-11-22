import hexToTailwindHsl from './colorUtils';

export const DEFAULT_THEME: Record<string, string> = {
  // Base Colors
  '--background': '#0f172a',       // Dark slate background
  '--foreground': '#f1f5f9',       // Light slate text
  
  // Text Colors
  '--card-foreground': '#f1f5f9',  // Text on cards
  '--popover-foreground': '#f1f5f9', // Text in dropdowns/selects/popovers
  '--primary-foreground': '#0f172a', // Text on primary buttons
  '--secondary-foreground': '#f1f5f9', // Text on secondary elements
  '--muted-foreground': '#94a3b8', // Muted/secondary text
  '--accent-foreground': '#0f172a', // Text on accent elements
  '--destructive-foreground': '#f1f5f9', // Text on destructive buttons
  
  // Background Colors
  '--card': '#1e293b',             // Card background
  '--popover': '#1e293b',          // Popover background
  '--primary': '#3b82f6',          // Primary button background
  '--secondary': '#334155',        // Secondary button background
  '--muted': '#334155',            // Muted background
  '--accent': '#334155',           // Accent background
  '--destructive': '#dc2626',      // Destructive/danger color
  
  // Borders & Inputs
  '--border': '#334155',           // Border color
  '--input': '#334155',            // Input border color
  '--ring': '#60a5fa',             // Focus ring color
  
  // Typography & Layout
  '--radius': '0.5rem',            // Border radius
  '--font-sans': 'Inter',
  '--font-mono': 'JetBrains Mono',
  '--font-serif': 'Georgia',
  '--font-display': 'system-ui',
  
  // Music semantic colors
  '--music-kick': '#06b6d4',
  '--music-snare': '#d946ef',
  '--music-tonic': '#1e3a8a',
  '--music-subdominant': '#064e3b',
  '--music-dominant': '#7f1d1d',
  '--music-diminished': '#581c87',
};

// Convert HSL string "H S% L%" to hex
export function hslToHex(hsl: string): string {
  if (!hsl || !hsl.includes(' ')) {
    // If it's already hex or invalid, return as is
    if (hsl?.startsWith('#')) return hsl;
    return '#000000';
  }

  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return '#000000';

  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `#${[r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
}

// Get current CSS variable value as hex
export function getCssVariableAsHex(variable: string): string {
  if (typeof window === 'undefined') return '#000000';
  
  const root = document.documentElement;
  const value = getComputedStyle(root).getPropertyValue(variable).trim();
  
  if (!value) return '#000000';
  
  // If it's already hex format
  if (value.startsWith('#')) return value;
  
  // If it's HSL format, convert to hex
  if (value.includes(' ') && value.includes('%')) {
    return hslToHex(value);
  }
  
  return value;
}

// Load current CSS variables from DOM
export function loadCurrentTheme(): Record<string, string> {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  
  const theme: Record<string, string> = {};
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);
  
  // Get all CSS variables from DEFAULT_THEME
  Object.keys(DEFAULT_THEME).forEach(key => {
    const value = computedStyle.getPropertyValue(key).trim();
    if (value) {
      // Convert HSL to hex for display
      if (value.includes(' ') && value.includes('%')) {
        theme[key] = hslToHex(value);
      } else if (value.startsWith('#')) {
        theme[key] = value;
      } else {
        // For non-color values (like font names, radius)
        theme[key] = value || DEFAULT_THEME[key];
      }
    } else {
      theme[key] = DEFAULT_THEME[key];
    }
  });
  
  return theme;
}

export function hexToHsl(hex: string): string {
  // Reuse colorUtils mapping which returns Tailwind HSL format
  return hexToTailwindHsl(hex);
}

export function applyTheme(theme: Record<string, string>) {
  if (typeof window === 'undefined' || !document?.documentElement) return;
  
  const root = document.documentElement;
  const body = document.body;
  const isDark = body.classList.contains('dark');
  
  // Get or create a style element for dynamic theme overrides
  // This will override both :root and .dark selectors from the CSS file
  let themeStyle = document.getElementById('theme-dynamic-override');
  if (!themeStyle) {
    themeStyle = document.createElement('style');
    themeStyle.id = 'theme-dynamic-override';
    document.head.appendChild(themeStyle);
  }
  
  // Build CSS rules - apply to both :root and .dark separately
  let cssRules = '';
  
  // Apply to :root
  cssRules += ':root {\n';
  for (const [k, v] of Object.entries(theme)) {
    let cssValue = v;
    if (typeof v === 'string' && v.startsWith('#')) {
      cssValue = hexToHsl(v);
    }
    cssRules += `  ${k}: ${cssValue};\n`;
  }
  cssRules += '}\n';
  
  // Also apply to .dark if body has dark class (to override CSS file's .dark rules)
  if (isDark) {
    cssRules += '.dark {\n';
    for (const [k, v] of Object.entries(theme)) {
      let cssValue = v;
      if (typeof v === 'string' && v.startsWith('#')) {
        cssValue = hexToHsl(v);
      }
      cssRules += `  ${k}: ${cssValue};\n`;
    }
    cssRules += '}\n';
  }
  
  // Set the CSS (this will override the CSS file because it's injected after)
  themeStyle.textContent = cssRules;
  
  // Also set directly on root for immediate effect (inline styles have highest specificity)
  for (const [k, v] of Object.entries(theme)) {
    if (typeof v === 'string' && v.startsWith('#')) {
      const hsl = hexToHsl(v);
      root.style.setProperty(k, hsl);
    } else {
      root.style.setProperty(k, v);
    }
  }
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

export default { DEFAULT_THEME, hexToHsl, hslToHex, getCssVariableAsHex, loadCurrentTheme, applyTheme, saveTheme, loadTheme };
