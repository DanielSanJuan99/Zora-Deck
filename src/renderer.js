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

console.log(
  '👋 This message is being logged by "renderer.js", included via Vite',
);
window.addEventListener('DOMContentLoaded', () => {
  const btnMinimize = document.getElementById('minimize');
  const btnMaximize = document.getElementById('maximize');
  const btnClose = document.getElementById('close');

  if (btnMinimize) {
    btnMinimize.onclick = () => window.windowAPI.minimize(); // USAR windowAPI
  }

  if (btnMaximize) {
    btnMaximize.onclick = () => window.windowAPI.maximize(); // USAR windowAPI
  }

  if (btnClose) {
    btnClose.onclick = () => window.windowAPI.close(); // USAR windowAPI
  }
});

const menuContainers = document.querySelectorAll('.menu-item-container');

menuContainers.forEach(container => {
  const btn = container.querySelector('.menu-btn');
  
  btn.addEventListener('click', (e) => {
    // Si ya estaba abierto, se cierra; si no, se abre y cierra los demás
    const wasActive = container.classList.contains('active');
    
    menuContainers.forEach(c => c.classList.remove('active'));
    
    if (!wasActive) {
      container.classList.add('active');
    }
    
    e.stopPropagation(); // Evita que el clic llegue al documento
  });
});

// Cerrar menús al hacer clic en cualquier otra parte de la pantalla
document.addEventListener('click', () => {
  menuContainers.forEach(c => c.classList.remove('active'));
});

// Hacer que el "Salir" del menú también funcione
const btnExit = document.getElementById('menu-exit');
if (btnExit) {
  btnExit.addEventListener('click', () => window.windowAPI.close());
}