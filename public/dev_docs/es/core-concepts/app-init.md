# Inicialización de la app y conexión con el backend

## ¿Qué es el backend de SAVVA (nodo SAVVA)?
Un backend de SAVVA es un componente de servidor que **indexa/cachea datos provenientes de la actividad de la blockchain** y expone APIs rápidas y amigables para la UI y métodos WebSocket. Un único backend puede servir **múltiples dominios SAVVA**—piensa en un “dominio” como una red social SAVVA distinta (branding, pestañas, assets, valores por defecto), todo respaldado por un mismo nodo.

## Lo que la app necesita al arrancar
Al iniciarse, la app web necesita dos entradas:

1. **Backend URL** – la URL base del backend SAVVA.
2. **Domain name** – qué dominio SAVVA (red social) mostrar por defecto.

Los valores por defecto provienen de un pequeño archivo YAML en la raíz del sitio:

### `/default_connect.yaml`
```yaml
# /default_connect.yaml
domain: savva.app
backendLink: https://ui.savva.app/api/
gear: true
# optional:
# default_ipfs_link: ipfs://bafy.../something.json
````

* `backendLink` — endpoint HTTP base del backend SAVVA (la app lo normaliza).
* `domain` — dominio inicial a renderizar; puede cambiarse luego en la UI.
* `gear` — habilita herramientas de desarrollador en la UI (opcional).
* `default_ipfs_link` — valor opcional de conveniencia usado en algunos flujos.

> **Nota de producción**
> En producción este archivo normalmente lo sirve tu servidor HTTP (p. ej., Nginx) y efectivamente **elige qué dominio** muestra por defecto la app web desplegada. Un patrón común es servir un archivo específico desde el disco:
>
> ```nginx
> # example: serve a static default_connect.yaml
> location = /default_connect.yaml {
>   default_type text/yaml;
>   alias /etc/savva/default_connect.yaml;
> }
> ```
>
> Ajusta según tu infraestructura; la clave es que la app pueda `GET /default_connect.yaml`.

---

## Secuencia de arranque

1. **Cargar `/default_connect.yaml`**
   La app obtiene el archivo YAML, valida `backendLink` y guarda `domain`. Inmediatamente **configura los endpoints** (base HTTP + URL WS) usando esos valores. &#x20;

2. **Configurar endpoints**

   * `httpBase` es una versión normalizada de `backendLink` (con barra final garantizada).
   * `ws` URL se deriva de la misma base, apuntando a `.../ws` (protocolo cambiado a `ws:` o `wss:`) e incluye `?domain=...` en la query.
     Esto mantiene **una única fuente de verdad** para ambos, HTTP y WS.&#x20;

3. **Obtener `/info`**
   Con los endpoints configurados, la app hace `GET <httpBase>info` y guarda el JSON. Desde ese momento, **/info gobierna el comportamiento en tiempo de ejecución** (dominios, cadena, IPFS, assets).&#x20;

4. **Derivar el estado de ejecución desde `/info`**
   Los siguientes campos se usan (ver ejemplo abajo):

   * **`domains`** → Lista de dominios disponibles. La UI prefiere el `domain` explícito del YAML/override; si no está presente en `/info`, aún lo usa.&#x20;
   * **`blockchain_id`** → ID de cadena EVM objetivo. El helper de wallet puede cambiar/agregar esta red.&#x20;
   * **`ipfs_gateways`** → Pasarelas IPFS remotas para intentar en orden (a menos que esté habilitado un override de IPFS local).&#x20;
   * **`assets_url`** y **`temp_assets_url`** → La **base de assets** (prod vs test). La app calcula el **prefijo de assets del dominio activo** como
     `(<assets base> + <domain> + "/")` con un **fallback** a `/domain_default/` si el `config.yaml` remoto falta. &#x20;

5. **Cargar assets y config del dominio**
   La app intenta `(<active prefix>/config.yaml)` con un timeout corto; si falla recurre al paquete por defecto en `/domain_default/config.yaml`. La configuración parseada resultante (logos, pestañas, locales, etc.) se almacena y la UI se renderiza acorde.&#x20;

6. **Capa WebSocket en tiempo de ejecución**
   El cliente WS usa la URL `ws` calculada desde los endpoints; cuando cambian backend/dominio, los endpoints se recalculan y la capa WS lo recoge.&#x20;

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

* **domains** — lista de dominios seleccionables. El diálogo **Switch backend / domain** se rellena desde `/info`, pero el dominio configurado aún tiene prioridad si `/info` está desactualizado. &#x20;
* **blockchain\_id** — ID numérico de cadena EVM; usado para construir metadata de `switch/add chain` y para asegurar que la wallet esté en la **red requerida**. &#x20;
* **ipfs\_gateways** — lista ordenada de gateways remotos; combinada con un override opcional de IPFS local (cuando está habilitado en settings) para formar el orden de gateways **activo**.&#x20;
* **assets\_url / temp\_assets\_url** — la app mantiene un **entorno de assets** (`prod`/`test`) y elige la base correspondiente. Luego calcula `/<base>/<domain>/` y carga `config.yaml`. Si el pack remoto falta o es lento, usa el **por defecto** `/domain_default/`.&#x20;

---

## Dónde vive esto en el código (referencia rápida)

* Boot & `/default_connect.yaml` load, then `/info`: **`src/context/AppContext.jsx`** and **`src/hooks/useConnect.js`**. &#x20;
* Endpoint source of truth (HTTP base + WS URL): **`src/net/endpoints.js`**.&#x20;
* Domain list resolution, chain ID, IPFS gateways, assets env & domain assets loading: **`src/context/AppContext.jsx`**.  &#x20;
* Switch dialog that fetches `/info` and normalizes `domains`: **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Siguiente:** en el capítulo siguiente desglosaremos la **configuración de dominio** (`config.yaml`) y cómo controla logos, pestañas, locales y otros comportamientos de la UI por dominio.