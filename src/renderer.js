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
    initGlobalStatus();
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

/* ======================================================= */
/* EDITOR DE GRID INTERACTIVO (SAMMI STYLE) - VERSIÓN FINAL */
/* ======================================================= */

function renderDeckTemplate() {
    const { id, name } = currentDeckData;
    
    mainContent.innerHTML = `
        <div class="deck-editor">
            <div class="deck-header">
                <div class="header-info">
                    <div class="deck-title-container">
                        <h2 class="deck-title-static">${name}</h2>
                        <small class="header-subtitle">Click Izquierdo: Abrir Editor | Arrastrar: Mover | Click Derecho: Menú</small>
                    </div>
                </div>
                <div class="header-actions">
                    <button class="back-btn" id="btn-back-hub">⬅ Volver</button>
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
        if (window.windowAPI?.updateButtonsLogic) {
            window.windowAPI.updateButtonsLogic(currentDeckData.buttons);
        }
        const btn = e.currentTarget;
        btn.classList.add('saved-success');
        btn.innerText = "¡Guardado!";
        setTimeout(() => {
            btn.classList.remove('saved-success');
            btn.innerText = "Guardar Cambios";
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

        const onMouseMove = (moveEvent) => {
            const rect = grid.getBoundingClientRect();
            const cellSize = rect.width / 10;
            const deltaX = Math.round((moveEvent.clientX - startX) / cellSize);
            const deltaY = Math.round((moveEvent.clientY - startY) / cellSize);

            if (deltaX !== 0 || deltaY !== 0) activeBtn.classList.add('was-dragging');

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
    
    mainContent.innerHTML = `
        <div class="command-editor">
            <div class="editor-top-bar">
                <div class="editor-title">
                    <span class="title-prefix">//</span>
                    <input type="text" id="edit-btn-label" class="editor-title-input" value="${btnData.label}" spellcheck="false">
                </div>
                <div class="editor-header-btns">
                     <button class="btn-test" id="btn-test-cmd">▶ PROBAR</button>
                     <button class="btn-save" id="btn-save-cmd">Guardar y Salir</button>
                </div>
            </div>

            <div class="command-main-area">
                <div class="editor-help-sidebar">
                    <div class="search-box-container">
                        <input type="text" id="event-search" placeholder="🔍 Buscar eventos..." autocomplete="off">
                    </div>
                    <div id="events-accordion" class="events-list"></div>
                </div>

                <div class="code-container">
                    <div id="line-numbers" class="line-numbers"></div>
                    <textarea id="code-editor" class="code-editor-textarea" spellcheck="false" wrap="off">${JSON.stringify(btnData.commands || [], null, 4)}</textarea>
                </div>
            </div>

            <footer class="editor-footer-tools">
                <div id="json-error-hint" class="error-hint"></div>
                <small class="footer-info">UTF-8 | JSON | ESTRUCTURA JERÁRQUICA</small>
            </footer>
        </div>
    `;

    const textarea = document.getElementById('code-editor');
    const lineNumbers = document.getElementById('line-numbers');
    const searchInput = document.getElementById('event-search');

    const availableEvents = await window.windowAPI.getAvailableEvents();
    const allEvents = [
        ...(availableEvents.obs || []).map(e => ({ ...e, service: 'obs' })),
        ...(availableEvents.twitch || []).map(e => ({ ...e, service: 'twitch' }))
    ];

    const renderCategorizedEvents = (filter = "") => {
        const accordion = document.getElementById('events-accordion');
        if (!accordion) return;
        accordion.innerHTML = "";
        
        const tree = {};

        allEvents.forEach(ev => {
            const name = ev.triggerName || "Evento";
            if (!filter || name.toLowerCase().includes(filter.toLowerCase())) {
                const cat = (ev.category || ev.service || "Otros").toUpperCase();
                const sub = ev.subCategory || "General";
                if (!tree[cat]) tree[cat] = {};
                if (!tree[cat][sub]) tree[cat][sub] = [];
                tree[cat][sub].push(ev);
            }
        });

        Object.entries(tree).forEach(([catName, subs]) => {
            const catGroup = document.createElement('div');
            const isCatOpen = filter.length > 0;
            const serviceKey = catName.toLowerCase().includes('twitch') ? 'twitch' : (catName.toLowerCase().includes('obs') ? 'obs' : 'default');
            
            catGroup.className = "category-group";
            catGroup.innerHTML = `
                <div class="category-header" data-service="${serviceKey}">
                    <span class="arrow ${isCatOpen ? 'open' : ''}">▶</span>
                    <span class="cat-label">${catName}</span>
                </div>
                <div class="category-content" style="display: ${isCatOpen ? 'block' : 'none'};"></div>
            `;

            const catContent = catGroup.querySelector('.category-content');
            const catArrow = catGroup.querySelector('.arrow');

            Object.entries(subs).forEach(([subName, items]) => {
                const subGroup = document.createElement('div');
                subGroup.className = "subcategory-group";
                subGroup.innerHTML = `
                    <div class="subcategory-header">
                        <span class="arrow-sub ${isCatOpen ? 'open' : ''}">▶</span>
                        <span class="sub-label">${subName}</span>
                    </div>
                    <div class="subcategory-content" style="display: ${isCatOpen ? 'block' : 'none'};"></div>
                `;

                const subContent = subGroup.querySelector('.subcategory-content');
                const subArrow = subGroup.querySelector('.arrow-sub');

                items.forEach(ev => {
                    const item = document.createElement('div');
                    item.className = "event-item";
                    item.innerText = ev.triggerName;
                    item.draggable = true;
                    item.onclick = () => window.insertCommand(ev.triggerName, ev.service || catName.toLowerCase());
                    item.ondragstart = (e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({event: ev.triggerName, service: ev.service || catName.toLowerCase()}));
                    };
                    subContent.appendChild(item);
                });

                subGroup.querySelector('.subcategory-header').onclick = (e) => {
                    e.stopPropagation();
                    const isOpen = subContent.style.display !== "none";
                    subContent.style.display = isOpen ? "none" : "block";
                    subArrow.classList.toggle('open', !isOpen);
                };
                catContent.appendChild(subGroup);
            });

            catGroup.querySelector('.category-header').onclick = () => {
                const isOpen = catContent.style.display !== "none";
                catContent.style.display = isOpen ? "none" : "block";
                catArrow.classList.toggle('open', !isOpen);
            };
            accordion.appendChild(catGroup);
        });
    };

    renderCategorizedEvents();
    searchInput.oninput = (e) => renderCategorizedEvents(e.target.value);

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
            this.value = this.value.substring(0, start) + "    " + this.value.substring(this.selectionEnd);
            this.selectionEnd = start + 4;
        }
        setTimeout(updateLineNumbers, 0);
    };

    updateLineNumbers();

    document.getElementById('btn-test-cmd').onclick = () => {
        try {
            const cmd = JSON.parse(textarea.value.trim() || "[]");
            if (window.windowAPI?.testCommands) window.windowAPI.testCommands(cmd);
        } catch (e) { document.getElementById('json-error-hint').innerText = "⚠️ Error JSON"; }
    };

    document.getElementById('btn-save-cmd').onclick = () => {
        try {
            btnData.commands = JSON.parse(textarea.value.trim() || "[]");
            btnData.label = document.getElementById('edit-btn-label').value;
            renderDeckTemplate();
        } catch (e) { document.getElementById('json-error-hint').innerText = "⚠️ JSON Inválido"; }
    };
}

window.insertCommand = (eventName, service) => {
    const textarea = document.getElementById('code-editor');
    if (!textarea) return;
    const newCmd = {
        trigger: { service, event: eventName },
        action: { service, message: `Ejecutando ${eventName}` }
    };
    try {
        let json = JSON.parse(textarea.value.trim() || "[]");
        json.push(newCmd);
        textarea.value = JSON.stringify(json, null, 4);
        textarea.dispatchEvent(new Event('input'));
    } catch (e) { alert("Arregla el JSON antes de añadir más."); }
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

/* ============================= */
/* ESTADO GLOBAL (STATUS BAR)    */
/* ============================= */
function initGlobalStatus() {
    const iconObs = document.getElementById('global-status-obs');
    const iconTwitch = document.getElementById('global-status-twitch');
    const iconKick = document.getElementById('global-status-kick');

    function updateIcon(element, isConnected, serviceName, details = "") {
        if (!element) return;
        if (isConnected) {
            element.classList.add('connected');
            element.classList.remove('disconnected');
            element.title = `${serviceName}: Conectado ${details ? '(' + details + ')' : ''}`;
        } else {
            element.classList.remove('connected');
            element.classList.add('disconnected');
            element.title = `${serviceName}: Desconectado`;
        }
    }

    // Consultar el estado apenas arranca la app
    window.windowAPI.getTwitchStatus().then(res => updateIcon(iconTwitch, res.success, "Twitch", res.username));
    window.windowAPI.checkKickStatus().then(res => updateIcon(iconKick, res.success, "Kick"));
    window.windowAPI.checkOBSStatus();

    // Actualizar automáticamente si se vincula/desvincula desde Ajustes
    window.windowAPI.onOBSResponse((res) => updateIcon(iconObs, res.success, "OBS"));
    window.windowAPI.onTwitchResponse((res) => updateIcon(iconTwitch, res.success, "Twitch", res.username));
    window.windowAPI.onKickSuccess(() => {
        window.windowAPI.checkKickStatus().then(data => updateIcon(iconKick, data.success, "Kick"));
    });
}