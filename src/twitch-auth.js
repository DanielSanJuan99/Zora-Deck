import { RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { ChatClient } from '@twurple/chat';
import { promises as fs } from 'fs';
import path from 'path';

const TOKEN_PATH = path.join(process.cwd(), 'twitch-tokens.json');

let authProvider;
let apiClient;
let chatClient;

/**
 * Inicializa la conexión con Twitch utilizando la sintaxis de la v8.x
 */
export async function setupTwitch(clientId, clientSecret, mainWindow) {
  try {
    let tokenData;
    
    // 1. Cargar archivo de tokens
    try {
      const data = await fs.readFile(TOKEN_PATH, 'utf-8');
      tokenData = JSON.parse(data);
    } catch (err) {
      console.log('Esperando vinculación manual: No se encontró twitch-tokens.json');
      return { success: false, error: 'NEED_AUTH' };
    }

    // 2. Configurar AuthProvider (Solo si no existe)
    if (!authProvider) {
      authProvider = new RefreshingAuthProvider({
        clientId,
        clientSecret,
      });
    }

    // 3. Registrar el usuario
    const userId = await authProvider.addUserForToken({
      accessToken: tokenData.access_token || tokenData.accessToken,
      refreshToken: tokenData.refresh_token || tokenData.refreshToken,
      expiresIn: tokenData.expires_in || 0,
      obtainmentTimestamp: tokenData.obtainmentTimestamp || Date.now(),
      scope: tokenData.scope || ['chat:read', 'chat:edit']
    }, ['chat']);

    // 4. Inicializar ApiClient (Solo si no existe)
    if (!apiClient) {
      apiClient = new ApiClient({ authProvider });
    }

    // 5. OBTENER INFORMACIÓN DEL USUARIO
    let user = null;
    try {
      user = await apiClient.users.getAuthenticatedUser(userId);
    } catch (apiErr) {
      console.warn('apiClient.users.getAuthenticatedUser(userId) falló, intentando getUserById...');
      try {
        user = await apiClient.users.getUserById(userId);
      } catch (e2) {
        console.error('Fallo total en API de usuarios');
      }
    }

    // 6. CONTROL DE CONEXIÓN DEL CHAT
    // Si ya hay un chatClient y está conectado, NO conectamos de nuevo
    if (chatClient && (chatClient.isConnected || chatClient.isConnecting)) {
      console.log('El Chat ya está activo. Omitiendo reconexión.');
      return { 
        success: true, 
        username: user ? user.displayName : "Conectado" 
      };
    }

    // Si había un cliente viejo pero desconectado, lo limpiamos
    if (chatClient) {
      try { await chatClient.quit(); } catch (e) {}
    }

    const channelName = user ? user.name : userId;

    chatClient = new ChatClient({ 
      authProvider, 
      channels: [channelName] 
    });

    // Evento de mensajes
    chatClient.onMessage((channel, userMsg, message) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('twitch-chat-message', { user: userMsg, message });
      }
    });

    await chatClient.connect();
    
    const displayUsername = user ? user.displayName : "Conectado";
    console.log(`¡SISTEMA LISTO! Canal conectado: ${channelName}`);
    
    return { 
      success: true, 
      username: displayUsername 
    };

  } catch (error) {
    console.error('Error crítico en setupTwitch:', error.message);
    
    if (error.message.includes('401') || error.message.includes('token')) {
      await fs.unlink(TOKEN_PATH).catch(() => {});
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Guarda los tokens y añade el timestamp necesario
 */
export async function saveInitialTokens(tokenData) {
  const dataToSave = {
    ...tokenData,
    obtainmentTimestamp: Date.now()
  };
  
  await fs.writeFile(TOKEN_PATH, JSON.stringify(dataToSave, null, 4), 'utf-8');
  console.log('Archivo twitch-tokens.json actualizado correctamente.');
}

export { chatClient, apiClient };