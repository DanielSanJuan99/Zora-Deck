# Zora-Deck — Documentación Técnica Completa

> Aplicación de escritorio tipo Stream Deck construida con **Electron + Vite**.  
> Permite a streamers crear botones visuales que disparan automatizaciones (macros)
> en respuesta a eventos de OBS, Twitch y Kick.

---

## Tabla de Contenidos

1. [Arquitectura General](#1-arquitectura-general)
2. [Estructura de Archivos](#2-estructura-de-archivos)
3. [Proceso Principal — main.js](#3-proceso-principal--mainjs)
4. [Módulo OBS WebSocket — obs-websocket.js](#4-módulo-obs-websocket)
5. [Módulo Twitch Auth — twitch-auth.js](#5-módulo-twitch-auth)
6. [Módulo Kick Auth — kick-auth.js](#6-módulo-kick-auth)
7. [Puente de Comunicación — preload.js](#7-puente-de-comunicación--preloadjs)
8. [Interfaz de Usuario — renderer.js](#8-interfaz-de-usuario--rendererjs)
9. [Configuración de Eventos — JSONs](#9-configuración-de-eventos--archivos-json)
10. [Flujo Completo de una Macro](#10-flujo-completo-de-una-macro)
11. [Plan de Mejoras — Desarrollo](#11-plan-de-mejoras--desarrollo)
12. [Plan de Mejoras — Seguridad](#12-plan-de-mejoras--seguridad)

---

## 1. Arquitectura General

Zora-Deck sigue la arquitectura estándar de Electron con separación estricta entre procesos:

```text
┌─────────────────────────────────────────────────────┐
│ PROCESO PRINCIPAL (main.js)                         │
│ Node.js completo — acceso a filesystem, red, APIs   │
│                                                     │
│ ┌──────────────┐ ┌─────────────┐ ┌─────────────┐    │
│ │obs-websocket │ │ twitch-auth │ │ kick-auth   │    │
│ └──────────────┘ └─────────────┘ └─────────────┘    │
└───────────────────────┬─────────────────────────────┘
             IPC (ipcMain / ipcRenderer)
                 ┌──────┴──────┐
                 │ preload.js  │ ← Puente seguro (contextBridge)
                 └──────┬──────┘
┌───────────────────────┴─────────────────────────────┐
│ PROCESO RENDERER (renderer.js)                      │
│ Entorno browser — sin acceso directo a Node.js      │
│ Hub de Decks → Editor de Grid → Editor de Comandos  │
└─────────────────────────────────────────────────────┘
```

La comunicación entre procesos ocurre únicamente a través de `ipcMain`/`ipcRenderer`,
con `contextBridge` como intermediario (`contextIsolation: true`). Los datos de los
Decks se persisten en `localStorage` del renderer y se sincronizan al proceso principal
cada vez que el usuario guarda cambios.

---

## 2. Estructura de Archivos

```text
Zora-Deck/
├── src/
│ ├── main.js # Proceso principal de Electron
│ ├── renderer.js # Lógica de la interfaz de usuario
│ ├── preload.js # Puente IPC seguro (contextBridge)
│ ├── obs-websocket.js # Módulo de conexión a OBS
│ ├── twitch-auth.js # Módulo de autenticación y chat de Twitch
│ ├── kick-auth.js # Módulo de autenticación de Kick
│ ├── index.css # Estilos globales de la aplicación
│ ├── config/
│ │ ├── obs-events.json # Lista de eventos de OBS disponibles
│ │ └── twitch-events.json # Lista de eventos de Twitch disponibles
│ └── panels/
│ ├── settings.html # Panel de configuración de servicios
│ ├── explore.html # Panel Explore (sin implementar)
│ └── addons.html # Panel Addons (sin implementar)
├── index.html # HTML raíz de la ventana principal
├── package.json # Dependencias y scripts
├── forge.config.js # Config de Electron Forge (builds)
├── vite.main.config.mjs
├── vite.preload.config.mjs
├── vite.renderer.config.mjs
└── twitch-tokens.json # Tokens OAuth de Twitch (runtime)
```

---

## 3. Proceso Principal — `main.js`

Es el núcleo de la aplicación. Corre en Node.js con acceso completo al sistema.
Gestiona todas las integraciones externas, el motor de automatización y la comunicación
con la interfaz.

### 3.1 Configuración de Rutas Dinámicas

```js
const isDev = !app.isPackaged;
const CONFIG_FOLDER = isDev
    ? path.join(process.cwd(), 'src', 'config')
    : path.join(process.cwd(), 'config');
```

Detecta si la app corre en modo desarrollo o como ejecutable empaquetado y ajusta las
rutas de los archivos de configuración. Si la carpeta no existe, la crea automáticamente.

### 3.2 `loadConfigList(filePath)`

Función utilitaria que lee un archivo JSON y lo retorna como array. Si el archivo no
existe lo crea vacío (`[]`). Si hay error de parseo, retorna array vacío para evitar
fallos críticos. Se llama al iniciar y cada vez que se conecta OBS o Twitch para
recargar la lista de eventos.

### 3.3 Motor de Automatización

#### `executeMacro(commands)`

Itera sobre un array de comandos y los ejecuta en secuencia. Soporta dos tipos:

- **`service: 'twitch'`** → llama a `sendTwitchMessage(action.message)`
- **`service: 'obs'`** → llama a `obs.call(action.command, action.args)`

Cada acción está en `try/catch` para que un fallo no detenga el resto.
También se invoca directamente al presionar **"▶ PROBAR"** en el editor.

#### `triggerAutomation(platform, eventName, eventData)`

Dispatcher de eventos. Cuando llega un evento externo:
1. Recorre todos los botones activos (`currentButtonsData`).
2. Filtra los comandos cuyo `trigger.service` y `trigger.event` coincidan.
3. Si hay coincidencias, llama a `executeMacro` con los comandos del botón.
Soporta condiciones adicionales: si la plataforma es `obs` y hay `condition.inputKind`,
verifica que el dato del evento también coincida.

La lista de botones se sincroniza desde el renderer al guardar el deck:

```js
ipcMain.on('update-buttons-logic', (event, buttons) => {
    currentButtonsData = Object.values(buttons);
});
```

### 3.4 Integración OBS

**`obs:connect-request`** — Recibe IP, puerto y contraseña desde Settings. Si conecta
exitosamente, registra dinámicamente todos los listeners de `obs-events.json`.
Cada evento llama a `triggerAutomation('obs', triggerName, data)`.

**`get-available-events`** — Recarga los JSONs y los devuelve al renderer para
poblar el acordeón del editor de comandos.

### 3.5 Integración Twitch

**`twitch:get-status`** — Intenta reconectar usando el token guardado en
`twitch-tokens.json`. También se llama al arrancar para reconexión automática.

**`twitch:auth-request`** — Abre una ventana modal con la URL de Twitch OAuth.
Escucha las navegaciones hasta detectar el redirect a `localhost:3000/callback`,
intercambia el código por tokens, los guarda y llama a `setupTwitch()`.

### 3.6 Integración Kick

**`kick:auth-request`** — Implementa flujo PKCE. Genera `codeVerifier` +
`codeChallenge`, levanta un servidor HTTP temporal en `localhost:3000`, abre el
navegador del sistema con la URL de autorización, y al capturar el código lo
envía al renderer para intercambiarlo por token.

**`kick:get-token`** — Hace el POST a la API de Kick con el `code` y `codeVerifier`.
Guarda el `access_token` en `kick-token.json`.

**`kick:check-status`** — Verifica si existe `kick-token.json` en disco.

### 3.7 Controles de Ventana

Tres handlers para minimizar, maximizar y cerrar la ventana (que fue creada sin marco
nativo con `frame: false`).

### 3.8 Arranque

Al iniciar: crea la ventana, envía `request-buttons-sync` al renderer para que
sincronice los botones guardados, e intenta reconectar Twitch automáticamente.

---

## 4. Módulo OBS WebSocket — `obs-websocket.js`

Encapsula la instancia singleton de `OBSWebSocket` y expone:

- **`conectarOBS(ip, puerto, password)`** — Conecta vía WebSocket. Retorna
  `{ success: true/false }`. Defaults: `127.0.0.1:4455`.
- **`estaConectado()`** — Verifica si `socket.readyState === 1` (OPEN).
- **`getOBSInstance()`** — Retorna la instancia para que el motor la use con
  `obs.call(command, args)`.

Escucha globalmente `ConnectionClosed` e `Identified` para logging.

---

## 5. Módulo Twitch Auth — `twitch-auth.js`

Gestiona autenticación, API y chat usando la librería **Twurple**.

### `setupTwitch(clientId, clientSecret, mainWindow)`

1. Lee `twitch-tokens.json`. Si no existe, retorna `NEED_AUTH`.
2. Crea/reutiliza un `RefreshingAuthProvider` — maneja el refresco automático de tokens.
3. Crea un `ApiClient` para obtener el nombre del usuario.
4. Si el `ChatClient` ya está conectado, retorna sin reconectar.
5. Crea un nuevo `ChatClient`, se une al canal y registra `onMessage` para reenviar
   mensajes al renderer vía IPC.

### `sendTwitchMessage(message)`

Verifica que el `ChatClient` esté conectado y llama a `chatClient.say(canal, mensaje)`.

### `saveInitialTokens(tokenData)`

Guarda los tokens del OAuth en `twitch-tokens.json` añadiendo `obtainmentTimestamp`.

---

## 6. Módulo Kick Auth — `kick-auth.js`

Módulo del lado del **renderer** (contexto browser, no Node.js).

### `authenticateKick()`

Construye la URL de autorización de Kick y delega la apertura al proceso main vía
`window.windowAPI.sendKickAuth()`, porque Kick bloquea navegadores embebidos.
El listener `onKickSuccess` reacciona cuando el main confirma que el token fue obtenido.

---

## 7. Puente de Comunicación — `preload.js`

Expone la API de IPC al renderer de forma segura con `contextBridge.exposeInMainWorld`.
Ninguna función expone Node.js directamente — son wrappers de `ipcRenderer`.

| Función | Tipo IPC | Descripción |
|---|---|---|
| `minimize()` | send | Minimiza la ventana |
| `maximize()` | send | Maximiza o restaura |
| `close()` | send | Cierra la ventana |
| `connectOBS(config)` | send | Inicia conexión OBS |
| `checkOBSStatus()` | send | Solicita estado de OBS |
| `onOBSResponse(cb)` | on | Escucha respuesta OBS |
| `sendTwitchAuth()` | send | Inicia OAuth Twitch |
| `getTwitchStatus()` | invoke | Estado de Twitch |
| `onTwitchResponse(cb)` | on | Escucha auth Twitch |
| `onTwitchChatMessage(cb)` | on | Mensajes del chat |
| `sendKickAuth()` | send | Inicia OAuth Kick |
| `getKickToken(data)` | invoke | Intercambia code→token |
| `checkKickStatus()` | invoke | Verifica token Kick |
| `onKickSuccess(cb)` | on | Escucha éxito Kick |
| `updateButtonsLogic(buttons)` | send | Sincroniza botones al main |
| `testCommands(commands)` | send | Ejecuta macro manualmente |
| `onRequestSync(cb)` | on | Escucha solicitud de sync del main |
| `getAvailableEvents()` | invoke | Lista eventos OBS y Twitch |

---

## 8. Interfaz de Usuario — `renderer.js`

### 8.1 Inicialización

Al `DOMContentLoaded`: conecta botones de ventana, registra `onRequestSync` para
responder con los botones activos, y llama a `initDeckHubLogic()`.

### 8.2 Hub de Decks

**`initDeckHubLogic()`** — Lee claves `deck_storage_*` de `localStorage` y las muestra
en grilla de 4 por vista con paginación. Los datos se guardan como
`{ id, name, buttons: {} }`.

**`setupHubListeners()`** — Click en deck abre el editor; click en el input de nombre
permite renombrar inline; botones +/- añaden y eliminan decks.

**`openDeck(id, defaultName)`** — Carga el deck desde `localStorage` y llama a
`renderDeckTemplate()`.

### 8.3 Editor de Grid Interactivo

**`renderDeckTemplate()`** — Genera cabecera con nombre y acciones, una capa de 80
slots de referencia visual (grid 10×8) y una capa de botones reales.

**`drawButton(container, id, data)`** — Crea un `div.grid-button` posicionado con
`grid-column` y `grid-row` según `x`, `y`, `w`, `h`.

**`setupInteractiveEvents()`** — Drag-and-drop y resize puramente con eventos de mouse:
- `mousedown` activa modo drag o resize según si se clickeó el `.resize-handle`.
- `mousemove` recalcula posición en unidades de celda y actualiza estilos en tiempo real.
- `mouseup` limpia el estado; `was-dragging` distingue clicks de drags.
- `contextmenu` muestra menú "Crear Botón" / "Eliminar Botón" calculando la celda.

Al guardar se persiste en `localStorage` y se sincroniza al main.

### 8.4 Editor de Comandos JSON

**`renderCommandEditor(slotId)`** — Renderiza:
- Barra superior con nombre editable, botón PROBAR y Guardar y Salir.
- Panel izquierdo: acordeón de eventos OBS/Twitch con buscador en tiempo real.
  Los items son clickeables y arrastrables.
- Panel derecho: `<textarea>` con numeración de líneas sincronizada, soporte Tab.
- Footer con errores JSON en tiempo real.

**`renderCategorizedEvents(filter)`** — Construye árbol por `category` y `subCategory`
con filtrado en tiempo real. Items llaman a `window.insertCommand()`.

**`window.insertCommand(eventName, service)`** — Parsea el JSON actual, añade un nuevo
comando `{ trigger, action }` y re-serializa con 4 espacios de indentación.

### 8.5 Panel de Settings

**`initSettingsLogic()`** — Cargado como overlay dinámico. Gestiona:
- Navegación entre pestañas OBS / Twitch / Kick.
- **OBS**: lee IP/puerto/contraseña y llama a `connectOBS`. Persiste config en
  `localStorage` si conecta. Actualiza labels de estado con clases CSS.
- **Twitch**: verifica estado al abrir, flujo de auth con `sendTwitchAuth()`.
- **Kick**: igual que Twitch, flujo con `sendKickAuth()` + `onKickSuccess()`.

---

## 9. Configuración de Eventos — Archivos JSON

Fuente de verdad de los eventos disponibles. Extensibles sin tocar código.

### Formato

```json
{
    "socketEvent": "CurrentProgramSceneChanged",
    "triggerName": "SceneChanged",
    "category": "OBS",
    "subCategory": "Escenas"
}
```

- `socketEvent`: nombre exacto del evento en el SDK (OBS WebSocket o Twitch EventSub).
- `triggerName`: nombre amigable para usar en los comandos JSON de los botones.
- `category` / `subCategory`: organización del acordeón en el editor.

### 9.1 `obs-events.json` — 35 eventos

Cubre: Escenas, Audio (mute, volumen, sync), Fuentes, Items de Escena, Filtros, Salidas
(stream, grabación, virtual cam, replay buffer), Configuración Global.

### 9.2 `twitch-events.json` — 24 eventos

Cubre: Chat y Comunidad (mensajes, follows, raids), Monetización (subs, giftsubs,
resubs, bits), Interacción (channel points, polls, predictions), Hype Train,
Moderación (ban/unban), Objetivos, Estado del Stream (live/offline, ad breaks).

---

## 10. Flujo Completo de una Macro

1. El usuario crea un botón y lo configura con este JSON:
[
{
"trigger": { "service": "twitch", "event": "NewSub" },
"action": { "service": "obs", "command": "SetCurrentProgramScene",
"args": { "sceneName": "Sub Alert" } }
},
{
"trigger": { "service": "twitch", "event": "NewSub" },
"action": { "service": "twitch", "message": "¡Gracias por el sub!" }
}
]

2. Guarda → localStorage + sincronización al main (updateButtonsLogic).
3. Un usuario se suscribe en Twitch →
Twurple dispara 'channel.subscribe' →
setupTwitch llama a triggerAutomation('twitch', 'NewSub', eventData).
4. triggerAutomation filtra botones con trigger { service:'twitch', event:'NewSub' }.
5. Encuentra el botón → llama a executeMacro(button.commands).
executeMacro ejecuta secuencialmente:
→ OBS cambia a escena "Sub Alert".
→ Twitch envía "¡Gracias por el sub!" al chat.

---

## 11. Plan de Mejoras — Desarrollo

### Prioridad Alta

**Completar la integración de eventos de Kick**
El auth funciona pero no hay ningún listener de eventos. Se necesita conectar al
WebSocket de chat de Kick y llamar a `triggerAutomation('kick', eventName, data)`.
Eventos mínimos: mensajes de chat, nuevos seguidores, suscripciones.

**Conectar el trigger de chat de Twitch al motor**
En `twitch-auth.js` hay un comentario explícito: `// AQUÍ SE DISPARARÁ LA AUTOMATIZACIÓN
EN EL FUTURO`. El listener `chatClient.onMessage()` debe llamar a `triggerAutomation`.
Esto habilitaría macros por comandos de chat como `!clip`, `!scene`, etc.

**Añadir acciones de Kick en `executeMacro`**
Añadir un bloque `if (action.service === 'kick')` que envíe mensajes al chat de Kick
usando el `access_token` guardado en `kick-token.json`.

### Prioridad Media

**Sistema de condiciones generalizado en triggers**
Generalizar el sistema de condiciones para soportar filtros por contenido de mensaje,
nombre de usuario, rol (moderador/sub), o umbrales numéricos (bits >= 100).

**Soporte de delays entre comandos**
Añadir tipo de acción `{ service: 'system', command: 'delay', args: { ms: 2000 } }`
para pausas entre acciones de una macro.

**Migración de localStorage a archivos JSON**
Los decks atados a `localStorage` de Electron no son portables ni respaldables.
Migrar a archivos JSON en el filesystem vía IPC para poder exportar/importar decks.

**Auto-reconexión con OBS**
Si OBS se cierra y se reabre, la app no reconecta. Implementar reintentos con backoff
exponencial usando el evento `ConnectionClosed`.

**Validación de JSON en tiempo real en el editor**
Validar la estructura del JSON con debounce mientras el usuario escribe, no solo al
guardar. Verificar que existan los campos `trigger.service`, `trigger.event`, etc.

**Ejecución manual desde el grid**
Añadir opción de ejecutar una macro con click directo sobre el botón, sin esperar
un trigger externo.

**Implementar los paneles Explore y Addons**
`explore.html` y `addons.html` están vacíos. Explore podría mostrar decks de la
comunidad; Addons podría permitir instalar plugins con nuevas acciones o integraciones.

### Prioridad Baja

**Iconos e imágenes en los botones**
Soporte para imágenes personalizadas o un set de iconos incluido.

**Múltiples perfiles de deck**
Guardar y cambiar entre perfiles completos, útil para streamers con contenido variado.

**Historial de ejecuciones**
Log en tiempo real de qué macros se ejecutaron, cuándo, y con qué resultado.

---

## 12. Plan de Mejoras — Seguridad

### Crítico — Resolver Inmediatamente

**Eliminar credenciales hardcodeadas del código fuente**
En `main.js` están expuestos directamente:

```js
const CLIENT_ID     = 'hhoos5qi41xfs6qq7z9pe2159mobzo';
const CLIENT_SECRET = 'x49z49ojed04ipb9q372t8yg5mh8xv';
const KICK_CLIENT_ID     = '01KEAJFG7MPHRNM2Z6H12DZBP4';
const KICK_CLIENT_SECRET = '2e9356cac...';
```

Son visibles para cualquiera que acceda al repositorio o descompile la app.
Solución: moverlas a `.env` (no versionado) y acceder con `process.env.VAR`.
Para distribución, usar `safeStorage` de Electron para almacenar en el keychain del SO.

**Añadir `twitch-tokens.json` y `kick-token.json` al `.gitignore`**
Pueden contener tokens de acceso activos. Nunca deben subirse al repositorio.
Verificar también que `.env` esté en el `.gitignore`.

### Alta Prioridad

**Cifrar los tokens almacenados en disco**
`twitch-tokens.json` y `kick-token.json` se guardan en texto plano. Usar
`safeStorage.encryptString()` / `decryptString()` de Electron para cifrarlos con
el keychain nativo del SO (Keychain en macOS, DPAPI en Windows, libsecret en Linux).

**Validar el parámetro `state` en el callback de Twitch**
El flujo OAuth de Kick genera y valida un `state` contra ataques CSRF. El de Twitch no.
Añadir generación de `state` aleatorio al iniciar el flujo y verificación al recibir
el callback.

**Whitelist de comandos OBS en `executeMacro`**
`action.command` se pasa directamente a `obs.call()` sin validación. Implementar una
lista de comandos permitidos para evitar que inputs maliciosos o erróneos lleguen al
socket de OBS.

**Timeout al servidor HTTP temporal de Kick**
El servidor en `localhost:3000` queda abierto indefinidamente si el usuario no completa
el flujo. Añadir un timeout de 5 minutos tras el cual el servidor se cierra y se
notifica al usuario.

### Media Prioridad

**Renovación automática del token de Kick**
A diferencia de Twitch (con `RefreshingAuthProvider`), el token de Kick se guarda pero
nunca se refresca. Implementar lógica de renovación usando el `refresh_token` de Kick
antes de que expire.

**Política de Content Security Policy (CSP)**
La ventana de Electron no tiene CSP definida. Añadir una cabecera restrictiva
(`default-src 'self'`) en el HTML para limitar el daño potencial de inyecciones externas.

**Auditoría y actualización de dependencias**
Ejecutar `npm audit` regularmente. Mantener Electron actualizado, ya que recibe
parches de seguridad frecuentes. Considerar integrarlo en un pipeline de CI.

**No loguear contenido de mensajes de chat en producción**
Implementar niveles de log (debug/info/error) y desactivar el logging de contenido
de mensajes de usuarios en builds de producción para proteger datos de terceros.