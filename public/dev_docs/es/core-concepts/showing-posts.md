# Mostrar Publicaciones

Mostrar una publicación de SAVVA es un proceso de dos pasos.

1. Obtener una lista de objetos de metadatos de publicaciones desde el backend de SAVVA.
2. Usar la información de IPFS de esos metadatos para obtener el contenido real (título, texto, imágenes, etc.) desde la red descentralizada.

---

## Paso 1: Obtener metadatos de publicaciones desde el backend

La forma principal de obtener una lista de publicaciones es mediante el método WebSocket **`content-list`**. Admite paginación, ordenación y filtrado.

### Llamando a `content-list`

Llamas al método con parámetros que especifican qué contenido necesitas. Ejemplo:

```js
// Example call using the app's wsMethod helper
const posts = await app.wsMethod("content-list")({
  domain: "savva.app",      // Domain to fetch posts from
  limit: 12,                // Number of items per page
  offset: 0,                // Start index (for pagination)
  lang: "en",               // Preferred language for metadata
  order_by: "fund_amount",  // Sort by total funds received
  content_type: "post",     // We only want posts
  show_nsfw: true,          // true if user settings allow, otherwise false
  category: "en:SAVVA Talk" // Optional: filter by category
});
```

---

## Estructura del objeto de publicación

El método `content-list` devuelve un arreglo de **objetos de publicación**. Cada uno contiene metadatos y punteros necesarios para obtener el contenido completo.

Example:

```json
{
  "author": {
    "address": "0x1234...",
    "avatar": "Qm...",
    "name": "alexna",
    "display_name": "Alex Na",
    "staked": "5000000000000000000000"
  },
  "category": "en:SAVVA Talk",
  "domain": "savva.app",
  "effective_time": "2025-08-20T10:30:00Z",
  "fund": {
    "amount": "125000000000000000000",
    "round_time": 1672531200,
    "total_author_share": "100000000000000000000"
  },
  "ipfs": "bafybeig.../info.yaml",
  "reactions": [10, 2, 0, 1],
  "savva_cid": "0x01701...cfa2",
  "short_cid": "aBcDeF1",
  "tags": ["decentralization", "social"],
  "savva_content": {
    "data_cid": "bafybeig...",
    "locales": {
      "en": {
        "text_preview": "This is a short preview of the post content...",
        "title": "My First Post on SAVVA"
      },
      "ru": {
        "text_preview": "Это короткий анонс содержания поста...",
        "title": "Мой первый пост на SAVVA"
      }
    },
    "thumbnail": "thumbnail.jpg"
  }
}
```

### Campos clave explicados

* **author** — información del perfil del autor (incluyendo la cantidad apostada).
* **savva\_cid / short\_cid** — IDs únicos. Úsalos para construir URLs (`/post/<short_cid>`).
* **ipfs / savva\_content.data\_cid** — apuntadores al contenido en IPFS.
* **savva\_content** — metadatos almacenados en caché por el backend (títulos, vistas previas, miniaturas). Útiles para renderizar el feed sin requerir una petición a IPFS.
* **fund** — información del fondo de financiación de la publicación.
* **reactions** — arreglo con los contadores para cada tipo de reacción.

---

## Paso 2: Resolver el contenido completo desde IPFS

Aunque `savva_content` es útil para las vistas previas, el contenido completo debe recuperarse desde IPFS (cuerpo de la publicación, capítulos, activos).

### Resolución de rutas de contenido

La ubicación de `info.yaml` depende del formato:

* **Formato moderno**

  * `savva_content.data_cid` = CID base para los activos.
  * `ipfs` = ruta directa a `info.yaml`.
* **Formato heredado**

  * Sin `data_cid`.
  * `ipfs` = CID base. Se asume el descriptor en `<ipfs>/info.yaml`.

### Utility Functions

Usa los helpers de `src/ipfs/utils.js`:

```js
import {
  getPostDescriptorPath,
  getPostContentBaseCid,
  resolvePostCidPath
} from "../../ipfs/utils.js";

const post = { ... };

// 1. Path to descriptor file
const descriptorPath = getPostDescriptorPath(post);

// 2. Base CID for assets
const contentBaseCid = getPostContentBaseCid(post);

// 3. Resolve relative path (e.g., thumbnail)
const fullThumbnailPath = resolvePostCidPath(post, post.savva_content.thumbnail);
```

---

## Priorización de gateways de IPFS

Orden de obtención:

1. **Local node** (si está habilitado).
2. **Post-specific gateways** (listados en el descriptor).
3. **System gateways** (backend `/info`).

Esto garantiza la mejor velocidad y disponibilidad.

---

## El descriptor de la publicación (`info.yaml`)

Un archivo YAML que define la estructura completa: idiomas, capítulos, metadatos.

### Example `info.yaml`

```yaml
thumbnail: assets/post_thumbnail.png
gateways:
  - https://my-fast-pinning-service.cloud

locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    tags: ["blockchain", "systems", "web3"]
    categories: ["Technology"]
    data_path: content/en/main.md
    chapters:
      - title: "What is a Blockchain?"
        data_path: content/en/chapter1.md
      - title: "IPFS and Content Addressing"
        data_path: content/en/chapter2.md
  
  ru:
    title: "Понимание децентрализованных систем"
    text_preview: "Глубокое погружение в основные концепции децентрализации..."
    tags: ["блокчейн", "системы", "web3"]
    categories: ["Технологии"]
    data_path: content/ru/main.md
    chapters:
      - title: "Что такое блокчейн?"
        data_path: content/ru/chapter1.md
      - title: "IPFS и контентная адресация"
        data_path: content/ru/chapter2.md
```

### Campos clave del descriptor

* **thumbnail** — ruta relativa a la imagen principal.
* **gateways** — gateways IPFS recomendadas (opcional).
* **locales** — objeto indexado por códigos de idioma.

  * **title / text\_preview / tags / categories** — metadatos específicos por idioma.
  * **data\_path** — contenido principal en Markdown para ese idioma.
  * **chapters** — arreglo de capítulos, cada uno con `title` y `data_path`.

Para obtener el contenido completo de un capítulo:

```txt
<content_base_cid>/content/en/chapter1.md
```