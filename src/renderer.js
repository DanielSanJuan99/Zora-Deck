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

menuContainers.forEach(container => {
  const btn = container.querySelector('.menu-btn');

  btn.addEventListener('click', (e) => {
    const wasActive = container.classList.contains('active');

    menuContainers.forEach(c => c.classList.remove('active'));

    if (!wasActive) container.classList.add('active');

    e.stopPropagation();
  });
});

document.addEventListener('click', () => {
  menuContainers.forEach(c => c.classList.remove('active'));
});

/* ============================= */
/* CARGA DE PANELES (HTML)       */
/* ============================= */

const mainContent = document.querySelector('.main-content');

/**
 * Carga un panel HTML dentro del main-content
 */
async function loadPanel(path) {
  try {
    const response = await fetch(path);
    const html = await response.text();
    mainContent.innerHTML = html;

    // Cerrar panel desde su botón interno
    const closeBtn = mainContent.querySelector('[data-close-panel]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        mainContent.innerHTML = '';
      });
    }

  } catch (err) {
    console.error('Error cargando panel:', err);
  }
}

/* ============================= */
/* BOTONES DEL MENÚ              */
/* ============================= */

// Settings
const btnSettings = document.getElementById('menu-settings');
if (btnSettings) {
  btnSettings.addEventListener('click', () => {
    loadPanel('/src/panels/settings.html');
    closeMenus();
  });
}

// Explore
const btnExplore = document.getElementById('menu-explore');
if (btnExplore) {
  btnExplore.addEventListener('click', () => {
    loadPanel('/src/panels/explore.html');
    closeMenus();
  });
}

// Addons
const btnAddons = document.getElementById('menu-addons');
if (btnAddons) {
  btnAddons.addEventListener('click', () => {
    loadPanel('/src/panels/addons.html');
    closeMenus();
  });
}

/* ============================= */
/* UTILIDAD                      */
/* ============================= */

function closeMenus() {
  menuContainers.forEach(c => c.classList.remove('active'));
}
