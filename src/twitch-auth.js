import { RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { ChatClient } from '@twurple/chat';
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
      const data = await fs.readFile(TOKEN_PATH, 'utf-8');
      tokenData = JSON.parse(data);
    } catch (err) {
      console.log('Esperando vinculación manual: No se encontró twitch-tokens.json');
      return { success: false, error: 'NEED_AUTH' };
    }

    if (!authProvider) {
      authProvider = new RefreshingAuthProvider({
        clientId,
        clientSecret,
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

export async function saveInitialTokens(tokenData) {
  const dataToSave = { ...tokenData, obtainmentTimestamp: Date.now() };
  await fs.writeFile(TOKEN_PATH, JSON.stringify(dataToSave, null, 4), 'utf-8');
}

export { chatClient, apiClient };