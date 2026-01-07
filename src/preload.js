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
  sendTwitchAuth: () => ipcRenderer.send('twitch:auth-request'), // Ajustado para coincidir con tu settings
  getTwitchStatus: () => ipcRenderer.invoke('twitch:get-status'),
  onTwitchResponse: (callback) => {
    ipcRenderer.removeAllListeners('twitch:auth-response');
    ipcRenderer.on('twitch:auth-response', (event, arg) => callback(arg));
  },
  onTwitchChatMessage: (callback) => {
    ipcRenderer.on('twitch:chat-message', (event, arg) => callback(arg));
  },

  // --- Lógica de KICK (AÑADIDO) ---
  // Este es el que dispara la ventana nativa que evita el error -105
  sendKickAuth: () => ipcRenderer.send('kick:auth-request'),
  
  // Este escucha cuando el Main termina de crear el archivo token.json
  onKickSuccess: (callback) => {
    ipcRenderer.removeAllListeners('kick:auth-success');
    ipcRenderer.on('kick:auth-success', (event, arg) => callback(arg));
  }
});