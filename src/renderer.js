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

    // Bloque de sincronización corregido
    if (window.windowAPI && window.windowAPI.onRequestSync) {
        window.windowAPI.onRequestSync(() => {
            console.log("📥 Main solicitó sincronización. Enviando botones actuales...");
            // Si hay un deck cargado, lo enviamos. Si no, enviamos objeto vacío.
            const buttonsToSync = currentDeckData?.buttons || {};
            window.windowAPI.updateButtonsLogic(buttonsToSync);
        }); // <-- Aquí faltaba cerrar esta llave y el paréntesis
    }

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

    document.getElementById('prev-view').onclick = () => {
        currentViewIndex--;
        initDeckHubLogic();
    };

    document.getElementById('next-view').onclick = () => {
        currentViewIndex++;
        initDeckHubLogic();
    };

    document.getElementById('add-view-btn').onclick = () => {
        const newId = Date.now();
        const newDeck = { id: newId, name: "Nuevo Deck", buttons: {} };
        localStorage.setItem(`deck_storage_${newId}`, JSON.stringify(newDeck));
        
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith('deck_storage_')).sort();
        const targetView = Math.ceil(allKeys.length / 4) - 1;
        
        currentViewIndex = targetView;
        initDeckHubLogic();
    };

    document.getElementById('del-view-btn').onclick = () => {
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith('deck_storage_')).sort();
        if (allKeys.length > 0 && confirm("¿Eliminar el último deck creado?")) {
            localStorage.removeItem(allKeys[allKeys.length - 1]);
            const newTotalKeys = allKeys.length - 1;
            const newTotalViews = Math.max(1, Math.ceil(newTotalKeys / 4));
            if (currentViewIndex >= newTotalViews) currentViewIndex = newTotalViews - 1;
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
                    <div class="deck-title-container">
                        <h2 class="deck-title-static">${name}</h2>
                        <small style="color:#666; display:block;">Click Izquierdo: Arrastrar/Redimensionar | Click Derecho: Crear/Eliminar</small>
                    </div>
                </div>
                <div class="header-actions">
                    <button class="back-btn" id="btn-back-hub" style="margin-right: 10px;">⬅ Volver</button>
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
        
        if (window.windowAPI && window.windowAPI.updateButtonsLogic) {
            window.windowAPI.updateButtonsLogic(currentDeckData.buttons);
            console.log("🚀 Botones sincronizados con el motor del Main.");
        }

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

    layer.onmousedown = (e) => {
        if (e.button !== 0) return; 
        
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

async function renderCommandEditor(slotId) {
    const btnData = currentDeckData.buttons[slotId];
    
    let obsHints = '<small>Sin eventos</small>';
    let twitchHints = '<small>Sin eventos</small>';
    
    try {
        const events = await window.windowAPI.getAvailableEvents();
        if (events) {
            if (events.obs && events.obs.length > 0) {
                // CAMBIADO: Ahora llama a window.insertCommand
                obsHints = events.obs.map(ev => 
                    `<div class="event-tag" title="Click para insertar" onclick="window.insertCommand('${ev}', 'obs')">${ev}</div>`
                ).join('');
            }
            if (events.twitch && events.twitch.length > 0) {
                // CAMBIADO: Ahora llama a window.insertCommand
                twitchHints = events.twitch.map(ev => 
                    `<div class="event-tag" title="Click para insertar" onclick="window.insertCommand('${ev}', 'twitch')">${ev}</div>`
                ).join('');
            }
        }
    } catch (err) {
        console.warn("No se pudieron cargar los eventos de ayuda:", err);
    }

    const initialJson = (btnData.commands && btnData.commands.length > 0) 
        ? JSON.stringify(btnData.commands, null, 4) 
        : "[\n    \n]";

    mainContent.innerHTML = `
        <div class="command-editor">
            <div class="editor-top-bar">
                <div class="editor-title">
                    <span style="color: #6a9955; margin-left: 8px; font-family: monospace; font-weight: bold;">//</span>
                    <input type="text" id="edit-btn-label" class="editor-title-input" value="${btnData.label}" spellcheck="false" 
                           style="background: transparent; color: #00a8ff; border: none; outline: none; font-weight: bold; font-size: 1.1rem; font-family: inherit;">
                </div>
                <div class="editor-header-btns">
                     <button class="obs-button" id="btn-test-cmd" style="background-color: #d35400; color: white; font-weight: bold; border: none; padding: 5px 15px; cursor: pointer; border-radius: 4px;">▶ PROBAR</button>
                     <button class="save-btn" id="btn-save-cmd" style="background-color: #006485; color: white; border: none; padding: 5px 15px; cursor: pointer; border-radius: 4px;">Guardar y Salir</button>
                </div>
            </div>

            <div class="command-main-area vscode-theme">
                <div class="editor-help-sidebar">
                    <div class="help-section">
                        <div class="help-title" style="color: #569cd6; font-size: 11px; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #333;">EVENTOS OBS</div>
                        <div class="hints-container">${obsHints}</div>
                    </div>
                    <div class="help-section" style="margin-top: 15px;">
                        <div class="help-title" style="color: #569cd6; font-size: 11px; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #333;">EVENTOS TWITCH</div>
                        <div class="hints-container">${twitchHints}</div>
                    </div>
                </div>

                <div class="code-container">
                    <div id="line-numbers" class="line-numbers"></div>
                    <textarea id="code-editor" class="code-editor-textarea" spellcheck="false" wrap="off">${initialJson}</textarea>
                </div>
            </div>

            <footer class="editor-footer-tools" style="height: 55px; background-color: #252a37; border-top: 1px solid #1a1c23; display: flex; justify-content: center; align-items: center;">
                <div id="json-error-hint" style="color: #f48771; font-size: 11px; position: absolute; left: 20px;"></div>
                <small style="color: #888; font-size: 11px; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">UTF-8 | JSON | MODO AUTO-MAP</small>
            </footer>
        </div>
    `;

    const textarea = document.getElementById('code-editor');
    const lineNumbers = document.getElementById('line-numbers');

    const updateLineNumbers = () => {
        const lines = textarea.value.split('\n').length;
        lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
    };

    textarea.onscroll = () => { lineNumbers.scrollTop = textarea.scrollTop; };
    textarea.oninput = updateLineNumbers;

    textarea.onkeydown = function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.substring(0, start) + "    " + this.value.substring(end);
            this.selectionStart = this.selectionEnd = start + 4;
        }
        setTimeout(updateLineNumbers, 0);
    };

    updateLineNumbers();

    document.getElementById('btn-test-cmd').onclick = () => {
        try {
            const cleanValue = textarea.value.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ').trim();
            const commandsToTest = JSON.parse(cleanValue || "[]");
            
            if (window.windowAPI && window.windowAPI.testCommands) {
                window.windowAPI.testCommands(commandsToTest);
                const btn = document.getElementById('btn-test-cmd');
                btn.innerText = "ENVIADO";
                btn.style.backgroundColor = "#27ae60";
                setTimeout(() => {
                    btn.innerText = "▶ PROBAR";
                    btn.style.backgroundColor = "#d35400";
                }, 1000);
            }
        } catch (err) {
            document.getElementById('json-error-hint').innerText = "⚠️ Error JSON: " + err.message;
            textarea.style.outline = "1px solid #f48771";
        }
    };

    document.getElementById('btn-save-cmd').onclick = () => {
        try {
            const cleanValue = textarea.value.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ').trim();
            btnData.commands = JSON.parse(cleanValue || "[]");
            btnData.label = document.getElementById('edit-btn-label').value;

            if (window.windowAPI && window.windowAPI.updateButtonsLogic) {
                window.windowAPI.updateButtonsLogic(currentDeckData.buttons);
            }

            renderDeckTemplate();
        } catch (err) {
            document.getElementById('json-error-hint').innerText = "⚠️ JSON Inválido";
            textarea.style.outline = "1px solid #f48771";
        }
    };
}

