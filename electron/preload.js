const { contextBridge, ipcRenderer } = require('electron');

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
console.log('[preload] ipc exposed');

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
console.log('[preload] electronAPI exposed');

// Backwards-compatible alias for convenience in renderer code
contextBridge.exposeInMainWorld('electron', {
  downloadYouTube: (url) => ipcRenderer.invoke('DOWNLOADER:DOWNLOAD', url),
  recalcChords: (payload) =>
    ipcRenderer.invoke('ANALYSIS:RECALC_CHORDS', payload),
  transformGrid: (payload) =>
    ipcRenderer.invoke('ANALYSIS:TRANSFORM_GRID', payload),
  resegment: (payload) =>
    ipcRenderer.invoke('ANALYSIS:RESEGMENT', payload),
  sculptSection: (payload) =>
    ipcRenderer.invoke('ANALYSIS:SCULPT_SECTION', payload),
  parseMidi: (payload) =>
    ipcRenderer.invoke('LIBRARY:PARSE_MIDI', payload),
  attachMidi: (payload) =>
    ipcRenderer.invoke('LIBRARY:ATTACH_MIDI', payload),
  getLyrics: (payload) =>
    ipcRenderer.invoke('LYRICS:GET', payload),
});
console.log('[preload] electron compatibility API exposed');
