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
import { authenticateKick } from './kick-auth.js';
// Estado global para manejar el Deck actual
let currentDeckData = {
    id: null,
    name: "", 
    buttons: {} 
};

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

    initDeckHubLogic();
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
/* CARGA DE PANELES (OVERLAY)    */
/* ============================= */
async function loadPanel(path) {
    try {
        const existingPanel = document.getElementById('panel-overlay');
        if (existingPanel) existingPanel.remove();

        const response = await fetch(path);
        if (!response.ok) throw new Error(`Error: ${response.statusText}`);

        const html = await response.text();
        const panelOverlay = document.createElement('div');
        panelOverlay.id = 'panel-overlay';
        panelOverlay.innerHTML = html;
        document.body.appendChild(panelOverlay);

        const closeBtn = panelOverlay.querySelector('[data-close-panel]');
        if (closeBtn) closeBtn.onclick = () => panelOverlay.remove();

        if (path.includes('settings.html')) requestAnimationFrame(() => initSettingsLogic());
    } catch (err) {
        console.error('Error cargando panel:', err);
    }
}

/* ======================================= */
/* LÓGICA DEL HUB DE DECKS (ACTUALIZADA)   */
/* ======================================= */

const mainContent = document.querySelector('.main-content');
let currentViewIndex = 0; 

function initDeckHubLogic() {
    // 1. Obtener y ordenar decks
    const allKeys = Object.keys(localStorage)
        .filter(k => k.startsWith('deck_storage_'))
        .sort(); 

    const totalViews = Math.max(1, Math.ceil(allKeys.length / 4));

    // 2. Ajustes de seguridad (Evitar páginas vacías)
    if (currentViewIndex >= totalViews) currentViewIndex = totalViews - 1;
    if (currentViewIndex < 0) currentViewIndex = 0;

    // 3. Selección de decks para la vista actual (4 por página)
    const start = currentViewIndex * 4;
    const keysInView = allKeys.slice(start, start + 4);

    // 4. Renderizar HTML
    mainContent.innerHTML = `
        <div class="hub-container">
            <div class="deck-grid">
                ${keysInView.map(key => {
                    const data = JSON.parse(localStorage.getItem(key));
                    const id = key.replace('deck_storage_', '');
                    return `
                        <div class="deck-item" data-deck="${id}">
                            <div class="deck-icon">🖼️</div>
                            <div class="deck-content">
                                <input type="text" class="hub-name-input" value="${data.name || 'Sin nombre'}" spellcheck="false">
                                <p>Configurar comandos y macros</p>
                            </div>
                            <div class="deck-footer">HABILITADO</div>
                        </div>
                    `;
                }).join('')}
            </div>

            <footer class="hub-footer">
                <div class="view-navigator">
                    <button class="nav-btn" id="prev-view" ${currentViewIndex === 0 ? 'disabled' : ''}> < </button>
                    
                    <button class="v-btn del" id="del-view-btn" title="Eliminar último Deck">-</button>
                    
                    <div class="view-info">
                        VISTA ${currentViewIndex + 1} / ${totalViews}
                    </div>
                    
                    <button class="v-btn add" id="add-view-btn" title="Añadir Nuevo Deck">+</button>
                    
                    <button class="nav-btn" id="next-view" ${currentViewIndex >= totalViews - 1 ? 'disabled' : ''}> > </button>
                </div>
            </footer>
        </div>
    `;

    setupHubListeners();
}

