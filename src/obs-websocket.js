import { OBSWebSocket } from 'obs-websocket-js';

// Creamos la instancia única de OBS
const obs = new OBSWebSocket();

let currentIp, currentPort, currentPassword;
let reconnectTimer = null;
let statusCallback = null;

// Registramos callback para avisar a main.js de los cambios de estado
export function setOBSStatusCallback (cb) {
  statusCallback = cb;
}

/**
 * Función para conectar al servidor de OBS
 */
export async function conectarOBS(ip, puerto, password) {
  currentIp = ip;
  currentPort = puerto;
  currentPassword = password;

  try {
    // Validamos que los datos existan antes de intentar la conexión
    const url = `ws://${ip || '127.0.0.1'}:${puerto || '4455'}`;
    await obs.connect(url, password);
    
    console.log('Conectado a OBS satisfactoriamente en ' + url);

    // En caso de entrar en bucle de reconexión, aquí se detiene una vez se conecta exitosamente
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }

    // Mostramos que estamos conectados en la interfaz
    if (statusCallback) statusCallback(true)

    return { success: true };
  } catch (error) {
    console.error('Error de conexión OBS:', error.message);
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
  console.log('Conexión perdida con OBS.');

  // Mostramos que estamos desconectados en la interfaz
  if (statusCallback) statusCallback(false);
  
  // Iniciamos bucle de reconexión cada 5 segundos
  if (!reconnectTimer && currentIp !== undefined) {
    console.log('Iniciando auto-reconexión a OBS...')
    reconnectTimer = setInterval( async () => {
      console.log('Intentando reconectar a OBS')
      await conectarOBS(currentIp, currentPort, currentPassword)
    }, 5000);
  }
});

obs.on('Identified', () => {
  console.log('Servidor OBS identificado y listo para recibir comandos.');
});

// Exportamos la instancia por defecto por si otros archivos la usan así
export default obs;