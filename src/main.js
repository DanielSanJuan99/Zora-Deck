import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { conectarOBS, estaConectado } from './obs-websocket.js';
import { setupTwitch, saveInitialTokens, apiClient } from './twitch-auth.js';

const CLIENT_ID = 'hhoos5qi41xfs6qq7z9pe2159mobzo'; 
const CLIENT_SECRET = 'x49z49ojed04ipb9q372t8yg5mh8xv';
const REDIRECT_URI = 'http://localhost:3000/callback'; 

if (started) {
  app.quit();
}

let mainWindow;
let isTwitchConnected = false; 
let cachedUsername = "";

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    backgroundColor: '#272a33',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
  });

  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined') {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

/* ========================================= */
/* LÓGICA DE AUTENTICACIÓN TWITCH            */
/* ========================================= */

ipcMain.handle('twitch:get-status', async () => {
  if (isTwitchConnected) {
    return { success: true, username: cachedUsername || "Conectado" };
  }

  try {
    const result = await setupTwitch(CLIENT_ID, CLIENT_SECRET, mainWindow);
    if (result.success) {
      isTwitchConnected = true;
      cachedUsername = result.username;
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on('twitch:auth-request', async (event) => {
  if (isTwitchConnected) {
    event.reply('twitch:auth-response', { success: true, username: cachedUsername });
    return;
  }

  let isResponded = false;
  const authWindow = new BrowserWindow({
    width: 500,
    height: 700,
    parent: mainWindow,
    modal: true, 
    show: false,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false }
  });

  const scopes = encodeURIComponent('chat:read chat:edit');
  const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scopes}`;

  authWindow.loadURL(authUrl);
  authWindow.once('ready-to-show', () => authWindow.show());

  const handleNavigation = async (url) => {
    if (url.includes(REDIRECT_URI)) {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');

      if (code && !isResponded) {
        isResponded = true;
        authWindow.destroy(); 
        
        try {
          const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              code: code,
              grant_type: 'authorization_code',
              redirect_uri: REDIRECT_URI
            })
          });

          const tokenData = await response.json();
          
          if (tokenData.access_token) {
            await saveInitialTokens(tokenData);
            
            setTimeout(async () => {
              const finalResult = await setupTwitch(CLIENT_ID, CLIENT_SECRET, mainWindow);
              if (finalResult.success) {
                isTwitchConnected = true;
                cachedUsername = finalResult.username;
              }
              event.reply('twitch:auth-response', finalResult);
            }, 500);
            
          } else {
            event.reply('twitch:auth-response', { success: false });
          }
        } catch (err) {
          event.reply('twitch:auth-response', { success: false });
        }
      }
    }
  };

  authWindow.webContents.on('will-navigate', (e, url) => handleNavigation(url));
  authWindow.webContents.on('will-redirect', (e, url) => handleNavigation(url));
  authWindow.on('closed', () => {
    if (!isResponded) event.reply('twitch:auth-response', { success: false });
  });
});

/* ========================================= */
/* CONTROLES DE VENTANA E IPC                */
/* ========================================= */

ipcMain.on('control:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('control:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});

ipcMain.on('control:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.on('obs:status-request', (event) => {
  event.reply('obs:connect-response', { success: estaConectado() });
});

ipcMain.on('obs:connect-request', async (event, config) => {
  const resultado = await conectarOBS(config.ip, config.port, config.password);
  event.reply('obs:connect-response', resultado);
});

ipcMain.on('context-menu:show', (e, params) => {
  const template = [
    { label: 'Opción 1', click: () => {} },
    { type: 'separator' },
    { label: 'Copiar Deck', role: 'copy' },
    { label: 'Eliminar Deck', role: 'delete' }
  ];
  const menu = Menu.buildFromTemplate(template);
  const win = BrowserWindow.fromWebContents(e.sender);
  setTimeout(() => {
    menu.popup({ window: win, x: Math.round(params.x), y: Math.round(params.y) })
  }, 100)
});

/* ========================================= */
/* ARRANQUE DE LA APLICACIÓN                 */
/* ========================================= */

app.whenReady().then(async () => {
  createWindow();

  try {
    const initResult = await setupTwitch(CLIENT_ID, CLIENT_SECRET, null);
    if (initResult.success) {
      isTwitchConnected = true;
      cachedUsername = initResult.username;
    }
  } catch (e) {
    // Error silencioso
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});