function setupHubListeners() {
    const deckItems = document.querySelectorAll('.deck-item');
    deckItems.forEach(item => {
        const id = item.getAttribute('data-deck');
        const input = item.querySelector('.hub-name-input');

        item.onclick = (e) => {
            if (e.target !== input) {
                openDeck(id, input.value);
            }
        };

        input.onchange = (e) => {
            let data = JSON.parse(localStorage.getItem(`deck_storage_${id}`) || '{"buttons":{}}');
            data.id = id;
            data.name = e.target.value;
            localStorage.setItem(`deck_storage_${id}`, JSON.stringify(data));
        };

        input.onclick = (e) => e.stopPropagation();
    });

    // --- Lógica del Navigator (Footer) ---
    
    document.getElementById('prev-view').onclick = () => {
        currentViewIndex--;
        initDeckHubLogic();
    };

    document.getElementById('next-view').onclick = () => {
        currentViewIndex++;
        initDeckHubLogic();
    };

    // Botón + (Crear y saltar a la página nueva si es necesario)
    document.getElementById('add-view-btn').onclick = () => {
        const newId = Date.now();
        const newDeck = { id: newId, name: "Nuevo Deck", buttons: {} };
        localStorage.setItem(`deck_storage_${newId}`, JSON.stringify(newDeck));
        
        // Recalcular para saltar a la página donde se creó el deck
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith('deck_storage_')).sort();
        const targetView = Math.ceil(allKeys.length / 4) - 1;
        
        currentViewIndex = targetView;
        initDeckHubLogic();
    };

    // Botón - (Eliminar y retroceder página si queda vacía)
    document.getElementById('del-view-btn').onclick = () => {
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith('deck_storage_')).sort();
        if (allKeys.length > 0 && confirm("¿Eliminar el último deck creado?")) {
            localStorage.removeItem(allKeys[allKeys.length - 1]);
            
            // Recalcular si la página actual se quedó sin decks
            const newTotalKeys = allKeys.length - 1;
            const newTotalViews = Math.max(1, Math.ceil(newTotalKeys / 4));
            
            if (currentViewIndex >= newTotalViews) {
                currentViewIndex = newTotalViews - 1;
            }
            
            initDeckHubLogic();
        }
    };
}

function openDeck(id, defaultName) {
    const savedData = localStorage.getItem(`deck_storage_${id}`);
    if (savedData) {
        currentDeckData = JSON.parse(savedData);
        currentDeckData.id = id; 
    } else {
        currentDeckData = { id, name: defaultName, buttons: {} };
    }
    renderDeckTemplate();
}
/* ======================================= */
/* EDITOR DE GRID INTERACTIVO (SAMMI STYLE) */
/* ======================================= */

function renderDeckTemplate() {
    const { id, name } = currentDeckData;
    
    mainContent.innerHTML = `
        <div class="deck-editor">
            <div class="deck-header">
                <div class="header-info">
                    <button class="back-btn" id="btn-back-hub">⬅ Volver</button>
                    <div class="deck-title-container">
                        <h2 class="deck-title-static">${name}</h2>
                        <small style="color:#666; display:block;">Click Izquierdo: Arrastrar/Redimensionar | Click Derecho: Crear/Eliminar</small>
                    </div>
                </div>
                <div class="header-actions">
                    <button class="save-btn" id="btn-save-grid">Guardar Cambios</button>
                </div>
            </div>

            <div class="grid-container" id="main-grid">
                <div class="grid-background-layer">
                    ${Array.from({ length: 80 }, () => `<div class="grid-slot"></div>`).join('')}
                </div>
                <div id="buttons-layer" class="buttons-layer"></div>
            </div>

            <div id="grid-context-menu" class="context-menu hidden">
                <button id="menu-action-create">Crear Botón</button>
                <button id="menu-action-delete" class="danger">Eliminar Botón</button>
            </div>
        </div>
    `;

    renderAllButtons();
    setupInteractiveEvents();

    document.getElementById('btn-save-grid').onclick = (e) => {
        localStorage.setItem(`deck_storage_${currentDeckData.id}`, JSON.stringify(currentDeckData));
        const btn = e.currentTarget;
        btn.innerText = "¡Guardado!";
        btn.style.backgroundColor = "#4cd137";
        setTimeout(() => {
            btn.innerText = "Guardar Cambios";
            btn.style.backgroundColor = "";
        }, 1500);
    };

    document.getElementById('btn-back-hub').onclick = initDeckHubLogic;
}

function renderAllButtons() {
    const layer = document.getElementById('buttons-layer');
    if (!layer) return;
    layer.innerHTML = '';
    
    Object.keys(currentDeckData.buttons).forEach(btnId => {
        const btnData = currentDeckData.buttons[btnId];
        // Migración: Asegurar coordenadas si no existen
        if (!btnData.x) { btnData.x = 1; btnData.y = 1; btnData.w = 1; btnData.h = 1; }
        drawButton(layer, btnId, btnData);
    });
}

function drawButton(container, id, data) {
    const btnEl = document.createElement('div');
    btnEl.className = 'grid-button';
    btnEl.id = id;
    
    btnEl.style.gridColumn = `${data.x} / span ${data.w}`;
    btnEl.style.gridRow = `${data.y} / span ${data.h}`;
    
    btnEl.innerHTML = `
        <div class="button-text">${data.label}</div>
        <div class="button-type">MACRO</div>
        <div class="resize-handle"></div>
    `;

    // Solo abre el editor si NO se estaba arrastrando
    btnEl.onmouseup = (e) => {
        if (e.button === 0 && !btnEl.classList.contains('was-dragging')) {
            renderCommandEditor(id);
        }
    };

    container.appendChild(btnEl);
}

