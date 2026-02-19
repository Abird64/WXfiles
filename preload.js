const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateFiles: (callback) => ipcRenderer.on('update-files', callback)
});