import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'; // Añadido ipcMain
import path from 'node:path';
import http from 'node:http';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

async function initTwitchService() {
  try {
    // AQUÍ ocurre la magia: Importamos Twurple dinámicamente
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
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

ipcMain.on('control:minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.on('control:maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('control:close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});
// ----------------------------------------

// despliegue del menú contextual
ipcMain.on('context-menu:show', (e, params) => {
  console.log('4) Mostrando menú contextual desde el proceso principal.');
  const template = [
    {
      label: 'Opción 1',
      click: () => { console.log('5) Opción detectada'); }
    },
    { type: 'separator' },
    { label: 'Copiar Deck', role: 'copy' },
    { label: 'Eliminar Deck', role: 'delete' }
  ];

  const menu = Menu.buildFromTemplate(template);
  const win = BrowserWindow.fromWebContents(e.sender);
  setTimeout(() => {
    menu.popup({ 
      window: win,
      x: Math.round(params.x),
      y: Math.round(params.y)
    })
  }, 100)
})

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

// PLACEHOLDER: Buscamos conectar a Twitch
ipcMain.handle('twitch:connect', async () => {
  try {
    // Aquí va la lógica de conexión a Twitch

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("Intentando conectar a Twitch...");
    return true; // Simulamos éxito
  } catch (error) {
    console.error("Error al conectar a Twitch:", error);
    return false;
  }
});