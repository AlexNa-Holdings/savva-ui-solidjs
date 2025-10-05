<!-- public/dev_docs/en/core-concepts/connection-orchestration.md -->

# Orquestación de Conexión, almacenamiento de `/info` y Configuración de Dominio

Esta página explica exactamente cómo arranca la app, se conecta a un backend, elige un dominio y cómo almacena/usa la respuesta `/info` del backend y la configuración del dominio. Está escrita para ingenieros profesionales que necesitan ampliar o depurar el flujo.

> **TL;DR** — Hay un único orquestador (`useAppOrchestrator`) que:
>
> * lee `/default_connect.yaml` (+ anulación local opcional),
> * configura endpoints HTTP/WS,
> * obtiene `/info`,
> * finaliza el dominio,
> * elige la base de assets (prod/test), carga el paquete del dominio,
> * reconecta el WebSocket, y
> * (al cambiar explícitamente) navega a `/`.

---

## Términos y Primitivas

* **Backend** — el nodo SAVVA (API HTTP + WebSocket).
* **Dominio** — la red que se renderiza (branding, pestañas, assets).
* **Paquete de Dominio** — carpeta `\<assetsBase\>/\<domain\>/` con `config.yaml`, `domain.css`, i18n, imágenes, módulos, etc. La app puede cargar paquetes desde **prod** (`assets_url`) o **test** (`temp_assets_url`).
* **Override** — una pequeña instantánea `{ backendLink, domain }` persistida en `localStorage` bajo la clave `connect_override`.

---

## Mapa de Archivos (dónde viven las cosas)

* **Orquestador (fuente de la verdad):** `src/context/useAppOrchestrator.js` — lógica de arranque y cambio, `/info`, entorno de assets, paquete de dominio, reconexión WS. Expone `initializeOrSwitch()`, `setDomain()`, `clearConnectOverride()`, y señales para `config`, `info`, `assetsEnv`, `domainAssets*`.
* **Wrapper del contexto de la app:** `src/context/AppContext.jsx` — consume el orquestador y deriva `supportedDomains`, `selectedDomain`, chain/network, gateways IPFS y `assetUrl()`; también asegura consistencia de autenticación al cambiar de dominio.
* **Endpoints HTTP/WS:** `src/net/endpoints.js` — calcula `httpBase()` y `wsUrl()` a partir de `{ backendLink, domain }`, despacha un evento de cambio al reconfigurar y provee helpers.
* **Runtime de WebSocket:** recoge cambios de endpoint y reconecta en consecuencia.
* **UI de Switch:** `src/x/modals/SwitchConnectModal.jsx` — obtiene `<backend>/info`, normaliza una lista de dominios y aplica cambios vía la API de la app.
* **Shell principal:** aplica dinámicamente `domain.css`, favicons/meta, GA, y enlaza el conector WS.
* **Nota de legado.** Puede que vea un hook anterior `useAppConnection`; siga usando el **orquestador** (diseño actual) como fuente única de la verdad.

---

## 1) Secuencia de Arranque — Paso a Paso

El orquestador se ejecuta una vez al montar:

1. **Cargar valores por defecto del sitio**
   `GET /default_connect.yaml`, parsea `backendLink`, `domain`, y (opcionalmente) `gear`. Estos valores se combinan con una **anulación** persistida (si está presente).

2. **Normalizar y preconfigurar endpoints (pre‑info)**
   Antes de `/info`, configuramos endpoints usando el dominio **solicitado** tal cual:
   `configureEndpoints({ backendLink, domain }, "orch:pre-info")`. Esto calcula `httpBase()` y `wsUrl()` y emite un evento de cambio para que el runtime apunte al servidor correcto.

3. **Obtener `/info`**
   `GET <backendLink>/info` (no-cache). El JSON se almacena en `orchestrator.info`.

4. **Resolver el dominio final**
   Si el usuario solicitó explícitamente un dominio, se **respeta**; de lo contrario elegimos el **primero** de `/info.domains` (si existe). El `{ backendLink, domain }` resuelto se convierte en `config`. Si esto fue un cambio, **persistimos** la anulación.

