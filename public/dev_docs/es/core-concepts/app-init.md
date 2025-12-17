# Inicialización de la app y conexión al backend

## ¿Qué es el backend de SAVVA (nodo SAVVA)?
Un backend de SAVVA es un componente de servidor que **indexa/cachea datos provenientes de la actividad en la blockchain** y expone APIs y métodos WebSocket rápidos y aptos para la UI. Un único backend puede servir **múltiples dominios SAVVA** — piensa en un “dominio” como una red social SAVVA distinta (marca, pestañas, assets, valores por defecto), todo soportado por un mismo nodo.

## Qué necesita la app al iniciar
Al arrancar, la app web necesita dos entradas:

1. **Backend URL** – la URL base del backend de SAVVA.
2. **Domain name** – qué dominio SAVVA (red social) renderizar por defecto.

Los valores por defecto provienen de un pequeño archivo YAML en la raíz web:

### `/default_connect.yaml`
```yaml
# /default_connect.yaml
domain: savva.app
backendLink: https://ui.savva.app/api/
gear: true
# optional:
# default_ipfs_link: ipfs://bafy.../something.json
````

* `backendLink` — endpoint HTTP base del backend de SAVVA (la app lo normaliza).
* `domain` — dominio inicial a renderizar; puede cambiarse más tarde desde la UI.
* `gear` — habilita herramientas de desarrollador en la UI (opcional).
* `default_ipfs_link` — valor por defecto opcional usado en algunos flujos.

> **Nota de producción**
> En producción este archivo normalmente lo sirve tu servidor HTTP (p. ej., Nginx) y efectivamente **elige qué dominio** muestra la app web desplegada por defecto. Un patrón común es servir un archivo específico desde disco:
>
> ```nginx
> # example: serve a static default_connect.yaml
> location = /default_connect.yaml {
>   default_type text/yaml;
>   alias /etc/savva/default_connect.yaml;
> }
> ```
>
> Ajústalo a tu infraestructura; lo importante es que la app pueda hacer un `GET /default_connect.yaml`.

---

## Secuencia de arranque

1. **Cargar `/default_connect.yaml`**
   La app solicita el archivo YAML, valida `backendLink` y almacena `domain`. Inmediatamente **configura los endpoints** (base HTTP + URL WS) usando esos valores. &#x20;

2. **Configurar endpoints**

   * `httpBase` es una versión normalizada de `backendLink` (con barra final garantizada).
   * La URL `ws` se deriva de la misma base, apuntando a `.../ws` (protocolo cambiado a `ws:` o `wss:`) e incluye `?domain=...` en la query.
     Esto mantiene **una única fuente de la verdad** para HTTP y WS.&#x20;

3. **Solicitar `/info`**
   Con los endpoints configurados, la app llama a `GET <httpBase>info` y almacena el JSON. A partir de ese momento, **/info dirige el comportamiento en tiempo de ejecución** (dominios, cadena, IPFS, assets).&#x20;

4. **Derivar el estado en tiempo de ejecución desde `/info`**
   Se usan los siguientes campos (ver ejemplo abajo):

   * **`domains`** → Lista de dominios disponibles. La UI prefiere el `domain` explícito del YAML/override; si no está presente en `/info`, igualmente lo usa.&#x20;
   * **`blockchain_id`** → ID de cadena EVM objetivo. El ayudante de wallet puede cambiar/agregar esta red.&#x20;
   * **`ipfs_gateways`** → Gateways IPFS remotos que se intentan en orden (a menos que haya un override de IPFS local habilitado).&#x20;
   * **`assets_url`** y **`temp_assets_url`** → La **base de assets** (prod vs test). La app calcula el **prefijo de assets del dominio activo** como
     `(<assets base> + <domain> + "/")` con una **caída** a `/domain_default/` si falta el `config.yaml` remoto. &#x20;

5. **Cargar assets y config del dominio**
   La app intenta `(<active prefix>/config.yaml)` con un timeout corto; si falla, cae al paquete por defecto en `/domain_default/config.yaml`. La configuración resultante parseada (logos, pestañas, locales, etc.) se almacena y la UI se renderiza en consecuencia.&#x20;

6. **Runtime de WebSocket**
   El cliente WS usa la URL `ws` calculada en los endpoints; cuando cambia el backend/dominio, los endpoints se recalculan y la capa WS lo recoge.&#x20;

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

* **domains** — lista de dominios seleccionables. El diálogo **Switch backend / domain** se llena desde `/info`, pero el dominio configurado sigue teniendo prioridad si `/info` está desactualizado. &#x20;
* **blockchain\_id** — ID numérico de la cadena EVM; se usa para construir metadata de `switch/add chain` y para asegurar que la wallet esté en la **red requerida**. &#x20;
* **ipfs\_gateways** — lista ordenada de gateways remotos; se combina con un override opcional de **IPFS local** (cuando está habilitado en ajustes) para formar el orden de gateways **activo**.&#x20;
* **assets\_url / temp\_assets\_url** — la app mantiene un **entorno de assets** (`prod`/`test`) y elige la base correspondiente. Luego calcula `/<base>/<domain>/` y carga `config.yaml`. Si el paquete remoto falta o es lento, usa el **por defecto** `/domain_default/`.&#x20;

---

## Dónde vive esto en el código (para referencia rápida)

* Carga de arranque y `/default_connect.yaml`, luego `/info`: **`src/context/AppContext.jsx`** y **`src/hooks/useConnect.js`**. &#x20;
* Fuente de la verdad para endpoints (base HTTP + URL WS): **`src/net/endpoints.js`**.&#x20;
* Resolución de lista de dominios, ID de cadena, gateways IPFS, entorno de assets y carga de assets por dominio: **`src/context/AppContext.jsx`**.  &#x20;
* Diálogo de switch que solicita `/info` y normaliza `domains`: **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Siguiente:** en el capítulo siguiente desglosaremos la **configuración por dominio** (`config.yaml`) y cómo controla logos, pestañas, locales y otros comportamientos de UI por dominio.