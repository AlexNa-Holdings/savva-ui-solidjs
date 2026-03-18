# Inicialización de la app y conexión al backend

## ¿Qué es el backend de SAVVA (nodo SAVVA)?
Un backend de SAVVA es un componente de servidor que **indexa/almacena en caché datos procedentes de la actividad de la blockchain** y expone APIs rápidas y amigables para la interfaz de usuario (UI) y métodos WebSocket. Un único backend puede servir **múltiples dominios SAVVA**: piensa en un “dominio” como una red social SAVVA distinta (branding, pestañas, assets, valores por defecto), todo respaldado por un solo nodo.

## Qué necesita la app al arrancar
Al iniciar, la aplicación web necesita dos entradas:

1. **Backend URL** – la URL base del backend de SAVVA.
2. **Domain name** – qué dominio SAVVA (red social) renderizar por defecto.

Los valores por defecto vienen de un pequeño archivo JSON en la raíz web (YAML también se admite como alternativa):

### `/default_connect.json`
```json
{
  "domain": "savva.app",
  "backendLink": "https://ui.savva.app/api/",
  "gear": true,
  "default_ipfs_link": "ipfs://bafy.../something.json"
}
```

* `backendLink` — endpoint HTTP base del backend de SAVVA (la app lo normaliza).
* `domain` — dominio inicial a renderizar; puede cambiarse más tarde desde la UI.
* `gear` — habilita las herramientas de desarrollador en la UI (opcional).
* `default_ipfs_link` — valor por defecto opcional usado en algunos flujos.

> **Nota de formato**
> La app intenta `/default_connect.json` primero. Si esa petición falla, usa `/default_connect.yaml` como retrocompatibilidad. Las nuevas implementaciones deberían usar JSON.

> **Nota de producción**
> En producción este archivo suele servirlo tu servidor HTTP (p. ej., Nginx) y efectivamente **elige qué dominio** muestra por defecto la app desplegada. Un patrón común es servir un archivo específico desde disco:
>
> ```nginx
> # example: serve a static default_connect.json
> location = /default_connect.json {
>   default_type application/json;
>   alias /etc/savva/default_connect.json;
> }
> ```
>
> Ajusta según tu infraestructura; lo importante es que la app pueda `GET /default_connect.json`.

---

## Secuencia de arranque

1. **Cargar la configuración del sitio (`/default_connect.json` o `.yaml`)**
   La app intenta obtener `/default_connect.json` primero; si no está disponible, recurre a `/default_connect.yaml`. Valida `backendLink`, almacena `domain` y configura inmediatamente los **endpoints** (base HTTP + URL WS) usando esos valores. &#x20;

2. **Configurar endpoints**

   * `httpBase` es una versión normalizada de `backendLink` (garantiza la barra final).
   * La URL `ws` se deriva de la misma base, apuntando a `.../ws` (protocolo cambiado a `ws:` o `wss:`) e incluye `?domain=...` en la query.
     Esto mantiene **una única fuente de verdad** para HTTP y WS.&#x20;

3. **Obtener `/info`**
   Con los endpoints configurados, la app hace `GET <httpBase>info` y almacena el JSON. Desde ese momento, **/info determina el comportamiento en tiempo de ejecución** (dominios, chain, IPFS, assets).&#x20;

4. **Derivar el estado en tiempo de ejecución a partir de `/info`**
   Se usan los siguientes campos (ver ejemplo abajo):

   * **`domains`** → Lista de dominios disponibles. La UI prefiere el `domain` explícito del YAML/override; si no está presente en `/info`, igual lo usa.&#x20;
   * **`blockchain_id`** → ID de la cadena EVM objetivo. El asistente de wallet puede cambiar/agregar esta red.&#x20;
   * **`ipfs_gateways`** → Gateways IPFS remotas para probar en orden (a menos que esté habilitada una anulación de IPFS local).&#x20;
   * **`assets_url`** y **`temp_assets_url`** → La **base de assets** (prod vs test). La app calcula el **prefijo de assets activo del dominio** como
     `(<assets base> + <domain> + "/")` con una **alternativa** a `/domain_default/` si falta el `config.yaml` remoto. &#x20;

5. **Cargar assets y config del dominio**
   La app intenta `(<active prefix>/config.yaml)` con un timeout corto; en caso de fallo recurre al paquete por defecto en `/domain_default/config.yaml`. La configuración resultante parseada (logos, pestañas, locales, etc.) se almacena y la UI se renderiza en consecuencia.&#x20;

6. **Runtime de WebSocket**
   El cliente WS usa la URL `ws` computada en los endpoints; cuando cambian el backend/dominio, los endpoints se recalculan y la capa WS lo recoge.&#x20;

---

## Ejemplo de `/info` (ilustrativo)

```json
{
  "domains": [
    "savva.app",
    {"name": "art.savva"},
    "dev.savva"
  ],
  "blockchain_id": 369,
  "ipfs_gateways": [
    "https://cloudflare-ipfs.com/ipfs/",
    "https://ipfs.io/ipfs/"
  ],
  "assets_url": "https://cdn.savva.network/assets/",
  "temp_assets_url": "https://cdn.savva.network/assets-test/"
}
```

### Campo por campo (qué hace la app con ello)

* **domains** — lista de dominios seleccionables. El diálogo **Switch backend / domain** se popula desde `/info`, pero el dominio configurado sigue teniendo prioridad si `/info` está desactualizado. &#x20;
* **blockchain\_id** — ID numérico de la cadena EVM; se usa para construir metadata de `switch/add chain` y para asegurarse de que la wallet esté en la **red requerida**. &#x20;
* **ipfs\_gateways** — lista ordenada de gateways remotos; se combina con una posible anulación de **IPFS local** (cuando está habilitada en ajustes) para formar el orden de gateways **activo**.&#x20;
* **assets\_url / temp\_assets\_url** — la app mantiene un **entorno de assets** (`prod`/`test`) y elige la base correspondiente. Luego calcula `/<base>/<domain>/` y carga `config.yaml`. Si el paquete remoto falta o es lento, utiliza el **por defecto** `/domain_default/`.&#x20;

---

## Dónde vive esto en el código (referencia rápida)

* Carga de arranque y configuración del sitio (`/default_connect.json` con fallback a `.yaml`), luego `/info`: **`src/context/AppContext.jsx`** y **`src/hooks/useConnect.js`**. El cargador compartido está en **`src/utils/loadSiteConfig.js`**. &#x20;
* Fuente de verdad de los endpoints (HTTP base + URL WS): **`src/net/endpoints.js`**.&#x20;
* Resolución de la lista de dominios, chain ID, gateways IPFS, entorno de assets y carga de assets por dominio: **`src/context/AppContext.jsx`**.  &#x20;
* Diálogo Switch que obtiene `/info` y normaliza `domains`: **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Siguiente:** en el capítulo siguiente desglosaremos la **configuración del dominio** (`config.yaml`) y cómo controla logos, pestañas, locales y otros comportamientos de UI por dominio.