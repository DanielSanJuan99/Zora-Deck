import { app, BrowserWindow, ipcMain, shell } from 'electron'; // "Menu" eliminado
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import started from 'electron-squirrel-startup';
import { conectarOBS, estaConectado } from './obs-websocket.js';
import { setupTwitch, saveInitialTokens } from './twitch-auth.js';

// --- DEFINICIÓN DE RUTA LOCAL PARA EL TOKEN ---
const KICK_TOKEN_PATH = path.join(process.cwd(), 'kick-token.json');

// CREDENCIALES
const CLIENT_ID = 'hhoos5qi41xfs6qq7z9pe2159mobzo'; 
const CLIENT_SECRET = 'x49z49ojed04ipb9q372t8yg5mh8xv';
const REDIRECT_URI = 'http://localhost:3000/callback'; 

const KICK_CLIENT_ID = '01KEAJFG7MPHRNM2Z6H12DZBP4';
const KICK_CLIENT_SECRET = '2e9356cac4483345c1766beba0f17447142aa930439188c4054c4c8df111c9c1'; 
const KICK_REDIRECT_URI = 'http://localhost:3000/kickauth';

if (started) {
  app.quit();
}

let mainWindow;
let isTwitchConnected = false; 
let cachedUsername = "";
let tempKickServer = null; 

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
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
/* LÓGICA DE KICK (PERSISTENCIA LOCAL)       */
/* ========================================= */

// Verifica si el archivo existe en la carpeta del proyecto
ipcMain.handle('kick:check-status', async () => {
    return { success: fs.existsSync(KICK_TOKEN_PATH) };
});

// Intercambio de token y guardado local
ipcMain.handle('kick:get-token', async (event, { code, codeVerifier }) => {
    try {
        const response = await fetch('https://id.kick.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: KICK_CLIENT_ID,
                client_secret: KICK_CLIENT_SECRET,
                redirect_uri: KICK_REDIRECT_URI,
                code_verifier: codeVerifier
            })
        });

        const data = await response.json();

        if (data.access_token) {
            // Guardamos el JSON en la raíz de tu carpeta de GitHub
            fs.writeFileSync(KICK_TOKEN_PATH, JSON.stringify(data, null, 2));
            console.log("✅ Token de Kick guardado en la carpeta del proyecto:", KICK_TOKEN_PATH);
            return { success: true };
        }
        
        console.error("❌ Kick API Error:", data);
        return { success: false, error: data.message || 'Token no recibido' };
    } catch (error) {
        console.error("❌ Error en get-token:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.on('kick:auth-request', async (event) => {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    if (tempKickServer) tempKickServer.close();

    tempKickServer = http.createServer((req, res) => {
        const urlObj = new URL(req.url, 'http://localhost:3000');
        if (urlObj.pathname === '/kickauth') {
            const code = urlObj.searchParams.get('code');
            const returnedState = urlObj.searchParams.get('state');

            if (code && returnedState === state) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h2>✅ ¡Autorización exitosa!</h2><p>Vuelve a la aplicación.</p>');
                
                mainWindow.webContents.send('kick:auth-success', { code, codeVerifier });
                
                tempKickServer.close();
                tempKickServer = null;
            } else {
                res.writeHead(400);
                res.end('Error de validacion.');
            }
        }
    });

    tempKickServer.listen(3000, () => {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: KICK_CLIENT_ID,
            redirect_uri: KICK_REDIRECT_URI,
            scope: 'user:read chat:write',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state: state
        });
        shell.openExternal(`https://id.kick.com/oauth/authorize?${params.toString()}`);
    });
});

/* ========================================= */
/* LÓGICA DE TWITCH                           */
/* ========================================= */

ipcMain.handle('twitch:get-status', async () => {
  if (isTwitchConnected) return { success: true, username: cachedUsername || "Conectado" };
  try {
    const result = await setupTwitch(CLIENT_ID, CLIENT_SECRET, mainWindow);
    if (result.success) {
      isTwitchConnected = true;
      cachedUsername = result.username;
    }
    return result;
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.on('twitch:auth-request', async (event) => {
  if (isTwitchConnected) {
    event.reply('twitch:auth-response', { success: true, username: cachedUsername });
    return;
  }

  let isResponded = false;
  const authWindow = new BrowserWindow({
    width: 500, height: 700, parent: mainWindow, modal: true, show: false, autoHideMenuBar: true,
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
              client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: code,
              grant_type: 'authorization_code', redirect_uri: REDIRECT_URI
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
          } else { event.reply('twitch:auth-response', { success: false }); }
        } catch (err) { event.reply('twitch:auth-response', { success: false }); }
      }
    }
  };

  authWindow.webContents.on('will-navigate', (e, url) => handleNavigation(url));
  authWindow.webContents.on('will-redirect', (e, url) => handleNavigation(url));
  authWindow.on('closed', () => { if (!isResponded) event.reply('twitch:auth-response', { success: false }); });
});

/* ========================================= */
/* CONTROLES DE VENTANA                       */
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

/* ========================================= */
/* ARRANQUE                                  */
/* ========================================= */

app.whenReady().then(async () => {
  createWindow();
  try {
    const initResult = await setupTwitch(CLIENT_ID, CLIENT_SECRET, null);
    if (initResult.success) {
      isTwitchConnected = true;
      cachedUsername = initResult.username;
    }
  } catch (e) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});