// NUEVO: Función para insertar comandos automáticamente
window.insertCommand = (eventName, service) => {
    const textarea = document.getElementById('code-editor');
    if (!textarea) return;

    const newCommand = {
        trigger: {
            service: service,
            event: eventName
        },
        action: {
            service: service === 'obs' ? 'obs' : 'twitch',
            message: `Ejecutando ${eventName}`
        }
    };

    try {
        let currentVal = textarea.value.trim();
        let jsonArr = JSON.parse(currentVal || "[]");
        jsonArr.push(newCommand);
        textarea.value = JSON.stringify(jsonArr, null, 4);
        
        // Disparar evento para actualizar líneas
        textarea.dispatchEvent(new Event('input'));
    } catch (e) {
        alert("El JSON actual tiene errores. Corrígelo antes de insertar nuevos comandos.");
    }
};
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
    const kickStatus = document.getElementById('kick-status-msg');

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

    // 2. --- ESTADO INICIAL ---
    window.windowAPI.checkOBSStatus();
    
    // Verificar estado de Twitch
    window.windowAPI.getTwitchStatus().then(res => {
        updateTwitchUI(res);
    });

    // NUEVO: Verificar si ya existe el token de Kick guardado en el PC
    window.windowAPI.checkKickStatus().then(res => {
        updateKickUI(res);
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
            btnAuthTwitch.classList.add('connected');
            if (twitchStatus) {
                twitchStatus.innerText = `Conectado como: ${res.username}`;
                twitchStatus.className = "status-label status-connected";
            }
        } else {
            btnAuthTwitch.innerText = "Vincular Cuenta";
            btnAuthTwitch.classList.remove('connected');
            if (twitchStatus) {
                twitchStatus.innerText = "Desconectado";
                twitchStatus.className = "status-label status-disconnected";
            }
        }
    }

    // 5. --- LÓGICA KICK ---
    
    // Función común para actualizar la UI de Kick (igual que la de Twitch)
    function updateKickUI(res) {
        if (!btnAuthKick) return;
        if (res.success) {
            btnAuthKick.innerText = "Cuenta Vinculada";
            btnAuthKick.classList.add('connected');
            if (kickStatus) {
                kickStatus.innerText = "Conectado";
                kickStatus.className = "status-label status-connected";
            }
        } else {
            btnAuthKick.innerText = "Vincular Cuenta";
            btnAuthKick.classList.remove('connected');
            if (kickStatus) {
                kickStatus.innerText = "Desconectado";
                kickStatus.className = "status-label status-disconnected";
            }
        }
    }

    if (btnAuthKick) {
        btnAuthKick.onclick = () => {
            btnAuthKick.innerText = "Conectando...";
            window.windowAPI.sendKickAuth(); 
        };
    }

    // Escuchamos el éxito de la autorización desde el servidor temporal
    window.windowAPI.onKickSuccess(async (data) => {
        console.log("Código recibido, solicitando intercambio por token...");
        
        // Intercambiamos el código por el access_token y lo guardamos en archivo
        const result = await window.windowAPI.getKickToken(data);
        
        // Actualizamos la interfaz con el resultado
        updateKickUI(result);

        if (!result.success) {
            alert("Error al vincular Kick: " + result.error);
        }
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
