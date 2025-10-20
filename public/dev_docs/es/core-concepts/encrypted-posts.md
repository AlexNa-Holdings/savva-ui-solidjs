# Publicaciones cifradas

Savva admite publicaciones cifradas de extremo a extremo que solo pueden ser vistas por suscriptores. Esta función permite a los creadores publicar contenido exclusivo para sus suscriptores de pago mientras asegura que ni la plataforma ni las pasarelas IPFS puedan leer el contenido.

## Resumen

El sistema de cifrado usa un enfoque multinivel:

1. **Claves de lectura**: Los usuarios generan pares de claves X25519 de forma determinista a partir de firmas de la wallet
2. **Cifrado de la publicación**: Cada publicación obtiene una clave de cifrado única
3. **Distribución de claves**: La clave de la publicación se cifra por separado para cada destinatario elegible
4. **Cifrado de contenido**: Todo el contenido de la publicación (texto, imágenes, vídeos, audio) se cifra con la clave de la publicación
5. **Descifrado por streaming**: Los medios cifrados se descifran en tiempo real usando Service Workers

## Claves de lectura

### ¿Qué es una Clave de Lectura?

Una Clave de Lectura es un par de claves X25519 que permite a los usuarios recibir y descifrar publicaciones cifradas. Consiste en:
- **Clave pública**: Publicada on-chain en el contrato UserProfile (visible para todos)
- **Clave privada**: Derivada de forma determinista a partir de la firma de la wallet del usuario (nunca sale del navegador)
- **Nonce**: Un valor aleatorio usado para la derivación de la clave (publicado on-chain)
- **Esquema**: Identificador del esquema de cifrado (`x25519-xsalsa20-poly1305`)

### Proceso de generación de claves

Las claves de lectura se generan de forma determinista a partir de firmas de la wallet usando los siguientes pasos:

1. **Generar Nonce aleatorio**
   ```javascript
   const nonce = crypto.getRandomValues(new Uint8Array(10));
   // Example: "a1b2c3d4e5f6g7h8i9j0"
   ```

2. **Crear EIP-712 Typed Data**
   ```javascript
   const typedData = {
     types: {
       EIP712Domain: [
         { name: "name", type: "string" },
         { name: "version", type: "string" }
       ],
       ReadingKey: [
         { name: "context", type: "string" },
         { name: "scheme", type: "string" },
         { name: "nonce", type: "string" }
       ]
     },
     primaryType: "ReadingKey",
     domain: {
       name: "SAVVA",
       version: "1"
     },
     message: {
       context: "SAVVA Reading Key",
       scheme: "x25519-xsalsa20-poly1305",
       nonce: nonce
     }
   };
   ```

3. **Solicitar firma a la wallet**
   ```javascript
   const signature = await ethereum.request({
     method: "eth_signTypedData_v4",
     params: [userAddress, JSON.stringify(typedData)]
   });
   // Returns: 0x + 130 hex chars (r: 64, s: 64, v: 2)
   ```

4. **Extraer r||s de la firma**
   ```javascript
   // Ignore the recovery byte 'v', use only r and s
   const rsBytes = signature.slice(2, 130); // 128 hex chars = 64 bytes
   ```

5. **Derivar semilla usando HKDF-SHA256**
   ```javascript
   const salt = "SAVVA Reading Key:salt";
   const info = `SAVVA Reading Key:x25519-xsalsa20-poly1305:${nonce}`;
   const seed = hkdf(sha256, rsBytes, salt, info, 32);
   ```

6. **Generar par de claves X25519**
   ```javascript
   const secretKey = seed; // 32 bytes (clamped by x25519 library)
   const publicKey = x25519.getPublicKey(secretKey);
   ```

7. **Publicar información pública**
   ```javascript
   // Store in UserProfile contract:
   - reading_public_key: hex string (64 chars)
   - reading_key_scheme: "x25519-xsalsa20-poly1305"
   - reading_key_nonce: hex string (20 chars)
   ```

**Implementación**: [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js)

### Beneficios de la derivación de claves

El enfoque de derivación determinista tiene varias ventajas:

- ✅ **Reproducible**: El mismo nonce + firma siempre produce el mismo par de claves
- ✅ **No requiere almacenamiento**: La clave secreta puede ser re-derivada cuando sea necesario
- ✅ **Control del usuario**: Los usuarios pueden elegir si almacenar la clave en localStorage del navegador
- ✅ **Rotación de claves**: Generar nuevas claves con nonces diferentes
- ✅ **Multidispositivo**: La misma clave en cualquier dispositivo con la misma wallet

### Almacenamiento de Claves de Lectura (Opcional)

Los usuarios pueden opcionalmente almacenar su clave secreta de lectura en localStorage del navegador para evitar volver a firmar cada vez que vean contenido cifrado.

**Formato de almacenamiento**:
```javascript
localStorage["savva_reading_keys"] = {
  "0xUserAddress": [
    {
      nonce: "a1b2c3d4e5f6g7h8i9j0",
      secretKey: "hex64chars...",
      publicKey: "hex64chars...",
      timestamp: 1234567890
    }
    // Multiple keys for key rotation
  ]
}
```

**Implementación**: [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js)

### Publicar Claves de Lectura

Para publicar publicaciones cifradas o recibir contenido cifrado, los usuarios deben publicar su clave pública de lectura en la blockchain:

```javascript
// User flow:
1. Generate reading key (signs EIP-712 message)
2. Publish to UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce
3. Transaction confirmed on-chain
4. Public key now discoverable by content creators
```

La clave pública se almacena en el contrato inteligente **UserProfile** y se asocia con la dirección y el dominio del usuario.

## Creación de publicaciones cifradas

### Cuándo se cifran las publicaciones

Las publicaciones se cifran en los siguientes escenarios:

1. **Publicaciones solo para suscriptores**: El creador selecciona audiencia "Subscribers Only"
2. **Comentarios en publicaciones cifradas**: Los comentarios heredan el cifrado de la publicación padre

### Proceso de cifrado de la publicación

#### Paso 1: Generar la clave de cifrado de la publicación

Cada publicación cifrada obtiene un par de claves X25519 único:

```javascript
const postKey = {
  secretKey: randomBytes(32),  // Random secret key
  publicKey: x25519.getPublicKey(secretKey)
};
```

Esta clave se usa para cifrar todo el contenido de esta publicación específica.

**Implementación**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:23-31)

#### Paso 2: Determinar destinatarios

El sistema construye una lista de destinatarios que podrán descifrar la publicación.

##### Para publicaciones regulares solo para suscriptores:

1. **Obtener suscriptores elegibles**
   ```javascript
   // Query backend for users who:
   - Have active subscriptions (weeks > 0)
   - Meet minimum payment threshold
   - To the ACTOR (the account posting - could be user or NPO)
   ```

2. **Obtener claves de lectura**
   ```javascript
   // For each subscriber, fetch from UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce

   // Skip subscribers without reading keys
   ```

3. **Agregar usuario autorizado**
   ```javascript
   // Ensure the wallet owner can decrypt their own post
   if (!recipients.includes(authorizedUser)) {
     recipients.push(authorizedUser);
   }
   ```

4. **Agregar Big Brothers** (Moderadores del dominio)
   ```javascript
   // Fetch from domain configuration
   const bigBrothers = domain.big_brothers || [];

   // Add each big_brother to recipients if they have reading keys
   for (const address of bigBrothers) {
     const readingKey = await fetchReadingKey(address);
     if (readingKey) {
       recipients.push(address);
     }
   }
   ```

**Implementación**: [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js)

##### Para comentarios en publicaciones cifradas:

```javascript
// Use the same recipients as the parent post
const parentEncryption = await fetchParentPostEncryption(parentCid);
const recipients = parentEncryption.recipients;

// Ensure commenter and big_brothers are included
```

**Implementación**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:214-259)

#### Paso 3: Cifrar el contenido de la publicación

El contenido de la publicación se cifra con la clave secreta del post. **Nota**: El título queda sin cifrar para permitir su visualización en las tarjetas de publicaciones, mientras que el texto de vista previa y el contenido sí están cifrados:

```javascript
// For each locale:
{
  title: title,  // NOT encrypted - remains public for display
  text_preview: encryptText(preview, postSecretKey),
  categories: categories,  // NOT encrypted - public for indexing
  tags: tags  // NOT encrypted - public for indexing
}
```

Qué se cifra:
- ✅ Texto de vista previa (`text_preview`)
- ✅ Títulos de capítulo
- ✅ Todos los archivos de contenido (markdown, medios)

Qué permanece público:
- ❌ Título de la publicación
- ❌ Categorías
- ❌ Etiquetas

Formato de cifrado: `nonce:ciphertext` (ambos codificados en hex)

Algoritmo: XSalsa20-Poly1305 (cifrado autenticado)

#### Paso 4: Cifrar la clave del post para cada destinatario

Para cada destinatario, cifra la clave secreta del post usando su clave pública de lectura:

```javascript
for (const recipient of recipients) {
  // Generate ephemeral keypair for this recipient
  const ephemeralKey = x25519.utils.randomPrivateKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralKey);

  // Compute shared secret using ECDH
  const sharedSecret = x25519.getSharedSecret(
    ephemeralKey,
    recipient.publicKey
  );

  // Encrypt post secret key with shared secret
  const nonce = randomBytes(24);
  const cipher = xsalsa20poly1305(sharedSecret, nonce);
  const encryptedKey = cipher.encrypt(postSecretKey);

  // Store for this recipient
  encryption.keys.push({
    address: recipient.address,
    encrypted_key: bytesToHex(encryptedKey),
    ephemeral_public_key: bytesToHex(ephemeralPublicKey),
    nonce: bytesToHex(nonce)
  });
}
```

Esto usa la construcción **X25519 + XSalsa20-Poly1305** (similar a `crypto_box` de NaCl).

**Implementación**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:97-122)

#### Paso 5: Cifrar archivos (imágenes, vídeos, audio)

Todos los archivos subidos se cifran antes de enviarlos a IPFS:

##### Archivos pequeños (< 1 MB)
```javascript
// Simple encryption: nonce + encrypted data
const nonce = randomBytes(24);
const cipher = xsalsa20poly1305(postSecretKey, nonce);
const encrypted = cipher.encrypt(fileData);

const encryptedFile = new Uint8Array(24 + encrypted.length);
encryptedFile.set(nonce, 0);
encryptedFile.set(encrypted, 24);
```

##### Archivos grandes (≥ 1 MB)
```javascript
// Chunked encryption for streaming (256 KB chunks)
// Header format:
{
  magic: "SAVVA_EC",
  version: 1,
  chunkSize: 262144,  // 256 KB
  totalChunks: n,
  originalSize: bytes
}

// Each chunk independently encrypted:
for each chunk {
  nonce = randomBytes(24);
  cipher = xsalsa20poly1305(postSecretKey, nonce);
  encryptedChunk = nonce + cipher.encrypt(chunk);
}
```

Esto permite el **descifrado por streaming**: los vídeos pueden comenzar a reproducirse antes de que todo el archivo esté descifrado.

**Implementación**: [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js), [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js)

#### Paso 6: Construir metadatos de cifrado

El descriptor incluye metadatos de cifrado:

```yaml
savva_spec_version: "2.0"
data_cid: QmXXX...
encrypted: true
locales:
  en:
    title: "My Post Title"  # NOT encrypted - public for display
    text_preview: "a1b2c3d4:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b..."
    tags:
      - "technology"  # NOT encrypted - public for indexing
      - "tutorial"
    categories:
      - "programming"  # NOT encrypted - public for indexing
    data_path: en/data.md
    chapters:
      - title: "nonce4:encrypted_chapter_title"
        data_path: en/chapters/1.md

encryption:
  type: "x25519-xsalsa20-poly1305"
  reading_key_nonce: "abc123..."  # Publisher's reading key nonce
  reading_public_key: "def456..." # Publisher's reading public key
  keys:
    - address: "0xSubscriber1"
      encrypted_key: "789ghi..."
      ephemeral_public_key: "jkl012..."
      nonce: "mno345..."
    - address: "0xSubscriber2"
      encrypted_key: "678pqr..."
      ephemeral_public_key: "stu901..."
      nonce: "vwx234..."
    # ... one entry per recipient
```