5. **Finalizar endpoints (post‑info)**
   Reejecutar `configureEndpoints` con el dominio **final**. Todas las llamadas HTTP deben usar `httpBase()`, y la **URL WS incluye** `?domain=...`.

6. **Entorno de assets → cargar el paquete de dominio**
   Elegir la base desde `/info`: `assets_url` (prod) o `temp_assets_url` (test). Intentar `\<assetsBase\>/\<domain\>/config.yaml`, si no existe usar `/domain_default/config.yaml`. Almacenar `domainAssetsPrefix`, `domainAssetsConfig` y la fuente (`domain` vs `default`).

7. **Forzar reconexión WS**
   Actualizar la URL del cliente ws, reconectar, esperar apertura (hasta ~8s). Esto asegura que el runtime esté en sintonía con el nuevo dominio y backend.

8. **Navegación**
   Al hacer un cambio explícito, navegar a `/` (mantiene el estado de routing coherente después de un cambio mayor de contexto).

> El orquestador expone la misma API para volver a ejecutar esta secuencia en cualquier momento; `setDomain()` usa la misma ruta internamente.

---

## 2) Cálculo de Endpoints (HTTP y WS)

`src/net/endpoints.js` es el **único** lugar que conoce la base activa y la URL ws:

### `configureEndpoints({ backendLink, domain }, reason)`

* Normaliza la base (asegura `https://…/`).
* Almacena el **domain** (string).
* Deriva la URL de WebSocket (`ws:`/`wss:`) con `?domain=<name>&space=public`.
* Emite un evento `ENDPOINTS_CHANGED`.

Todo el demás código llama getters (`httpBase()`, `wsUrl()`, `wsQuery()`) y/o se suscribe a cambios.

### El runtime WS reacciona a cambios

El runtime escucha el cambio de endpoints y puede reconectar. El orquestador también establece explícitamente la URL y llama a `reconnect`.

### Llamadas HTTP

Para endpoints que requieren `domain` en la query (auth, checks de admin, etc.), los llamantes lo añaden vía `URLSearchParams` contra `httpBase()`. (Ver ejemplos en `auth.js`.)

---

## 3) `/info` — Qué almacenamos y cómo lo usamos

El JSON crudo de `/info` se almacena como una **señal**: `orchestrator.info()`.

**Forma típica (abreviada):**

```json
{
  "domains": ["savva.app", {"name":"art.savva"}],
  "blockchain_id": 369,
  "ipfs_gateways": ["https://cloudflare-ipfs.com/ipfs/"],
  "assets_url": "https://cdn…/assets/",
  "temp_assets_url": "https://cdn…/assets-test/"
}
```

**Dónde se usa:**

* **Dominios** — `AppContext` deriva `supportedDomains` (normalizados, sin duplicados) y el `selectedDomain`. Si `config.domain` está definido, se prefiere; de lo contrario se usa el primer dominio soportado.
* **Chain/network** — `desiredChainId = info.blockchain_id` → `desiredChain()` deriva metadata completa; `ensureWalletOnDesiredChain()` puede llamarse antes de flujos de tx.
* **Gateways IPFS** — `remoteIpfsGateways` viene de `info.ipfs_gateways`, y `activeIpfsGateways` opcionalmente antepone un gateway **local** si está habilitado en ajustes.
* **Base de Assets** — El orquestador elige `assets_url` (prod) o `temp_assets_url` (test), calcula `\<assetsBase\>/\<domain\>/`, y luego carga el paquete de dominio. El prefijo activo + config parseada se publican vía `domainAssetsPrefix()` / `domainAssetsConfig()`.
* **Características de la app que usan `/info`** — p. ej., el mapeo de precios de tokens busca `/info.savva_contracts.SavvaToken.address` para colocar el token base SAVVA en la tabla de precios.

---

## 4) Configuración de Dominio — Almacenamiento y Consumo

Después del paso (6) en el flujo de arranque, la app tiene:

