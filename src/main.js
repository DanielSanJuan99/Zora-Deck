import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { conectarOBS, estaConectado } from './obs-websocket.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

async function initTwitchService() {
  try {
    // AQUÍ ocurre la magia: Importamos Twurple dinámicamente como tenías
    const { RefreshingAuthProvider } = await import('@twurple/auth');
    const { ChatClient } = await import('@twurple/chat');
    const { ApiClient } = await import('@twurple/api');
    const { EventSubWsListener } = await import('@twurple/eventsub-ws');
    const fs = await import('node:fs/promises'); 

    console.log("Librerías de Twurple cargadas correctamente");
  } catch (error) {
    console.error("Error al iniciar Twitch:", error);
  }
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false, // Sin marco nativo
    backgroundColor: '#272a33', // Fondo negro inicial
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Opcional: Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// --- CONTROL DE VENTANA PERSONALIZADA ---
// Escuchamos las órdenes que vienen desde el preload.js

ipcMain.on('control:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('control:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('control:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});
ipcMain.on('obs:status-request', (event) => {
  const conectado = estaConectado(); // Llama a la función de tu obs-websocket.js
  event.reply('obs:connect-response', { success: conectado });
});
// --- LÓGICA DE CONEXIÓN OBS ---
ipcMain.on('obs:connect-request', async (event, config) => {
  const { ip, port, password } = config;
  console.log(`Intentando conectar a OBS en ws://${ip}:${port}`);
  
  // Ejecutamos la función de conexión y esperamos el resultado
  const resultado = await conectarOBS(ip, port, password);
  
  // ENVIAMOS LA RESPUESTA DE VUELTA AL RENDERER
  // Esto permitirá que el mensaje en settings.html cambie a "Conectado"
  event.reply('obs:connect-response', resultado);
});
// ----------------------------------------

app.whenReady().then(() => {
  createWindow();
  initTwitchService(); // Llamamos a tu servicio de Twitch al arrancar

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});