# Publicar una entrada

Publicar contenido en la plataforma SAVVA es un proceso de tres pasos que garantiza la integridad de los datos, la descentralización y la verificación on-chain. El flujo implica preparar los datos de la entrada localmente, subir el contenido y su descriptor a IPFS y, finalmente, registrar la entrada en la blockchain mediante una llamada a un contrato inteligente.

El editor del frontend automatiza este proceso mediante un asistente, pero entender los pasos subyacentes es crucial para los desarrolladores.

---

## Paso 1: Preparar los datos de la publicación

Antes de que ocurra cualquier subida o transacción, el editor organiza la entrada en una estructura de directorios estandarizada. Esta estructura se gestiona localmente usando la File System API.

Los componentes principales son:

* Un archivo de parámetros (`params.json`) para la configuración específica del editor.
* Un archivo descriptor (`info.yaml`) que define la estructura y metadatos de la entrada para IPFS.
* Archivos Markdown para el contenido de cada idioma.
* Un directorio `uploads/` para cualquier archivo multimedia asociado (imágenes, vídeos, etc.).

### Ejemplo de `params.json`

Este archivo contiene ajustes usados por la UI del editor y no se publica on-chain.

```json
{
  "guid": "c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a",
  "nsfw": false,
  "fundraiser": 0,
  "publishAsNewPost": true,
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

### Ejemplo de `info.yaml` (El descriptor de la publicación)

Este archivo es la definición canónica de la entrada y se sube a IPFS. Enlaza todas las piezas de contenido entre sí.

```yaml
savva_spec_version: "2.0"
data_cid: bafybeih...
gateways:
  - https://ipfs.io/
locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    data_path: "en/data.md"
    chapters:
      - data_path: "en/chapters/1.md"
      - data_path: "en/chapters/2.md"
```

* **data\_cid**: El CID de IPFS del directorio que contiene todo el contenido Markdown y los archivos subidos.
* **locales**: Contiene metadatos específicos por idioma. El título y el `text\_preview` del editor se almacenan aquí.
* **data\_path / chapters.data\_path**: Rutas relativas a los archivos de contenido dentro del directorio apuntado por `data_cid`.

---

## Paso 2: Subir a IPFS

El proceso de subida ocurre en dos fases distintas, gestionadas por la API de almacenamiento del backend.

1. **Subir el directorio de contenido**: Todos los archivos de contenido (por ejemplo, `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) se suben como un único directorio a IPFS. El backend devuelve un único CID de IPFS para este directorio, que se convierte en el `data_cid`.
2. **Subir el descriptor**: El archivo `info.yaml` se genera con el `data_cid` del paso anterior. Este archivo YAML se sube a IPFS como un archivo independiente. El CID de este archivo `info.yaml` es el puntero final de IPFS para la entrada.

---

## Paso 3: Registrar en la blockchain

El paso final es registrar la entrada en la blockchain llamando a la función `reg` del contrato inteligente `ContentRegistry`.

El frontend ejecuta esta transacción con los siguientes parámetros:

* **domain**: El nombre de dominio actual (p. ej., `savva.app`).
* **author**: La dirección de la wallet del usuario.
* **guid**: El identificador único de `params.json`.
* **ipfs**: El CID de IPFS del archivo descriptor `info.yaml` del Paso 2.
* **content\_type**: Una cadena `bytes32`, típicamente `post` para contenido nuevo o `post-edit` para actualizaciones.

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

Una vez que la transacción se mina con éxito, la entrada queda oficialmente publicada y aparecerá en los feeds de contenido.