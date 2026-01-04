import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { conectarOBS, estaConectado } from './obs-websocket.js';
import { setupTwitch, saveInitialTokens } from './twitch-auth.js';

// --- CONFIGURACIÓN DE CREDENCIALES ---
const CLIENT_ID = 'hhoos5qi41xfs6qq7z9pe2159mobzo'; 
const CLIENT_SECRET = 'x49z49ojed04ipb9q372t8yg5mh8xv';

// IMPORTANTE: Debe ser exactamente igual a lo configurado en la consola de Twitch
const REDIRECT_URI = 'http://localhost:3000/callback'; 

if (started) {
  app.quit();
}

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    backgroundColor: '#272a33',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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

ipcMain.on('twitch:auth-request', async (event) => {
  let isResponded = false;

  // 1. Intento silencioso (Carga automática si el archivo ya existe)
  const autoResult = await setupTwitch(CLIENT_ID, CLIENT_SECRET, mainWindow);
  if (autoResult.success) {
    isResponded = true;
    event.reply('twitch:auth-response', autoResult);
    return;
  }

  // 2. Abrir Popup de Login
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

  // FUNCIÓN MAESTRA DE CAPTURA
  const handleNavigation = async (url) => {
    console.log("Detectada navegación a:", url);

    if (url.includes(REDIRECT_URI)) {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');

      if (code && !isResponded) {
        isResponded = true;
        
        // Cerramos la ventana de inmediato
        authWindow.destroy(); 
        
        try {
          console.log("Intercambiando código por tokens...");
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
            console.log("Token recibido. Guardando en archivo...");
            await saveInitialTokens(tokenData);
            
            // Esperamos un instante para que el archivo se asiente
            setTimeout(async () => {
              const finalResult = await setupTwitch(CLIENT_ID, CLIENT_SECRET, mainWindow);
              event.reply('twitch:auth-response', finalResult);
            }, 500);
            
          } else {
            console.error("Respuesta de Twitch sin access_token:", tokenData);
            event.reply('twitch:auth-response', { success: false, error: 'Error en respuesta de Twitch' });
          }

        } catch (err) {
          console.error("Error en canje de tokens:", err);
          event.reply('twitch:auth-response', { success: false, error: 'Error de red en validación' });
        }
      }
    }
  };

  // Eventos de captura para no perder la redirección de localhost
  authWindow.webContents.on('will-navigate', (e, url) => handleNavigation(url));
  authWindow.webContents.on('will-redirect', (e, url) => handleNavigation(url));
  authWindow.webContents.on('did-start-navigation', (e, url) => handleNavigation(url));
  authWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL) => {
    handleNavigation(validatedURL);
  });

  authWindow.on('closed', () => {
    if (!isResponded) {
      event.reply('twitch:auth-response', { success: false, error: 'Ventana cerrada' });
    }
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});