**Implementación**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:167-211)

## Big Brothers (Moderadores del dominio)

Big Brothers son direcciones especiales configuradas a nivel de dominio que obtienen automáticamente acceso a **todas las publicaciones cifradas** en ese dominio. Esto permite la moderación de contenido manteniendo el cifrado de extremo a extremo.

### Configuración

Los Big Brothers se configuran en el archivo `config.json`:

```javascript
{
  "domains": [
    {
      "name": "example.com",
      "big_brothers": [
        "0x1234567890123456789012345678901234567890",
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      ]
      // ...
    }
  ]
}
```

### Cómo funcionan los Big Brothers

1. **Inclusión automática**: Al crear una publicación cifrada, el sistema:
   - Obtiene `big_brothers` desde la configuración del dominio
   - Obtiene claves de lectura para cada big brother
   - Los añade a la lista de destinatarios
   - Cifra la clave del post para cada big brother

2. **Desduplicación**: Si un big brother ya es suscriptor, no se duplica

3. **Fallo con gracia**: Si un big brother no tiene clave de lectura, se omite (se registra pero no bloquea la publicación)

**Implementación**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:280-322)

### Casos de uso

- **Moderación de contenido**: Revisar publicaciones cifradas por violaciones de políticas
- **Soporte al cliente**: Ayudar a usuarios con problemas de contenido cifrado
- **Cumplimiento legal**: Acceso por parte de la ley con la debida autorización
- **Acceso de respaldo**: Propietarios de dominio manteniendo acceso al contenido

## Descifrado de publicaciones

### Flujo de descifrado automático

Cuando un usuario ve una publicación cifrada:

1. **Comprobar cifrado de la publicación**
   ```javascript
   if (post.content.encrypted && !post._decrypted) {
     // Post is encrypted and not yet decrypted
   }
   ```

2. **Comprobar elegibilidad del usuario**
   ```javascript
   const canDecrypt = encryption.keys.some(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );
   ```

3. **Obtener clave secreta de lectura**
   ```javascript
   // Option 1: Retrieve from localStorage
   const storedKey = findStoredSecretKey(userAddress, nonce);

   // Option 2: Re-derive from wallet signature
   if (!storedKey) {
     const signature = await signReadingKeyMessage(userAddress, nonce);
     const secretKey = deriveKeyFromSignature(signature, nonce);
   }
   ```

4. **Descifrar la clave secreta del post**
   ```javascript
   // Find encrypted key for this user
   const keyEntry = encryption.keys.find(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );

   // Compute shared secret using ECDH
   const sharedSecret = x25519.getSharedSecret(
     userSecretKey,
     keyEntry.ephemeral_public_key
   );

   // Decrypt the post secret key
   const cipher = xsalsa20poly1305(sharedSecret, keyEntry.nonce);
   const postSecretKey = cipher.decrypt(keyEntry.encrypted_key);
   ```

5. **Descifrar metadatos**
   ```javascript
   // Decrypt preview text (title, tags, and categories are public)
   post.text_preview = decryptText(post.text_preview, postSecretKey);
   // Title, tags, and categories remain as-is (not encrypted)
   ```

6. **Establecer contexto de cifrado**
   ```javascript
   // For automatic media decryption
   setEncryptedPostContext({ dataCid, postSecretKey });
   swManager.setEncryptionContext(dataCid, postSecretKey);
   ```

7. **Descifrar medios en tiempo real**
   ```javascript
   // Service Worker intercepts all IPFS requests
   // For URLs matching dataCid:
   - Fetch encrypted file
   - Detect encryption format (simple or chunked)
   - Decrypt chunks as needed
   - Stream decrypted bytes to browser

   // Result: videos play immediately, seeking works
   ```

**Implementación**: [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js), [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx:263-291)

### Descifrado por streaming de medios

Los archivos de medios cifrados (vídeos, audio) se descifran en tiempo real usando Service Workers:

