import { StaticAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { ChatClient } from '@twurple/chat';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { app, safeStorage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

const isDev = !app.isPackaged;
const USER_DATA_FOLDER = isDev ? process.cwd() : app.getPath('userData');
const TOKEN_PATH = path.join(USER_DATA_FOLDER, 'twitch-tokens.json');

// Variables globales
let authProvider = null;
let apiClient = null;
let chatClient = null;
let listener = null; 

export async function setupTwitch(clientId, clientSecret, mainWindow, triggerAutomation) {
  try {
    let tokenData;
    
    try {
      tokenData = await loadToken();
    } catch (err) {
      console.log('Esperando vinculación manual...');
      return { success: false, error: 'NEED_AUTH' };
    }

    const accessToken = tokenData.access_token || tokenData.accessToken;
    
    authProvider = new StaticAuthProvider(clientId, accessToken);
    apiClient = new ApiClient({ authProvider });

    // EL GRAN CAMBIO: Obtenemos los datos directo del token para evadir el minificador de Vite
    let tokenInfo;
    try {
      tokenInfo = await apiClient.getTokenInfo();
    } catch (apiErr) {
      console.error("Error validando el token:", apiErr);
      throw new Error("401 - El token es inválido o ha caducado.");
    }

    if (!tokenInfo.userId) {
        throw new Error("El token no pertenece a un usuario válido.");
    }

    // Reiniciamos el listener si existía uno previo
    if (listener) {
        listener.stop();
    }
    
    listener = new EventSubWsListener({ apiClient });
    listener.start();
    console.log("EventSub Listener inicializado");

    listener.onChannelRedemptionAdd(tokenInfo.userId, (e) => {
      console.log(`Recompensa canjeada: ${e.rewardTitle}`);
      if (triggerAutomation) {
        triggerAutomation('twitch', 'ChannelPointsRedeemed', {
          user: e.userName,
          reward: e.rewardTitle
        });
      }
    });

    if (chatClient) {
      try { await chatClient.quit(); } catch (e) {}
      chatClient = null;
    }

    chatClient = new ChatClient({ 
      authProvider, 
      channels: [tokenInfo.userName] // Usamos el nombre extraído del token
    });

    chatClient.onMessage((channel, userMsg, message, msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('twitch-chat-message', { user: userMsg, message });
      }
      if (triggerAutomation) {
          triggerAutomation('twitch', 'ChatMessage', { user: userMsg, message: message });
      }
    });

    await chatClient.connect();
    console.log(`¡SISTEMA LISTO! Canal conectado: ${tokenInfo.userName}`);
    
    return { success: true, username: tokenInfo.userName };

  } catch (error) {
    console.error('Error crítico en setupTwitch:', error.message);

    const isNetworkError = error.message.includes('fetch failed') || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET';
    
    if (isNetworkError) {
      if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('twitch-status-update', { status: 'DISCONNECTED', error: 'Sin red' });
      }
      return { success: false, error: 'NETWORK_ERROR' };
    }

    if (error.message.includes('401') || error.message.includes('token')) {
      await fs.unlink(TOKEN_PATH).catch(() => {});
      authProvider = null;
      apiClient = null;
    }
    
    return { success: false, error: error.message };
  }
}

export async function sendTwitchMessage(message) {
    try {
        if (!chatClient || !chatClient.isConnected) {
            throw new Error("El chat de Twitch no está conectado.");
        }
        const channels = chatClient.currentChannels;
        if (channels.length > 0) {
            await chatClient.say(channels[0], message);
            console.log(`✉️ Mensaje enviado a Twitch: ${message}`);
            return { success: true };
        }
    } catch (error) {
        console.error("❌ Error enviando mensaje a Twitch:", error);
        return { success: false, error: error.message };
    }
}

export async function saveInitialTokens(tokenData) {
  const dataToSave = { ...tokenData, obtainmentTimestamp: Date.now() };
  const jsonString = JSON.stringify(dataToSave);

  if (safeStorage.isEncryptionAvailable()) {
    const encryptedBuffer = safeStorage.encryptString(jsonString);
    await fs.writeFile(TOKEN_PATH, encryptedBuffer);
  } else {
    await fs.writeFile(TOKEN_PATH, jsonString, 'utf-8');
    console.warn('PRECAUCIÓN: Guardado sin cifrar, safeStorage no disponible.');
  }
}

async function loadToken() {
  try {
    const fileData = await fs.readFile(TOKEN_PATH);

    if (safeStorage.isEncryptionAvailable() && Buffer.isBuffer(fileData)) {
      try {
        const decryptedString = safeStorage.decryptString(fileData);
        return JSON.parse(decryptedString)
      } catch (decryptError) {
        return JSON.parse(fileData.toString('utf-8'));
      }
    } else {
      return JSON.parse(fileData.toString('utf-8'));
    }
  } catch (error) {
    throw new Error('NEED_AUTH');
  }
}

export { chatClient, apiClient };