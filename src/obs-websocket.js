import { OBSWebSocket } from 'obs-websocket-js';

// Creamos la instancia única de OBS
const obs = new OBSWebSocket();

/**
 * Función para conectar al servidor de OBS
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
  // Verificamos si existe el socket y si su estado es OPEN (1)
  return obs.socket && obs.socket.readyState === 1;
}

/**
 * NUEVA: Función para obtener la instancia de OBS (Para el Motor de Automatización)
 * Esto soluciona el error en main.js
 */
export function getOBSInstance() {
  return obs;
}

/**
 * ESCUCHA DE EVENTOS GLOBALES
 */
obs.on('ConnectionClosed', () => {
  console.log('⚠️ Conexión perdida con OBS.');
});

obs.on('Identified', () => {
  console.log('Servidor OBS identificado y listo para recibir comandos.');
});

// Exportamos la instancia por defecto por si otros archivos la usan así
export default obs;