* `assetsEnv()` — `"prod"` o `"test"` (toggle en Settings, usado por admins).
* `assetsBaseUrl()` — calculado desde `/info` + env.
* `domainAssetsPrefix()` — ya sea `\<assetsBase\>/\<domain\>/` o `/domain_default/`.
* `domainAssetsConfig()` — `config.yaml` parseado.

### ¿Quién lee la config del dominio?

* **CSS y branding**

  * `DomainCssLoader` carga `assetUrl("domain.css")`, con cache‑busting por una revisión de `(env|domain|assets_cid)`.
  * `FaviconLoader` lee la sección `favicon` (tamaños de icono, manifest, mask icon, meta) y actualiza `<link rel="icon">` y demás; las URLs se resuelven vía `assetUrl(relPath)` y se cache‑bustean.

* **Internacionalización (idiomas por dominio)**

  * En cada carga de config, la app publica los códigos de idioma del dominio al sistema i18n y ajusta el `<title>` del documento al `title` del locale actual. También **valida** el idioma actual contra el nuevo dominio y cambia a uno soportado cuando es necesario.

* **Módulos / Pestañas**

  * La barra de navegación principal (`TabsBar`) lee `config.modules.tabs` (por defecto `modules/tabs.yaml`) y carga el YAML mediante el **asset loader** usando `assetUrl()`. Las pestañas se localizan vía claves i18n y/o metadata por pestaña.

* **Bloques HTML y otros assets**

  * Widgets (p. ej., `HtmlBlock`) llaman a `loadAssetResource(app, relPath)` que resuelve rutas relativas mediante `assetUrl()` y obtiene texto/YAML acorde.

> El `assetUrl(relPath)` activo es **simplemente** `domainAssetsPrefix()` + `relPath` (sin `/` inicial); esto mantiene a todos los consumidores consistentes.

### Settings → Assets (diagnósticos)

Los admins pueden alternar **prod/test**, ver el **prefijo/fuente activo**, y ejecutar diagnósticos que confirmen la presencia de campos clave (logos, locales, pestañas, favicon). Esta vista lee *solo* las señales publicadas por el orquestador.

---

## 5) Cómo Funciona el Cambio (backend/dominio)

### Flujo UI

1. El diálogo **Switch backend / domain** acepta una URL de backend.
2. Llama a `<backend>/info` para poblar una lista normalizada de dominios (`[{name, …}]`).
3. Aplica una selección llamando a la API de la app.

### Flujo del Orquestador

* Si cambió el **backend**, primero **cerramos sesión** para evitar estado de cookies cruzadas entre backends.
* Preconfigurar endpoints (dominio solicitado), obtener `/info`, resolver dominio final.
* Persistir la anulación, establecer `config`, **finalizar endpoints**, cargar paquete de dominio, **reconectar WS**, navegar al inicio.

### Consistencia de autenticación

Si un usuario está logueado y el **domain** en `config` cambia, la app cierra sesión proactivamente para evitar actuar bajo un contexto desajustado. Un toast explica el motivo.

---

## 6) `AppContext` — En qué puede confiar tu código

`useApp()` expone una superficie estable, respaldada por el orquestador:

* **Estado de conexión:** `loading()`, `error()`, `config()`, `info()` (raw `/info`).
* **Dominios:** `supportedDomains()`, `selectedDomain()`, `selectedDomainName()`.
* **Red:** `desiredChainId()`, `desiredChain()`, `ensureWalletOnDesiredChain()`.
* **IPFS:** `remoteIpfsGateways()`, `activeIpfsGateways()`.
* **Assets:** `assetsEnv()`, `assetsBaseUrl()`, `domainAssetsPrefix()`, `domainAssetsConfig()`, y `assetUrl(relPath)`.
* **API de cambio:** `initializeOrSwitch(newSettings)`, `setDomain(name)`, `clearConnectOverride()`.
* **Helpers i18n:** `t(key, vars?)`, `lang()`, `setLang(code)`.