```javascript
// Service Worker intercepts fetch
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.includes(dataCid)) {
    // This is an encrypted resource
    event.respondWith(streamDecrypt(event.request));
  }
});

async function streamDecrypt(request) {
  // Fetch encrypted file
  const response = await fetch(request);
  const encrypted = await response.arrayBuffer();

  // Check format
  if (isChunkedFormat(encrypted)) {
    // Decrypt specific chunks for Range request
    const range = parseRangeHeader(request.headers.get('range'));
    const chunks = getChunksForRange(range);

    // Decrypt only needed chunks
    const decrypted = chunks.map(i => decryptChunk(encrypted, i));

    return new Response(decrypted, {
      status: 206,
      headers: { 'Content-Range': ... }
    });
  } else {
    // Decrypt entire file
    const decrypted = decryptSimple(encrypted);
    return new Response(decrypted);
  }
}
```

Consulta [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) para documentación detallada sobre el sistema de cifrado por streaming.

## Consideraciones de seguridad

### Algoritmos de cifrado

- **X25519**: Elliptic Curve Diffie-Hellman (seguridad de 256 bits)
- **XSalsa20-Poly1305**: Cifrado autenticado (AEAD)
- **HKDF-SHA256**: Función de derivación de claves
- **EIP-712**: Firmas de datos estructurados

### Gestión de claves

✅ **Seguro**:
- Las claves privadas nunca salen del navegador
- Las claves se derivan determinísticamente de firmas de la wallet
- El Service Worker se ejecuta en la misma origin
- Los contextos de cifrado tienen TTL (30 minutos)
- Las claves se borran al navegar fuera de la página

⚠️ **Limitaciones**:
- Vulnerable a ataques XSS (claves en memoria)
- Extensiones del navegador con acceso total pueden robar claves
- No hay protección contra acceso físico al dispositivo
- Las pasarelas IPFS ven datos cifrados (pero no pueden descifrarlos)

### Modelo de amenazas

Protegido contra:
- ✅ Espionaje por parte de pasarelas IPFS
- ✅ Ataques man-in-the-middle (HTTPS + AEAD)
- ✅ Manipulación de datos (autenticación Poly1305)
- ✅ Ataques de reproducción (nonces únicos por mensaje)

NO protegido contra:
- ❌ Extensiones maliciosas del navegador
- ❌ Vulnerabilidades XSS en la aplicación
- ❌ Dispositivos de usuario comprometidos
- ❌ Usuarios que compartan sus claves secretas

### Buenas prácticas

1. **Usar siempre HTTPS** en producción
2. **Almacenar claves de forma segura** - localStorage es opcional, no obligatorio
3. **Borrar contextos** al navegar fuera
4. **Validar destinatarios** antes de cifrar
5. **Usar contraseñas fuertes** para la copia de seguridad de la wallet
6. **Auditar Big Brothers** regularmente
7. **Monitorizar registros de acceso** para actividad sospechosa

## Archivos de implementación

### Cifrado central
- [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js) - Generación y gestión de claves de lectura
- [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js) - Almacenamiento en el navegador para claves de lectura
- [`src/x/crypto/readingKeyEncryption.js`](../../../../src/x/crypto/readingKeyEncryption.js) - X25519 + XSalsa20-Poly1305 encryption
- [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js) - Cifrado del contenido de la publicación
- [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js) - Descifrado del contenido de la publicación
- [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js) - Cifrado de archivos (simple + por chunks)
- [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js) - Cifrado por chunks para archivos grandes

### Gestión de destinatarios
- [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js) - Obtener suscriptores con claves de lectura
- [`src/x/crypto/fetchParentPostEncryption.js`](../../../../src/x/crypto/fetchParentPostEncryption.js) - Obtener destinatarios de la publicación padre

### Flujo de publicación
- [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx) - Creación del descriptor con cifrado
- [`src/x/editor/wizard_steps/StepUploadIPFS.jsx`](../../../../src/x/editor/wizard_steps/StepUploadIPFS.jsx) - Cifrado de archivos antes de la subida

