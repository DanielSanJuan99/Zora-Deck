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
  sendTwitchAuth: () => ipcRenderer.send('twitch:auth-request'),
  getTwitchStatus: () => ipcRenderer.invoke('twitch:get-status'),
  onTwitchResponse: (callback) => {
    ipcRenderer.removeAllListeners('twitch:auth-response');
    ipcRenderer.on('twitch:auth-response', (event, arg) => callback(arg));
  },
  onTwitchChatMessage: (callback) => {
    ipcRenderer.on('twitch:chat-message', (event, arg) => callback(arg));
  },

  // --- Lógica de KICK ---
  sendKickAuth: () => ipcRenderer.send('kick:auth-request'),
  
  // Intercambia el código temporal por el token definitivo
  getKickToken: (data) => ipcRenderer.invoke('kick:get-token', data),

  // NUEVO: Verifica si el archivo kick-token.json existe para mantener el botón "Vinculado"
  checkKickStatus: () => ipcRenderer.invoke('kick:check-status'),

  onKickSuccess: (callback) => {
    // Escucha el código de autorización proveniente del servidor local
    ipcRenderer.removeAllListeners('kick:auth-success');
    ipcRenderer.on('kick:auth-success', (event, arg) => callback(arg));
  }
});