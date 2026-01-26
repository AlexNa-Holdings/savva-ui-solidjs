# Publicación de una Entrada

Publicar contenido en la plataforma SAVVA es un proceso de tres pasos que garantiza la integridad de los datos, la descentralización y la verificación en la cadena. El flujo implica preparar los datos de la publicación localmente, subir el contenido y su descriptor a IPFS y, finalmente, registrar la publicación en la blockchain mediante una llamada a un contrato inteligente.

El editor frontend automatiza este proceso mediante un asistente, pero entender los pasos subyacentes es crucial para los desarrolladores.

---

## Paso 1: Preparar los Datos de la Publicación

Antes de que ocurra cualquier subida o transacción, el editor organiza la publicación en una estructura de directorios estandarizada. Esta estructura se gestiona localmente usando la API de sistema de archivos.

Los componentes principales son:

* Un archivo de parámetros (`params.json`) para la configuración específica del editor.
* Un archivo descriptor (`info.yaml`) que define la estructura y los metadatos de la publicación para IPFS.
* Archivos Markdown para el contenido de cada idioma.
* Un directorio `uploads/` para cualquier archivo multimedia asociado (imágenes, vídeos, etc.).

### Ejemplo `params.json`

Este archivo contiene ajustes usados por la interfaz del editor y no se publica en la cadena.

```json
{
  "guid": "c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a",
  "nsfw": false,
  "fundraiser": 0,
  "publishAsNewPost": true,
  "audience": "subscribers",
  "minWeeklyPaymentWei": "1000000000000000000000",
  "allowPurchase": true,
  "purchasePriceWei": "99000000000000000000",
  "locales": {
    "en": {
      "tags": ["decentralization", "social"],
      "categories": ["Technology"],
      "chapters": [
        { "title": "What is a Blockchain?" },
        { "title": "IPFS and Content Addressing" }
      ]
    }
  },
  "thumbnail": "uploads/thumbnail.png"
}
```

**Parámetros de Audiencia y Control de Acceso:**

* **audience**: O `"public"` (por defecto) o `"subscribers"` para publicaciones solo para suscriptores.
* **minWeeklyPaymentWei**: Pago semanal mínimo en staking requerido para acceder a la publicación (en wei, como cadena).
* **allowPurchase**: Si es `true`, permite el acceso mediante compra única para usuarios que no sean suscriptores.
* **purchasePriceWei**: Precio para el acceso por compra única en tokens SAVVA (en wei, como cadena).

---

## Paso 2: El Descriptor de la Publicación (`info.yaml`)

Este archivo es la definición canónica de la publicación y se sube a IPFS. Vincula todas las piezas de contenido y contiene información de control de acceso y cifrado.

### Descriptor de Publicación Pública

Para publicaciones públicas, el descriptor es sencillo:

```yaml
savva_spec_version: "2.0"
data_cid: bafybeih...
guid: c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a
recipient_list_type: public
gateways:
  - https://ipfs.io/
locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    tags: []
    categories: []
    data_path: "en/data.md"
    chapters:
      - data_path: "en/chapters/1.md"
      - data_path: "en/chapters/2.md"
```

### Descriptor para Publicaciones Solo para Suscriptores (Cifrado)

Para publicaciones solo para suscriptores, el descriptor incluye campos adicionales de control de acceso y un bloque `encryption`:

```yaml
savva_spec_version: "2.0"
data_cid: QmaHRmTymgC9unG14rHJpwfv6DWFgzuJjVhtjHcY8cCjkS
guid: 249c62bd-54f7-4865-bc83-922d21ed90a6
recipient_list_type: subscribers
recipient_list_min_weekly: "1000000000000000000000"
gateways:
  - https://savva.myfilebase.com/ipfs/
  - https://test.savva.app/api/ipfs/
locales:
  en:
    title: "Premium Content Title"
    text_preview: "0ee338af352029c34bfc65ab2d39bcb4622a08206a247f8e:f3f352e0df63aaac..."
    tags: []
    categories: []
    data_path: en/data.md
    chapters: []
encryption:
  type: x25519-xsalsa20-poly1305
  key_exchange_alg: x25519
  key_exchange_pub_key: cb8711e46877d7775a55d6ae446d445b500ce77f6a5514999d275280eceb707e
  access_type: for_subscribers_only
  min_weekly_pay: "1000000000000000000000"
  allow_purchase: true
  purchase_price: "99000000000000000000"
  processor_address: "0xC0959416606AEd87B09f6B205BbAD2e0cA0A9f48"
  purchase_token: "0x99eadb13da88952c18f980bd6b910adba770130e"
  recipients:
    "0xe328b70d1db5c556234cade0df86b3afbf56dd32":
      pass: f3a7cc9fe83091b562273e5395d0ad1dca3ef0f9f06cfd22bee0180a39c8541c...
      pass_nonce: d326da17dfcc6e333fc036732954370407f66df0f1141518
      pass_ephemeral_pub_key: cca725f1a50a2614cf019115f7c7ac45d1bda916813dc038055b14409c5d5e59
      reading_public_key: 1f61298e54fd3da75192f509002fc7d9e10b019b55d1806e75c7efa836836418
      reading_key_scheme: x25519-xsalsa20-poly1305
      reading_key_nonce: 18d1609e898d5e252604
```

### Referencia de Campos del Descriptor

**Campos a nivel raíz:**

