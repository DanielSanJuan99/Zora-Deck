/* ========================================= */
/* KICK AUTH SERVICE - COMPLETO              */
/* ========================================= */

const KICK_SETTINGS = {
    clientId: '01KEAJFG7MPHRNM2Z6H12DZBP4',
    redirectUri: 'http://localhost:3000/kickauth',
    scopes: ['user:read', 'chat:write'],
    authUrl: 'https://kick.com/oauth/authorize'
};

/**
 * Inicia el proceso de autenticación.
 * No usa window.open porque Kick bloquea navegadores embebidos (Error -105).
 * Delega la creación de la ventana al proceso Main de Electron.
 */
export function authenticateKick() {
    console.log("Kick Auth: Solicitando apertura de ventana nativa...");

    if (window.windowAPI && window.windowAPI.sendKickAuth) {
        // Enviamos los settings al main para asegurar que la URL sea correcta
        const fullUrl = `${KICK_SETTINGS.authUrl}?client_id=${KICK_SETTINGS.clientId}&redirect_uri=${encodeURIComponent(KICK_SETTINGS.redirectUri)}&response_type=code&scope=${encodeURIComponent(KICK_SETTINGS.scopes.join(' '))}`;
        
        window.windowAPI.sendKickAuth(fullUrl);
    } else {
        console.error("Error crítico: windowAPI no expuesto. Revisa preload.js");
    }
}

/**
 * Escucha el éxito de la operación.
 * Cuando el Main captura el token y cierra la ventana, esto se ejecuta.
 */
if (window.windowAPI && window.windowAPI.onKickSuccess) {
    window.windowAPI.onKickSuccess((data) => {
        console.log("Kick Auth: Proceso finalizado con éxito", data);
        // Aquí puedes disparar cualquier actualización visual en el UI
    });
}