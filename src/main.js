import { app, BrowserWindow, ipcMain, shell } from 'electron';
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import started from 'electron-squirrel-startup';
import { conectarOBS, estaConectado, getOBSInstance } from './obs-websocket.js';
import { setupTwitch, saveInitialTokens, sendTwitchMessage } from './twitch-auth.js'; 

// --- CONFIGURACIÓN DE RUTAS DINÁMICAS (CORRECCIÓN VITE) ---
const isDev = !app.isPackaged;

const CONFIG_FOLDER = isDev 
    ? path.join(process.cwd(), 'src', 'config') 
    : path.join(process.cwd(), 'config');

const OBS_EVENTS_PATH = path.join(CONFIG_FOLDER, 'obs-events.json');
const TWITCH_EVENTS_PATH = path.join(CONFIG_FOLDER, 'twitch-events.json');
const KICK_TOKEN_PATH = path.join(CONFIG_FOLDER, 'kick-token.json');

console.log("-----------------------------------------");
console.log("📂 MODO DESARROLLO:", isDev);
console.log("📂 RUTA DE CONFIGURACIÓN:", CONFIG_FOLDER);
console.log("-----------------------------------------");

if (!fs.existsSync(CONFIG_FOLDER)) {
    fs.mkdirSync(CONFIG_FOLDER, { recursive: true });
}

function loadConfigList(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(data);
            console.log(`📖 Cargado con éxito: ${path.basename(filePath)} (${parsed.length} elementos)`);
            return parsed;
        } else {
            console.warn(`⚠️ Archivo no encontrado: ${filePath}. Creando vacío.`);
            fs.writeFileSync(filePath, JSON.stringify([], null, 4));
        }
    } catch (e) {
        console.error(`❌ Error crítico cargando ${filePath}:`, e.message);
    }
    return [];
}

// Carga inicial
let obsEvents = loadConfigList(OBS_EVENTS_PATH);
let twitchEvents = loadConfigList(TWITCH_EVENTS_PATH);

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback'; 
const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const KICK_REDIRECT_URI = 'http://localhost:3000/kickauth';

if (started) app.quit();

let mainWindow;
let isTwitchConnected = false; 
let cachedUsername = "";
let tempKickServer = null; 
let currentButtonsData = []; 

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200, 
    height: 750, 
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
/* MOTOR DE AUTOMATIZACIÓN                   */
/* ========================================= */

ipcMain.on('update-buttons-logic', (event, buttons) => {
    currentButtonsData = Object.values(buttons);
    console.log("🛠️ LÓGICA SINCRONIZADA: Botones activos:", currentButtonsData.length);
});

ipcMain.on('test-commands-execution', (event, commands) => {
    console.log("🧪 EJECUCIÓN MANUAL INICIADA");
    executeMacro(commands);
});

async function executeMacro(commands) {
    if (!commands || !Array.isArray(commands)) return;

    for (const cmd of commands) {
        const action = cmd.action || cmd; 
        try {
            if (action.service === 'twitch') {
                console.log("📤 Macro Twitch:", action.message);
                await sendTwitchMessage(action.message);
            } 
            
            if (action.service === 'obs') {
                const obs = getOBSInstance();
                if (obs && estaConectado()) {
                    console.log("🎬 Macro OBS:", action.command);
                    await obs.call(action.command, action.args || {});
                } else {
                    console.log("⚠️ OBS no conectado.");
                }
            }
        } catch (error) {
            console.error("❌ Error en macro:", error.message);
        }
    }
}

async function triggerAutomation(platform, eventName, eventData) {
    console.log(`📡 EVENTO: [${platform.toUpperCase()}] -> ${eventName}`);
    
    if (currentButtonsData.length === 0) return;

    currentButtonsData.forEach(async (button) => {
        if (!button.commands) return;

        const commandsToExecute = button.commands.filter(cmd => {
            const matchService = (cmd.trigger?.service === platform);
            const matchEvent = (cmd.trigger?.event === eventName);
            
            if (matchService && matchEvent && platform === 'obs' && cmd.trigger.condition?.inputKind) {
                return eventData.inputKind === cmd.trigger.condition.inputKind;
            }
            return matchService && matchEvent;
        });

        if (commandsToExecute.length > 0) {
            console.log(`🎯 Ejecutando botón: "${button.label}"`);
            executeMacro(button.commands);
        }
    });
}

/* ========================================= */
/* LÓGICA DE OBS                             */
/* ========================================= */

ipcMain.on('obs:connect-request', async (event, config) => {
  const resultado = await conectarOBS(config.ip, config.port, config.password);
  
  if (resultado.success) {
      const obs = getOBSInstance();
      obsEvents = loadConfigList(OBS_EVENTS_PATH);
      console.log(`✅ OBS Conectado. Escuchando ${obsEvents.length} eventos.`);

      obsEvents.forEach(item => {
          obs.on(item.socketEvent, (data) => {
              triggerAutomation('obs', item.triggerName, data);
          });
      });
  }
  
  event.reply('obs:connect-response', resultado);
});

/**
 * Handler para el editor (HINTS de eventos)
 * ACTUALIZADO: Ahora devuelve los objetos completos para permitir categorías en el acordeón
 */
ipcMain.handle('get-available-events', () => {
    obsEvents = loadConfigList(OBS_EVENTS_PATH);
    twitchEvents = loadConfigList(TWITCH_EVENTS_PATH);

    return {
        obs: obsEvents,
        twitch: twitchEvents
    };
});

/* ========================================= */
/* LÓGICA DE KICK                            */
/* ========================================= */

ipcMain.handle('kick:check-status', async () => {
    return { success: fs.existsSync(KICK_TOKEN_PATH) };
});

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
            fs.writeFileSync(KICK_TOKEN_PATH, JSON.stringify(data, null, 2));
            return { success: true };
        }
        return { success: false, error: data.message || 'Error en token' };
    } catch (error) {
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
                res.writeHead(400); res.end('Error de validacion.');
            }
        }
    });

    tempKickServer.listen(3000, () => {
        const params = new URLSearchParams({
            response_type: 'code', client_id: KICK_CLIENT_ID, redirect_uri: KICK_REDIRECT_URI,
            scope: 'user:read chat:write', code_challenge: codeChallenge,
            code_challenge_method: 'S256', state: state
        });
        shell.openExternal(`https://id.kick.com/oauth/authorize?${params.toString()}`);
    });
});

/* ========================================= */
/* LÓGICA DE TWITCH                          */
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
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
              if (finalResult.success) { isTwitchConnected = true; cachedUsername = finalResult.username; }
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
/* CONTROLES DE VENTANA                      */
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

/* ========================================= */
/* ARRANQUE                                  */
/* ========================================= */

app.whenReady().then(async () => {
  createWindow();

  mainWindow.webContents.on('did-finish-load', () => {
      console.log("🖥️ Ventana lista. Sincronizando lógica...");
      mainWindow.webContents.send('request-buttons-sync');
  });

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