### Ejemplo: cargar un fragmento YAML desde el paquete de dominio

```js
// (not a component, just a sketch)
// All visible strings MUST be localized; here none are shown to the user.
import { useApp } from "../context/AppContext.jsx";
import { loadAssetResource } from "../utils/assetLoader.js";

async function loadDomainTabs() {
  const app = useApp();
  const rel = app.domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml";
  const data = await loadAssetResource(app, rel, { type: "yaml" });
  return Array.isArray(data?.tabs) ? data.tabs : [];
}
```

### Ejemplo: construir una llamada autenticada que requiere un domain

```js
// All user-visible strings must be localized via t():
import { useApp } from "../context/AppContext.jsx";

async function fetchAdminFlag(address) {
  const { t } = useApp();
  const url = new URL(`${httpBase()}is-admin`);
  url.searchParams.set("address", address);
  url.searchParams.set("domain", useApp().selectedDomainName());
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(t("error.connection.message"));
  return (await res.json())?.admin === true;
}
```

---

## 7) Manejo de Errores y Estados Vacíos

Cuando la conexión falla en el arranque (por ejemplo, YAML malformado, `/info` caído), `AppContext` expone `error()` y el shell renderiza una tarjeta de error centrada con strings i18n y un botón de **Retry**.

---

## 8) Notas sobre i18n e Invariantes de UX

* **Cada** string visible por el usuario en el código UI debe ser `t("…")` desde `useApp()` (navegación, settings, toasts, etc.).
* `document.title` se deriva del `title` localizado en la config del dominio. Cambiar **dominio** o **env** actualiza el branding inmediatamente sin rebuild.

---

## 9) Fragmentos de Referencia

* Pre‑info configure → `/info` → configuración final — núcleo del orquestador.
* Base de assets y fallback del paquete de dominio — orquestador.
* Endpoints y URL WS (`?domain=...`) — fuente única.
* Runtime WS + reconexión al cambiar endpoints — detalles del runtime.
* Diálogo de switch, fetch `/info` y normalización de dominios — detalle UI.

---

## 10) Lista de Verificación Operativa

* Para cambiar los valores por defecto en un despliegue, actualice **`/default_connect.yaml`** en el servidor web que hospeda el sitio.
* Para cambiar en tiempo de ejecución, use el **Switch dialog** (el gear debe estar habilitado por el YAML del sitio).
* Para previsualizar un paquete de dominio, active **Settings → Assets → Environment: Test**. La app cargará desde `temp_assets_url`.
* Si cambia el **backend**, la app **cierra sesión** primero para evitar cookies cruzadas entre backends.

---

## Apéndice: Modelo de Datos de Un Vistazo

```ts
// Simplified conceptual model

type AppConfig = {
  backendLink: string;   // normalized with trailing slash
  domain: string;        // chosen domain name
  gear: boolean;         // UI gear enabled (from site YAML)
};

type Info = {
  domains: Array<string | { name: string; website?: string }>;
  blockchain_id?: number;
  ipfs_gateways?: string[];
  assets_url?: string;
  temp_assets_url?: string;
  // ...other fields (e.g., savva_contracts)
};

type Orchestrator = {
  config(): AppConfig | null;
  info(): Info | null;
  loading(): boolean;
  error(): Error | null;

  // orchestration
  initializeOrSwitch(newSettings?: Partial<AppConfig>): Promise<void>;
  setDomain(name: string): Promise<void>;
  clearConnectOverride(): void;

  // assets
  assetsEnv(): "prod" | "test";
  setAssetsEnv(next: "prod" | "test"): void;
  assetsBaseUrl(): string;
  domainAssetsPrefix(): string;           // '/domain_default/' or '<assetsBase>/<domain>/'
  domainAssetsConfig(): any | null;       // parsed config.yaml
};
```

---

Ese es el panorama completo. Con estas primitivas puedes ampliar la UI con seguridad, con la confianza de que los endpoints, `/info` y los recursos de dominio permanecen **consistentes** y **reactivos** en toda la app.