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
  '--font-sans': 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  '--font-mono': '"JetBrains Mono", "Fira Code", Consolas, Monaco, "Courier New", monospace',
  '--font-serif': 'Georgia, "Times New Roman", Times, serif',
  '--font-display': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  
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
  
  // Helper to check if a key is a font variable
  const isFontVariable = (key: string) => key.startsWith('--font-');
  
  // Helper to add font fallbacks if not present
  const addFontFallbacks = (fontName: string, key: string): string => {
    // If font already has fallbacks (contains comma), return as-is
    if (fontName.includes(',')) {
      return fontName;
    }
    
    // Add appropriate fallbacks based on font type
    if (key === '--font-sans') {
      return `${fontName}, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
    } else if (key === '--font-mono') {
      return `${fontName}, 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace`;
    } else if (key === '--font-serif') {
      return `${fontName}, 'Times New Roman', Times, serif`;
    } else if (key === '--font-display') {
      return `${fontName}, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    }
    return fontName;
  };
  
  // Build CSS rules - apply to both :root and .dark separately
  let cssRules = '';
  
  // Apply to :root
  cssRules += ':root {\n';
  for (const [k, v] of Object.entries(theme)) {
    let cssValue = v;
    if (isFontVariable(k)) {
      // Fonts: add fallbacks and wrap in quotes if needed
      cssValue = addFontFallbacks(v, k);
    } else if (typeof v === 'string' && v.startsWith('#')) {
      // Colors: convert hex to HSL
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
      if (isFontVariable(k)) {
        // Fonts: add fallbacks and wrap in quotes if needed
        cssValue = addFontFallbacks(v, k);
      } else if (typeof v === 'string' && v.startsWith('#')) {
        // Colors: convert hex to HSL
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
    if (isFontVariable(k)) {
      // Fonts: add fallbacks
      const fontValue = addFontFallbacks(v, k);
      root.style.setProperty(k, fontValue);
    } else if (typeof v === 'string' && v.startsWith('#')) {
      // Colors: convert hex to HSL
      const hsl = hexToHsl(v);
      root.style.setProperty(k, hsl);
    } else {
      // Other values (like radius): apply as-is
      root.style.setProperty(k, v);
    }
  }
}

export function saveTheme(theme: Record<string, string>, key = 'user_theme') {
  const themeJson = JSON.stringify(theme);
  
  // Always save to localStorage immediately for instant feedback
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, themeJson);
  }
  
  // Also try to save to database via IPC (Electron) - async, don't block
  if (typeof window !== 'undefined') {
    const saveToDb = async () => {
      try {
        if (window.ipc?.invoke) {
          await window.ipc.invoke('DB:SET_SETTING', { key, value: themeJson });
          console.log('[themeUtils] Theme saved to database');
        } else if (window.electronAPI?.invoke) {
          await window.electronAPI.invoke('DB:SET_SETTING', { key, value: themeJson });
          console.log('[themeUtils] Theme saved to database');
        }
      } catch (error) {
        console.warn('[themeUtils] Failed to save theme to database (using localStorage):', error);
      }
    };
    saveToDb(); // Fire and forget
  }
}

export function loadTheme(key = 'user_theme') {
  // Try to load from database via IPC (Electron) - sync version that checks localStorage first
  // For async loading, use loadThemeAsync
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const theme = JSON.parse(raw);
      console.log('[themeUtils] Theme loaded from localStorage');
      return theme;
    }
  } catch {
    // Continue to try database
  }
  
  // Note: Database loading is async, so we'll load it async on startup
  // This sync version returns localStorage for immediate use
  return null;
}

// Async version for loading from database on startup
export async function loadThemeAsync(key = 'user_theme') {
  // Try to load from database via IPC (Electron)
  if (typeof window !== 'undefined') {
    try {
      if (window.ipc?.invoke) {
        const result = await window.ipc.invoke('DB:GET_SETTINGS');
        if (result?.success && result.settings?.[key]) {
          const theme = JSON.parse(result.settings[key]);
          // Also sync to localStorage for faster future loads
          localStorage.setItem(key, JSON.stringify(theme));
          console.log('[themeUtils] Theme loaded from database');
          return theme;
        }
      } else if (window.electronAPI?.invoke) {
        const result = await window.electronAPI.invoke('DB:GET_SETTINGS');
        if (result?.success && result.settings?.[key]) {
          const theme = JSON.parse(result.settings[key]);
          // Also sync to localStorage for faster future loads
          localStorage.setItem(key, JSON.stringify(theme));
          console.log('[themeUtils] Theme loaded from database');
          return theme;
        }
      }
    } catch (error) {
      console.warn('[themeUtils] Failed to load theme from database, trying localStorage:', error);
    }
  }
  
  // Fallback to localStorage
  return loadTheme(key);
}

export default { DEFAULT_THEME, hexToHsl, hslToHex, getCssVariableAsHex, loadCurrentTheme, applyTheme, saveTheme, loadTheme, loadThemeAsync };
