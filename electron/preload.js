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
