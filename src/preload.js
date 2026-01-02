// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowAPI', {
  minimize: () => ipcRenderer.send('control:minimize'),
  maximize: () => ipcRenderer.send('control:maximize'),
  close: () => ipcRenderer.send('control:close'),
  
  connectOBS: (config) => ipcRenderer.send('obs:connect-request', config),

  checkOBSStatus: () => ipcRenderer.send('obs:status-request'),

  onOBSResponse: (callback) => {
    ipcRenderer.removeAllListeners('obs:connect-response');
    ipcRenderer.on('obs:connect-response', (event, arg) => callback(arg));
  }
});