function setupInteractiveEvents() {
    const grid = document.getElementById('main-grid');
    const layer = document.getElementById('buttons-layer');
    const contextMenu = document.getElementById('grid-context-menu');
    
    let activeBtn = null;
    let isResizing = false;
    let startX, startY, initialW, initialH, initialX, initialY;

    // EVENTO PRINCIPAL: DETECTAR CLICK INICIAL
    layer.onmousedown = (e) => {
        if (e.button !== 0) return; // Solo click izquierdo
        
        const btn = e.target.closest('.grid-button');
        if (!btn) return;

        e.preventDefault();
        activeBtn = btn;
        const btnData = currentDeckData.buttons[btn.id];
        
        isResizing = e.target.classList.contains('resize-handle');
        activeBtn.classList.add('dragging');
        activeBtn.classList.remove('was-dragging');

        startX = e.clientX;
        startY = e.clientY;
        initialX = btnData.x;
        initialY = btnData.y;
        initialW = btnData.w;
        initialH = btnData.h;

        const rect = grid.getBoundingClientRect();
        const cellSize = rect.width / 10;

        // SEGUIMIENTO GLOBAL DEL MOUSE
        const onMouseMove = (moveEvent) => {
            const deltaX = Math.round((moveEvent.clientX - startX) / cellSize);
            const deltaY = Math.round((moveEvent.clientY - startY) / cellSize);

            if (deltaX !== 0 || deltaY !== 0) {
                activeBtn.classList.add('was-dragging');
            }

            if (isResizing) {
                btnData.w = Math.max(1, initialW + deltaX);
                btnData.h = Math.max(1, initialH + deltaY);
            } else {
                btnData.x = Math.max(1, Math.min(11 - btnData.w, initialX + deltaX));
                btnData.y = Math.max(1, initialY + deltaY);
            }

            activeBtn.style.gridColumn = `${btnData.x} / span ${btnData.w}`;
            activeBtn.style.gridRow = `${btnData.y} / span ${btnData.h}`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (activeBtn) activeBtn.classList.remove('dragging');
            activeBtn = null;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // CLICK DERECHO PARA ACCIONES
    grid.oncontextmenu = (e) => {
        e.preventDefault();
        const btn = e.target.closest('.grid-button');
        const rect = grid.getBoundingClientRect();
        const cellW = rect.width / 10;
        
        const clickX = Math.floor((e.clientX - rect.left) / cellW) + 1;
        const clickY = Math.floor((e.clientY - rect.top) / cellW) + 1;

        contextMenu.style.top = `${e.pageY}px`;
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.classList.remove('hidden');

        document.getElementById('menu-action-create').onclick = () => {
            const id = `btn_${Date.now()}`;
            currentDeckData.buttons[id] = { label: "Nuevo", x: clickX, y: clickY, w: 1, h: 1, commands: [] };
            renderAllButtons();
        };

        document.getElementById('menu-action-delete').onclick = () => {
            if (btn) {
                delete currentDeckData.buttons[btn.id];
                renderAllButtons();
            }
        };
    };

    document.addEventListener('click', () => contextMenu.classList.add('hidden'));
}
/* ============================= */
/* EDITOR DE COMANDOS            */
/* ============================= */
function renderCommandEditor(slotId) {
    const btnData = currentDeckData.buttons[slotId];
    mainContent.innerHTML = `
        <div class="command-editor">
            <div class="editor-top-bar">
                <div class="editor-title">
                    <input type="text" id="edit-btn-label" class="invisible-title-input" value="${btnData.label}" spellcheck="false">
                </div>
                <div class="editor-header-btns">
                     <button class="obs-button" id="btn-cancel-cmd">Cancelar</button>
                     <button class="save-btn" id="btn-save-cmd">Guardar y Salir</button>
                </div>
            </div>
            <div class="command-main-area">
                <div class="command-list" id="command-list-container">
                    <div class="empty-commands">No hay comandos. Usa el panel inferior.</div>
                </div>
            </div>
            <div class="editor-footer-tools">
                <button class="footer-btn">+ Añadir Comando</button>
                <button class="footer-btn danger">Eliminar Seleccionado</button>
            </div>
        </div>
    `;

    document.getElementById('btn-save-cmd').onclick = () => {
        btnData.label = document.getElementById('edit-btn-label').value;
        renderDeckTemplate();
    };
    document.getElementById('btn-cancel-cmd').onclick = () => renderDeckTemplate();
}
/* ============================= */
/* LÓGICA DE SETTINGS            */
/* ============================= */
function initSettingsLogic() {
    const btnConnect = document.getElementById('btn-connect-obs');
    const statusMsg = document.getElementById('obs-status-msg');
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const sections = document.querySelectorAll('.settings-section');

    // Botones de Servicios
    const btnAuthTwitch = document.getElementById('btn-auth-twitch');
    const twitchStatus = document.getElementById('twitch-status-msg');
    const btnAuthKick = document.getElementById('btn-auth-kick');
    const kickStatus = document.getElementById('kick-status-msg'); // Asumiendo que tienes este ID en el HTML

    // 1. Navegación de pestañas interna
    sidebarItems.forEach(item => {
        item.onclick = () => {
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const target = item.getAttribute('data-tab');
            sections.forEach(sec => {
                sec.id === `tab-${target}` ? sec.classList.remove('hidden') : sec.classList.add('hidden');
            });
        };
    });

    // 2. --- ESTADO INICIAL (Verificar conexiones al cargar el panel) ---
    window.windowAPI.checkOBSStatus();
    
    // Verificar si Twitch ya está conectado
    window.windowAPI.getTwitchStatus().then(res => {
        updateTwitchUI(res);
    });

    // 3. --- LÓGICA OBS ---
    if (btnConnect) {
        btnConnect.onclick = () => {
            const config = { 
                ip: document.getElementById('obs-ip').value, 
                port: document.getElementById('obs-port').value, 
                password: document.getElementById('obs-password').value 
            };
            window.windowAPI.connectOBS(config);
        };
    }

    window.windowAPI.onOBSResponse((res) => {
        if (!statusMsg) return;
        statusMsg.innerText = res.success ? "Conectado" : "Desconectado";
        statusMsg.className = res.success ? "status-label status-connected" : "status-label status-disconnected";
        if (res.success) {
            localStorage.setItem('obs-config', JSON.stringify({
                ip: document.getElementById('obs-ip').value,
                port: document.getElementById('obs-port').value,
                password: document.getElementById('obs-password').value
            }));
        }
    });

    // 4. --- LÓGICA TWITCH ---
    if (btnAuthTwitch) {
        btnAuthTwitch.onclick = () => {
            btnAuthTwitch.innerText = "Conectando...";
            window.windowAPI.sendTwitchAuth(); 
        };
    }

    window.windowAPI.onTwitchResponse((res) => {
        updateTwitchUI(res);
    });

    function updateTwitchUI(res) {
        if (!btnAuthTwitch) return;
        if (res.success) {
            btnAuthTwitch.innerText = "Cuenta Vinculada";
            btnAuthTwitch.classList.add('connected'); // Opcional para CSS
            if (twitchStatus) {
                twitchStatus.innerText = `Conectado como: ${res.username}`;
                twitchStatus.className = "status-label status-connected";
            }
        } else {
            btnAuthTwitch.innerText = "Vincular Cuenta";
            if (twitchStatus) {
                twitchStatus.innerText = "Desconectado";
                twitchStatus.className = "status-label status-disconnected";
            }
        }
    }

    // 5. --- LÓGICA KICK ---
    if (btnAuthKick) {
        btnAuthKick.onclick = () => {
            btnAuthKick.innerText = "Abriendo Kick...";
            authenticateKick(); 
        };
    }

    // Escuchamos el éxito de Kick desde el Main
    window.windowAPI.onKickSuccess((data) => {
        if (btnAuthKick) {
            btnAuthKick.innerText = "Kick Vinculado";
            btnAuthKick.style.backgroundColor = "#53fc18"; // Color verde neón de Kick
            btnAuthKick.style.color = "#000";
        }
        if (kickStatus) {
            kickStatus.innerText = "Sesión Iniciada";
            kickStatus.className = "status-label status-connected";
        }
        console.log("Código de Kick recibido:", data.code);
    });
}
/* ============================= */
/* NAVEGACIÓN GENERAL            */
/* ============================= */
document.getElementById('menu-settings')?.addEventListener('click', () => {
    loadPanel('/src/panels/settings.html');
    closeMenus();
});

document.getElementById('menu-explore')?.addEventListener('click', () => {
    loadPanel('/src/panels/explore.html');
});

document.getElementById('menu-addons')?.addEventListener('click', () => {
    loadPanel('/src/panels/addons.html');
});