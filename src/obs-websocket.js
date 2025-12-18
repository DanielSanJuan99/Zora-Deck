import OBSWebSocket from 'obs-websocket-js';

const obs = new OBSWebSocket();

async function conectarOBS() {
  try {
    // Si desactivaste la clave en OBS, esto es suficiente
    await obs.connect('ws://127.0.0.1:4455');
    console.log('Conectado a OBS');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Escuchar eventos globales (Muy importante para un SAMMI)
obs.on('ConnectionClosed', () => {
  console.log('Conexión perdida con OBS. Reintentando en 5 segundos..g');
  setTimeout(conectarOBS, 5000); // Auto-reconexión básica
});

conectarOBS();