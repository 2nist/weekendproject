const { contextBridge, ipcRenderer } = require('electron');

// Lightweight preload logger shim — avoid requiring the main-process logger here
// because the preload bundle runs in an isolated sandbox during dev and
// bundlers may fail to resolve main-only modules. Use console instead.
const logger = {
  debug: (...args) => console.debug('[preload]', ...args),
  info: (...args) => console.info('[preload]', ...args),
  warn: (...args) => console.warn('[preload]', ...args),
  error: (...args) => console.error('[preload]', ...args),
};

contextBridge.exposeInMainWorld('ipc', {
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  on: (channel, func) => {
    const subscription = (event, ...args) => func(...args);
    ipcRenderer.on(channel, subscription);

    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  invoke: (channel, data) => {
    return ipcRenderer.invoke(channel, data);
  },
});
logger.debug('[preload] ipc exposed');

// Expose electronAPI for analysis features
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, data) => {
    return ipcRenderer.invoke(channel, data);
  },
  // Expose dialog API for file selection
  showOpenDialog: (options) => {
    return ipcRenderer.invoke('DIALOG:SHOW_OPEN', options);
  },
});
logger.debug('[preload] electronAPI exposed');

// Backwards-compatible alias for convenience in renderer code
contextBridge.exposeInMainWorld('electron', {
  downloadYouTube: (url) => ipcRenderer.invoke('DOWNLOADER:DOWNLOAD', url),
  recalcChords: (payload) => ipcRenderer.invoke('ANALYSIS:RECALC_CHORDS', payload),
  transformGrid: (payload) => ipcRenderer.invoke('ANALYSIS:TRANSFORM_GRID', payload),
  resegment: (payload) => ipcRenderer.invoke('ANALYSIS:RESEGMENT', payload),
  sculptSection: (payload) => ipcRenderer.invoke('ANALYSIS:SCULPT_SECTION', payload),
  parseMidi: (payload) => ipcRenderer.invoke('LIBRARY:PARSE_MIDI', payload),
  attachMidi: (payload) => ipcRenderer.invoke('LIBRARY:ATTACH_MIDI', payload),
  getLyrics: (payload) => ipcRenderer.invoke('LYRICS:GET', payload),
});
logger.debug('[preload] electron compatibility API exposed');

// Re-emit main-process logs into the renderer console in development so DevTools
// (and Console Ninja) can capture them as if they originated in the renderer.
try {
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  const enableLegacyPreloadLogs =
    process.env.LEGACY_PRELOAD_LOGS === '1' || process.env.LEGACY_PRELOAD_LOGS === 'true';
  if (isDev && enableLegacyPreloadLogs) {
    ipcRenderer.on('MAIN:LOG', (event, payload) => {
      try {
        if (!payload) return;
        const { level = 'log', args = [] } = payload;
        const method =
          console[level] && typeof console[level] === 'function' ? console[level] : console.log;
        if (Array.isArray(args)) {
          method.call(console, '[MAIN]', ...args);
        } else {
          method.call(console, '[MAIN]', args);
        }
      } catch (e) {
        console.error('[preload] failed to re-emit MAIN:LOG', e);
      }
    });
    logger.debug('[preload] MAIN:LOG legacy console re-emitter enabled');
  }
} catch (e) {
  logger.warn('[preload] failed to register MAIN:LOG re-emitter', e?.message || e);
}
