const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowAPI', {
  // --- Controles de Ventana ---
  minimize: () => ipcRenderer.send('control:minimize'),
  maximize: () => ipcRenderer.send('control:maximize'),
  close: () => ipcRenderer.send('control:close'),
  
  // --- Lógica de OBS ---
  connectOBS: (config) => ipcRenderer.send('obs:connect-request', config),
  checkOBSStatus: () => ipcRenderer.send('obs:status-request'),
  onOBSResponse: (callback) => {
    ipcRenderer.on('obs:connect-response', (event, arg) => callback(arg));
  },

  // --- Lógica de Twitch ---
  sendTwitchAuth: () => ipcRenderer.send('twitch:auth-request'),
  getTwitchStatus: () => ipcRenderer.invoke('twitch:get-status'),
  onTwitchResponse: (callback) => {
    ipcRenderer.on('twitch:auth-response', (event, arg) => callback(arg));
  },
  onTwitchChatMessage: (callback) => {
    ipcRenderer.on('twitch:chat-message', (event, arg) => callback(arg));
  },

  // --- Lógica de KICK ---
  sendKickAuth: () => ipcRenderer.send('kick:auth-request'),
  getKickToken: (data) => ipcRenderer.invoke('kick:get-token', data),
  checkKickStatus: () => ipcRenderer.invoke('kick:check-status'),
  onKickSuccess: (callback) => {
    ipcRenderer.removeAllListeners('kick:auth-success');
    ipcRenderer.on('kick:auth-success', (event, arg) => callback(arg));
  },

  /* ========================================= */
  /* NUEVO: LÓGICA DE AUTOMATIZACIÓN Y GRID    */
  /* ========================================= */

  // Sincroniza todos los botones con el Main (usado al Guardar)
  updateButtonsLogic: (buttons) => ipcRenderer.send('update-buttons-logic', buttons),

  // Ejecuta la prueba manual (Botón "PROBAR")
  testCommands: (commands) => ipcRenderer.send('test-commands-execution', commands),

  // Detiene la ejecución en curso
  stopCommands: () => ipcRenderer.send('stop-macro-execution'),

  // Escucha cuando el Main solicita los botones (al arrancar la app)
  onRequestSync: (callback) => {
    // Es importante usar removeAllListeners antes de registrar uno nuevo
    // para evitar que la función se ejecute varias veces si el renderer se recarga
    ipcRenderer.removeAllListeners('request-buttons-sync');
    ipcRenderer.on('request-buttons-sync', () => callback());
  },

  // Obtener eventos para el panel de ayuda del editor
  getAvailableEvents: () => ipcRenderer.invoke('get-available-events'),

  onPlayAudio: (callback) => {
    ipcRenderer.on('system:play-audio', (event, filepath) => callback(filepath));
  }
});