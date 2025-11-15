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