### Flujo de visualización
- [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx) - Visualización de publicaciones con descifrado automático
- [`src/ipfs/encryptedFetch.js`](../../../../src/ipfs/encryptedFetch.js) - Obtención desde IPFS con descifrado

### Descifrado por streaming
- [`src/x/crypto/serviceWorkerManager.js`](../../../../src/x/crypto/serviceWorkerManager.js) - Gestión del Service Worker
- [`public/crypto-sw.js`](../../../../public/crypto-sw.js) - Service Worker para descifrado por streaming
- [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) - Documentación detallada del cifrado por streaming

## Flujo de experiencia de usuario

### Para creadores de contenido

1. **Configuración inicial**
   - Generar Clave de Lectura (firmar mensaje EIP-712)
   - Publicar en la blockchain
   - Opcionalmente almacenar en el navegador

2. **Publicar una publicación cifrada**
   - Escribir contenido en el editor
   - Seleccionar audiencia "Subscribers Only"
   - El sistema automáticamente:
     - Obtiene suscriptores elegibles
     - Genera clave de cifrado para la publicación
     - Cifra el contenido
     - Cifra los archivos
     - Sube a IPFS
     - Publica el descriptor en la blockchain

3. **Ver sus propias publicaciones cifradas**
   - Se descifran automáticamente usando la clave almacenada o re-derivada
   - Los medios se transmiten sin problemas

### Para suscriptores

1. **Configuración inicial**
   - Generar Clave de Lectura
   - Publicar en la blockchain
   - Suscribirse al creador

2. **Ver publicaciones cifradas**
   - Abrir publicación cifrada
   - El sistema comprueba la elegibilidad
   - Recupera o re-deriva la clave secreta
   - Descifra la publicación automáticamente
   - Los medios se reproducen con descifrado por streaming

3. **Opciones de almacenamiento de clave**
   - Almacenar en el navegador: No se requiere volver a firmar
   - No almacenar: Firmar el mensaje cada vez (más seguro)

### Para Big Brothers (moderadores)

1. **Configuración**
   - Generar Clave de Lectura
   - El administrador del dominio añade la dirección a la lista `big_brothers`
   - Se incluye automáticamente en todas las publicaciones cifradas

2. **Moderación**
   - Acceder a todo el contenido cifrado en el dominio
   - Revisar por violaciones de políticas
   - Tomar las acciones apropiadas

## Solución de problemas

### "No se encontró clave de lectura"
- El usuario aún no ha generado una clave de lectura
- Solicitar generar y publicar

### "Fallo al descifrar la publicación"
- La clave de lectura del usuario no está en la lista de destinatarios
- Comprobar estado de suscripción
- Verificar la configuración de `big_brothers`

### "El medio no se reproduce"
- Service Worker no registrado (requiere HTTPS)
- Contexto de cifrado no establecido
- Revisar la consola del navegador para errores

### "No hay suscriptores elegibles"
- Ningún suscriptor ha publicado claves de lectura
- Informar a los suscriptores que generen claves de lectura
- Comprobar el umbral mínimo de pago

## Mejoras futuras

- **Rotación de claves**: Soporte para múltiples claves de lectura activas por usuario
- **Copia de seguridad y recuperación**: Respaldo cifrado de claves con frase de recuperación
- **Wallets hardware**: Derivación de clave de lectura con Ledger/Trezor
- **Compartición selectiva**: Accesos temporales para publicaciones específicas
- **Analítica**: Métricas preservando la privacidad para contenido cifrado
- **Soporte WebAuthn**: Claves de lectura derivadas de credenciales WebAuthn

## Documentación relacionada

- [Publishing Posts](/docs/core-concepts/publishing-posts) - Flujo general de publicación de posts
- [Showing Posts](/docs/core-concepts/showing-posts) - Visualización y renderizado de posts
- [User Profile](/docs/core-concepts/user-profile) - Contrato de perfil y datos de usuario
- [Streaming Encryption](../../../../STREAMING_ENCRYPTION.md) - Documentación detallada de descifrado por streaming (código fuente)
- [Content Format](/docs/features/content-format) - Especificación del formato del descriptor