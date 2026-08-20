import { RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { ChatClient } from '@twurple/chat';
import { safeStorage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

const TOKEN_PATH = path.join(process.cwd(), 'twitch-tokens.json');

let authProvider;
let apiClient;
let chatClient;

export async function setupTwitch(clientId, clientSecret, mainWindow) {
  try {
    let tokenData;
    
    try {
      tokenData = await loadToken();
    } catch (err) {
      console.log('Esperando vinculación manual: No se encontró twitch-tokens.json');
      return { success: false, error: 'NEED_AUTH' };
    }

    if (!authProvider) {
      authProvider = new RefreshingAuthProvider({
        clientId,
        clientSecret,
        onRefresh: async (userId, newTokenData) => await saveInitialTokens(newTokenData),
      });
    }

    const userId = await authProvider.addUserForToken({
      accessToken: tokenData.access_token || tokenData.accessToken,
      refreshToken: tokenData.refresh_token || tokenData.refreshToken,
      expiresIn: tokenData.expires_in || 0,
      obtainmentTimestamp: tokenData.obtainmentTimestamp || Date.now(),
      scope: tokenData.scope || ['chat:read', 'chat:edit']
    }, ['chat']);

    if (!apiClient) {
      apiClient = new ApiClient({ authProvider });
    }

    let user = null;
    try {
      user = await apiClient.users.getAuthenticatedUser(userId);
    } catch (apiErr) {
      try {
        user = await apiClient.users.getUserById(userId);
      } catch (e2) {
        console.error('Fallo total en API de usuarios');
      }
    }

    if (chatClient && (chatClient.isConnected || chatClient.isConnecting)) {
      return { success: true, username: user ? user.displayName : "Conectado" };
    }

    if (chatClient) {
      try { await chatClient.quit(); } catch (e) {}
    }

    const channelName = user ? user.name : userId;

    chatClient = new ChatClient({ 
      authProvider, 
      channels: [channelName] 
    });

    // Evento de mensajes para que el Main los reciba
    chatClient.onMessage((channel, userMsg, message, msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('twitch-chat-message', { user: userMsg, message });
      }
      
      // AQUÍ SE DISPARARÁ LA AUTOMATIZACIÓN EN EL FUTURO
      // Puedes importar triggerAutomation aquí o manejarlo desde el main
    });

    await chatClient.connect();
    console.log(`¡SISTEMA LISTO! Canal conectado: ${channelName}`);
    
    return { success: true, username: user ? user.displayName : "Conectado" };

  } catch (error) {
    console.error('Error crítico en setupTwitch:', error.message);

    // NUEVO: Manejo específico para caídas de internet
    const isNetworkError = error.message.includes('fetch failed') || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET';
    
    if (isNetworkError) {
      console.warn('⚠️ Problema de red detectado. No se pudo conectar a Twitch.');
      
      // Si la ventana de la interfaz está abierta, le enviamos un aviso
      if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('twitch-status-update', { status: 'DISCONNECTED', error: 'Sin red' });
      }
      
      // Retornamos un código de error específico para que el Main sepa qué pasó
      return { success: false, error: 'NETWORK_ERROR' };
    }

    // Manejo original de tokens inválidos (401)
    if (error.message.includes('401') || error.message.includes('token')) {
      await fs.unlink(TOKEN_PATH).catch(() => {});
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * NUEVA: Función para enviar mensajes al chat
 * @param {string} message - El texto a enviar
 */
export async function sendTwitchMessage(message) {
    try {
        if (!chatClient || !chatClient.isConnected) {
            throw new Error("El chat de Twitch no está conectado.");
        }
        // Obtenemos los canales a los que estamos unidos
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

// Guardamos el token cifrado
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

// Leemos token cifrado
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