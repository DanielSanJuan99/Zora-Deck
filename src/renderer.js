/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';

/* ============================= */
/* CONTROLES DE VENTANA ELECTRON */
/* ============================= */
window.addEventListener('DOMContentLoaded', () => {
    const btnMinimize = document.getElementById('minimize');
    const btnMaximize = document.getElementById('maximize');
    const btnClose = document.getElementById('close');

    if (btnMinimize) btnMinimize.onclick = () => window.windowAPI.minimize();
    if (btnMaximize) btnMaximize.onclick = () => window.windowAPI.maximize();
    if (btnClose) btnClose.onclick = () => window.windowAPI.close();
});

/* ============================= */
/* MENÚ DESPLEGABLE SUPERIOR     */
/* ============================= */
const menuContainers = document.querySelectorAll('.menu-item-container');

function closeMenus() {
    menuContainers.forEach(c => c.classList.remove('active'));
}

menuContainers.forEach(container => {
    const btn = container.querySelector('.menu-btn');
    btn.addEventListener('click', (e) => {
        const wasActive = container.classList.contains('active');
        closeMenus();
        if (!wasActive) container.classList.add('active');
        e.stopPropagation();
    });
});

document.addEventListener('click', closeMenus);

/* ============================= */
/* CARGA DE PANELES (HTML)       */
/* ============================= */
const mainContent = document.querySelector('.main-content');

async function loadPanel(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Error: ${response.statusText}`);

        const html = await response.text();
        mainContent.innerHTML = html;

        const closeBtn = mainContent.querySelector('[data-close-panel]');
        if (closeBtn) {
            closeBtn.onclick = () => mainContent.innerHTML = '';
        }

        // Si cargamos settings, inicializamos su lógica específica
        if (path.includes('settings.html')) {
            requestAnimationFrame(() => {
                initSettingsLogic();
            });
        }

    } catch (err) {
        console.error('Error cargando panel:', err);
    }
}

/* ============================= */
/* LÓGICA DEL PANEL SETTINGS     */
/* ============================= */

function initSettingsLogic() {
    // --- 1. REFERENCIAS A ELEMENTOS (OBS) ---
    const btnConnect = document.getElementById('btn-connect-obs');
    const statusMsg = document.getElementById('obs-status-msg');
    const inputIp = document.getElementById('obs-ip');
    const inputPort = document.getElementById('obs-port');
    const inputPass = document.getElementById('obs-password');

    // --- 2. REFERENCIAS A ELEMENTOS (TWITCH) ---
    const btnAuthTwitch = document.getElementById('btn-auth-twitch');
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const sections = document.querySelectorAll('.settings-section');

    // --- 3. GESTIÓN DE PESTAÑAS (TABS) ---
    sidebarItems.forEach(item => {
        item.onclick = () => {
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            const target = item.getAttribute('data-tab');
            sections.forEach(sec => {
                if (sec.id === `tab-${target}`) {
                    sec.classList.remove('hidden');
                } else {
                    sec.classList.add('hidden');
                }
            });
        };
    });

    // --- 4. PERSISTENCIA Y ESTADO INICIAL OBS ---
    window.windowAPI.checkOBSStatus();

    const savedConfig = JSON.parse(localStorage.getItem('obs-config') || '{}');
    if (inputIp && savedConfig.ip) inputIp.value = savedConfig.ip;
    if (inputPort && savedConfig.port) inputPort.value = savedConfig.port;
    if (inputPass && savedConfig.password) inputPass.value = savedConfig.password;

    // --- 5. LÓGICA DE CONEXIÓN OBS ---
    if (btnConnect) {
        btnConnect.onclick = () => {
            const config = {
                ip: inputIp.value,
                port: inputPort.value,
                password: inputPass.value
            };
            if (statusMsg) {
                statusMsg.innerText = "Intentando...";
                statusMsg.className = "status-label";
            }
            window.windowAPI.connectOBS(config);
        };
    }

    window.windowAPI.onOBSResponse((resultado) => {
        if (!statusMsg) return;
        if (resultado.success) {
            statusMsg.innerText = "Conectado";
            statusMsg.className = "status-label status-connected";
            const configToSave = { ip: inputIp.value, port: inputPort.value, password: inputPass.value };
            localStorage.setItem('obs-config', JSON.stringify(configToSave));
        } else {
            statusMsg.innerText = "Desconectado";
            statusMsg.className = "status-label status-disconnected";
        }
    });

    // --- 6. LÓGICA DE TWITCH ---

    // Función auxiliar para cambiar el estilo del botón a "Conectado"
    const actualizarBotonTwitchConectado = (username) => {
        const btn = document.getElementById('btn-auth-twitch');
        if (!btn) return;
        btn.innerText = `Conectado: ${username}`;
        btn.style.backgroundColor = "#2e7d32"; 
        btn.disabled = true;
    };

    // Verificación inicial de estado (Persistencia)
    const checkTwitchStatus = async () => {
        if (!btnAuthTwitch) return;
        // Consultamos al Main si ya hay una sesión activa
        const resultado = await window.windowAPI.getTwitchStatus();
        if (resultado.success) {
            actualizarBotonTwitchConectado(resultado.username);
        }
    };

    // Ejecutamos la comprobación nada más cargar el panel
    checkTwitchStatus();

    if (btnAuthTwitch) {
        btnAuthTwitch.onclick = () => {
            console.log("Iniciando vinculación manual...");
            btnAuthTwitch.innerText = "Abriendo ventana...";
            btnAuthTwitch.disabled = true;
            window.windowAPI.twitchLogin();
        };
    }

    // Escucha la respuesta del proceso de login (Main -> Renderer)
    window.windowAPI.onTwitchResponse((resultado) => {
        if (resultado.success) {
            actualizarBotonTwitchConectado(resultado.username);
        } else {
            // Si el usuario cancela o hay error, restauramos el botón
            if (btnAuthTwitch) {
                btnAuthTwitch.innerText = "Vincular Cuenta";
                btnAuthTwitch.style.backgroundColor = ""; 
                btnAuthTwitch.disabled = false;
            }
            if (resultado.error && resultado.error !== 'Ventana cerrada') {
                console.error("Error en Twitch Auth:", resultado.error);
            }
        }
    });
}

/* ============================= */
/* NAVEGACIÓN DEL MENÚ PRINCIPAL */
/* ============================= */
document.getElementById('menu-settings')?.addEventListener('click', () => {
    loadPanel('/src/panels/settings.html');
    closeMenus();
});

document.getElementById('menu-explore')?.addEventListener('click', () => {
    loadPanel('/src/panels/explore.html');
    closeMenus();
});

document.getElementById('menu-addons')?.addEventListener('click', () => {
    loadPanel('/src/panels/addons.html');
    closeMenus();
});