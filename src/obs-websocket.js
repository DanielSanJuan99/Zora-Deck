import { OBSWebSocket } from 'obs-websocket-js';

// Creamos la instancia única de OBS
const obs = new OBSWebSocket();

/**
 * Función para conectar al servidor de OBS
 * @param {string} ip - Dirección del servidor (ej. 127.0.0.1)
 * @param {string} puerto - Puerto del servidor (ej. 4455)
 * @param {string} password - Contraseña del websocket
 */
export async function conectarOBS(ip, puerto, password) {
  try {
    // Validamos que los datos existan antes de intentar la conexión
    const url = `ws://${ip || '127.0.0.1'}:${puerto || '4455'}`;
    
    await obs.connect(url, password);
    
    console.log('✅ Conectado a OBS satisfactoriamente en ' + url);
    return { success: true };
  } catch (error) {
    console.error('❌ Error de conexión OBS:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Función para verificar el estado (necesaria para la persistencia visual)
 */
export function estaConectado() {
  return obs.socket && obs.socket.readyState === 1;
}

/**
 * ESCUCHA DE EVENTOS GLOBALES
 * Útil para detectar desconexiones o cambios en OBS
 */
obs.on('ConnectionClosed', () => {
  console.log('⚠️ Conexión perdida con OBS. Reintentando en 5 segundos...');
  // Opcional: podrías disparar una lógica de reconexión automática aquí
});

obs.on('Identified', () => {
  console.log('Servidor OBS identificado y listo para recibir comandos.');
});

// Exportamos la instancia por defecto para poder usarla en otros archivos
export default obs;