| Campo | Descripción |
|-------|-------------|
| `savva_spec_version` | Versión del esquema, actualmente `"2.0"` |
| `data_cid` | CID de IPFS del directorio que contiene todos los archivos de contenido |
| `guid` | Identificador único de la publicación |
| `recipient_list_type` | Tipo de acceso: `"public"` o `"subscribers"` |
| `recipient_list_min_weekly` | Pago semanal mínimo en wei (cadena) |
| `gateways` | Lista de gateways preferidos de IPFS para la recuperación de contenido |
| `locales` | Metadatos de contenido específicos por idioma |
| `encryption` | Bloque de cifrado (solo para publicaciones solo para suscriptores) |

**Campos por idioma:**

| Campo | Descripción |
|-------|-------------|
| `title` | Título de la publicación (siempre sin cifrar para mostrar) |
| `text_preview` | Texto de vista previa (cifrado como `nonce:ciphertext` para publicaciones de suscriptores) |
| `tags` | Array de etiquetas (siempre sin cifrar para indexación) |
| `categories` | Array de categorías (siempre sin cifrar para indexación) |
| `data_path` | Ruta relativa al archivo de contenido principal |
| `chapters` | Array de objetos de capítulos con `data_path` y `title` opcional |

**Campos del bloque de cifrado:**

| Campo | Descripción |
|-------|-------------|
| `type` | Esquema de cifrado: `x25519-xsalsa20-poly1305` |
| `key_exchange_alg` | Algoritmo de intercambio de claves: `x25519` |
| `key_exchange_pub_key` | Clave pública X25519 de la publicación (hex) |
| `access_type` | Restricción de acceso: `for_subscribers_only` |
| `min_weekly_pay` | Requisito mínimo de pago semanal en wei (cadena) |
| `allow_purchase` | Si la compra única está habilitada |
| `purchase_price` | Precio de compra en wei (cadena) |
| `processor_address` | Dirección del procesador de pagos para la verificación de compras |
| `purchase_token` | Dirección del contrato del token para pagos por compra (SAVVA) |
| `recipients` | Mapa de direcciones de destinatarios a sus claves de publicación cifradas |

**Campos de la entrada del destinatario:**

| Campo | Descripción |
|-------|-------------|
| `pass` | Clave secreta de la publicación cifrada (hex) |
| `pass_nonce` | Nonce usado para el cifrado (hex) |
| `pass_ephemeral_pub_key` | Clave pública efímera para ECDH (hex) |
| `reading_public_key` | Clave pública de lectura del destinatario (hex) |
| `reading_key_scheme` | Esquema de cifrado para la clave de lectura |
| `reading_key_nonce` | Nonce asociado con la clave de lectura |

---

## Flujo de Cifrado para Publicaciones Solo para Suscriptores

Al crear una publicación solo para suscriptores:

1. Generar clave de la publicación: Se genera un par de claves X25519 aleatorio para la publicación.
2. Cifrar el contenido: El cuerpo de la publicación y los archivos de capítulos se cifran usando XSalsa20-Poly1305 con la clave secreta de la publicación.
3. Cifrar vistas previas: El campo `text_preview` se cifra y se almacena como `nonce:ciphertext`.
4. Construir la lista de destinatarios: La clave de la publicación se cifra para cada destinatario elegible usando su clave de lectura publicada mediante intercambio de claves ECDH.
5. Incluir los destinatarios requeridos:
   - El autor de la publicación (siempre puede descifrar su propio contenido)
   - Todos los big_brothers configurados para el dominio
   - El procesador de pagos (si el acceso por compra está habilitado)
   - Suscriptores elegibles que cumplan con el requisito de pago mínimo

---

## Paso 3: Subir a IPFS

El proceso de subida ocurre en dos fases distintas, gestionadas por la API de almacenamiento del backend.

1. Subir el directorio de contenido: Todos los archivos de contenido (por ejemplo, `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) se suben como un único directorio a IPFS. Para publicaciones cifradas, estos archivos se cifran antes de la subida. El backend devuelve un único CID de IPFS para este directorio, que pasa a ser el `data_cid`.
2. Subir el descriptor: El archivo `info.yaml` se genera con el `data_cid` del paso anterior. Este archivo YAML se sube a IPFS como un archivo independiente. El CID de este archivo `info.yaml` es el puntero final de IPFS para la publicación.

---

## Paso 4: Registrar en la Cadena de Bloques

El paso final es registrar la publicación en la blockchain llamando a la función `reg` del contrato inteligente `ContentRegistry`.

El frontend ejecuta esta transacción con los siguientes parámetros:

* **domain**: El nombre de dominio actual (p. ej., `savva.app`).
* **author**: La dirección de la wallet del usuario.
* **guid**: El identificador único de `params.json`.
* **ipfs**: El CID de IPFS del archivo descriptor `info.yaml` obtenido en el Paso 3.
* **content\_type**: Un string `bytes32`, típicamente `post` para contenido nuevo o `post-edit` para actualizaciones.

### Ejemplo de llamada al contrato

```javascript
// From: src/x/editor/wizard_steps/StepPublish.jsx

const contract = await getSavvaContract(app, "ContentRegistry", { write: true });

const hash = await contract.write.reg([
  domain,           // "savva.app"
  user.address,     // "0x123..."
  guid,             // "c4a7f6b9-..."
  descriptorCid,    // "bafybeif..."
  toHexBytes32("post")
]);

// The UI then waits for the transaction to be confirmed
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

Una vez que la transacción se mina correctamente, la publicación se publica oficialmente y aparecerá en los feeds de contenido.