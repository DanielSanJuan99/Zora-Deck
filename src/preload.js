// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowAPI', {
  minimize: () => ipcRenderer.send('control:minimize'),
  maximize: () => ipcRenderer.send('control:maximize'),
  close: () => ipcRenderer.send('control:close'),
  
  // --- Lógica de OBS ---
  connectOBS: (config) => ipcRenderer.send('obs:connect-request', config),
  checkOBSStatus: () => ipcRenderer.send('obs:status-request'),
  onOBSResponse: (callback) => {
    ipcRenderer.removeAllListeners('obs:connect-response');
    ipcRenderer.on('obs:connect-response', (event, arg) => callback(arg));
  },

  // --- Lógica de Twitch ---
  twitchLogin: () => ipcRenderer.send('twitch:auth-request'),
  
  // NUEVO: Permite consultar el estado actual (si ya hay tokens guardados)
  getTwitchStatus: () => ipcRenderer.invoke('twitch:get-status'),

  onTwitchResponse: (callback) => {
    ipcRenderer.removeAllListeners('twitch:auth-response');
    ipcRenderer.on('twitch:auth-response', (event, arg) => callback(arg));
  },

  onTwitchChatMessage: (callback) => {
    ipcRenderer.on('twitch:chat-message', (event, arg) => callback(arg));
  }
});