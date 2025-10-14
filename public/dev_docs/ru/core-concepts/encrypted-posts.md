# Зашифрованные публикации

Savva поддерживает сквозное шифрование публикаций, которые могут просматривать только подписчики. Эта функция позволяет создателям публиковать эксклюзивный контент для платных подписчиков, при этом платформа и IPFS-шлюзы не могут прочитать содержимое.

## Обзор

Система шифрования использует многоуровневый подход:

1. **Ключи чтения**: пользователи детерминированно генерируют X25519-ключевые пары из подписи кошелька  
2. **Шифрование публикации**: каждая публикация получает уникальный ключ шифрования  
3. **Распределение ключей**: ключ публикации отдельно шифруется для каждого получателя  
4. **Шифрование контента**: весь контент публикации (текст, изображения, видео, аудио) шифруется с помощью ключа публикации  
5. **Потоковая расшифровка**: зашифрованные медиаданные расшифровываются на лету с помощью Service Workers

## Ключи чтения

### Что такое ключ чтения?

Ключ чтения — это X25519-ключевая пара, которая позволяет пользователям получать и расшифровывать зашифрованные публикации. Он состоит из:
- **Публичный ключ**: публикуется в контракте UserProfile (виден всем)
- **Приватный ключ**: детерминированно выводится из подписи кошелька пользователя (никогда не покидает браузер)
- **Nonce**: случайное значение, используемое для вывода ключа (публикуется в цепочке)
- **Scheme**: идентификатор схемы шифрования (`x25519-xsalsa20-poly1305`)

### Процесс генерации ключа

Ключи чтения генерируются детерминированно из подписей кошелька с использованием следующих шагов:

1. **Генерация случайного nonce**
   ```javascript
   const nonce = crypto.getRandomValues(new Uint8Array(10));
   // Example: "a1b2c3d4e5f6g7h8i9j0"
   ```

2. **Создание EIP-712 typed data**
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

3. **Запрос подписи в кошельке**
   ```javascript
   const signature = await ethereum.request({
     method: "eth_signTypedData_v4",
     params: [userAddress, JSON.stringify(typedData)]
   });
   // Returns: 0x + 130 hex chars (r: 64, s: 64, v: 2)
   ```

4. **Извлечение r||s из подписи**
   ```javascript
   // Ignore the recovery byte 'v', use only r and s
   const rsBytes = signature.slice(2, 130); // 128 hex chars = 64 bytes
   ```

5. **Вывод сидa с помощью HKDF-SHA256**
   ```javascript
   const salt = "SAVVA Reading Key:salt";
   const info = `SAVVA Reading Key:x25519-xsalsa20-poly1305:${nonce}`;
   const seed = hkdf(sha256, rsBytes, salt, info, 32);
   ```

6. **Генерация X25519-ключевой пары**
   ```javascript
   const secretKey = seed; // 32 bytes (clamped by x25519 library)
   const publicKey = x25519.getPublicKey(secretKey);
   ```

7. **Публикация публичной информации**
   ```javascript
   // Store in UserProfile contract:
   - reading_public_key: hex string (64 chars)
   - reading_key_scheme: "x25519-xsalsa20-poly1305"
   - reading_key_nonce: hex string (20 chars)
   ```

**Реализация**: [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js)

### Преимущества детерминированного вывода ключа

Детерминированный подход к выводу ключа имеет несколько преимуществ:

- ✅ **Воспроизводимость**: тот же nonce + подпись всегда производят одну и ту же ключевую пару  
- ✅ **Не требует хранения**: секретный ключ можно пересоздать при необходимости  
- ✅ **Контроль пользователя**: пользователь сам решает, сохранять ли ключ в localStorage браузера  
- ✅ **Ротация ключей**: можно генерировать новые ключи с разными nonce  
- ✅ **Мультиустройство**: одинаковый ключ на любом устройстве с тем же кошельком

### Сохранение ключей чтения (необязательно)

Пользователи могут по желанию сохранять свой секретный ключ чтения в localStorage браузера, чтобы не подписывать сообщение каждый раз при просмотре зашифрованного контента.

**Формат хранения**:
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

**Реализация**: [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js)

### Публикация ключей чтения

Чтобы публиковать зашифрованные посты или получать зашифрованный контент, пользователи должны опубликовать свой публичный ключ чтения в блокчейне:

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

Публичный ключ хранится в смарт-контракте **UserProfile** и ассоциируется с адресом пользователя и доменом.

## Создание зашифрованных публикаций

### Когда публикации шифруются

Публикации шифруются в следующих сценариях:

1. **Только для подписчиков**: создатель выбирает аудиторию "Subscribers Only"  
2. **Комментарии к зашифрованным постам**: комментарии наследуют шифрование родительской публикации

### Процесс шифрования публикации

#### Шаг 1: Генерация ключа шифрования публикации

Каждая зашифрованная публикация получает уникальную X25519-ключевую пару:

```javascript
const postKey = {
  secretKey: randomBytes(32),  // Random secret key
  publicKey: x25519.getPublicKey(secretKey)
};
```

Этот ключ используется для шифрования всего контента данной публикации.

**Реализация**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:23-31)

#### Шаг 2: Определение получателей

Система формирует список получателей, которые смогут расшифровать публикацию.

##### Для обычных публикаций "только для подписчиков":

1. **Запросить подходящих подписчиков**
   ```javascript
   // Query backend for users who:
   - Have active subscriptions (weeks > 0)
   - Meet minimum payment threshold
   - To the ACTOR (the account posting - could be user or NPO)
   ```

2. **Запросить ключи чтения**
   ```javascript
   // For each subscriber, fetch from UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce

   // Skip subscribers without reading keys
   ```

3. **Добавить авторизованного пользователя**
   ```javascript
   // Ensure the wallet owner can decrypt their own post
   if (!recipients.includes(authorizedUser)) {
     recipients.push(authorizedUser);
   }
   ```

4. **Добавить Big Brothers** (модераторы домена)
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

**Реализация**: [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js)

##### Для комментариев к зашифрованным публикациям:

```javascript
// Use the same recipients as the parent post
const parentEncryption = await fetchParentPostEncryption(parentCid);
const recipients = parentEncryption.recipients;

// Ensure commenter and big_brothers are included
```

**Реализация**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:214-259)

#### Шаг 3: Шифрование содержимого публикации

Весь текстовый контент в дескрипторе шифруется с помощью секретного ключа публикации:

```javascript
// For each locale:
{
  title: encryptText(title, postSecretKey),
  text_preview: encryptText(preview, postSecretKey),
  tags: tags.map(t => encryptText(t, postSecretKey)),
  categories: categories.map(c => encryptText(c, postSecretKey))
}
```

**Формат шифрования**: `nonce:ciphertext` (обе части в hex-кодировке)

**Алгоритм**: XSalsa20-Poly1305 (аутентифицированное шифрование)

#### Шаг 4: Шифрование ключа публикации для каждого получателя

Для каждого получателя секретный ключ публикации шифруется с использованием его публичного ключа чтения:

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

Это использует конструкцию **X25519 + XSalsa20-Poly1305** (аналогично `crypto_box` из NaCl).

**Реализация**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:97-122)

#### Шаг 5: Шифрование файлов (изображения, видео, аудио)

Все загружаемые файлы шифруются перед отправкой в IPFS:

##### Малые файлы (< 1 МБ)
```javascript
// Simple encryption: nonce + encrypted data
const nonce = randomBytes(24);
const cipher = xsalsa20poly1305(postSecretKey, nonce);
const encrypted = cipher.encrypt(fileData);

const encryptedFile = new Uint8Array(24 + encrypted.length);
encryptedFile.set(nonce, 0);
encryptedFile.set(encrypted, 24);
```

##### Большие файлы (≥ 1 МБ)
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

Это обеспечивает **потоковую расшифровку** — видео могут начинать воспроизводиться до полной расшифровки файла.

**Реализация**: [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js), [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js)

#### Шаг 6: Построение метаданных шифрования

Дескриптор включает метаданные шифрования:

```yaml
savva_spec_version: "2.0"
data_cid: QmXXX...
encrypted: true
locales:
  en:
    title: "48c3a1b2:9f8d7e6c5a4b3e2d1c0f9e8d7c6b5a4e3d2c1b0a..."
    text_preview: "a1b2c3d4:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b..."
    tags:
      - "nonce1:encrypted_tag1"
      - "nonce2:encrypted_tag2"
    categories:
      - "nonce3:encrypted_category1"
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

**Реализация**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:167-211)

## Big Brothers (модераторы домена)

Big Brothers — специальные адреса, настроенные на уровне домена, которые автоматически получают доступ ко всем зашифрованным публикациям в этом домене. Это позволяет проводить модерацию контента при сохранении сквозного шифрования.

### Конфигурация

Big Brothers настраиваются в файле `config.json`:

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

### Как работают Big Brothers

1. **Автоматическое включение**: при создании зашифрованной публикации система:
   - Получает `big_brothers` из конфигурации домена  
   - Получает ключи чтения для каждого big brother  
   - Добавляет их в список получателей  
   - Шифрует ключ публикации для каждого big brother

2. **Дедупликация**: если big brother уже является подписчиком, он не дублируется

3. **Грациозный отказ**: если у big brother нет ключа чтения, он пропускается (логируется, но не блокирует публикацию)

**Реализация**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:280-322)

### Сценарии использования

- **Модерация контента**: проверка зашифрованных публикаций на соответствие политике  
- **Поддержка клиентов**: помощь пользователям с зашифрованным контентом  
- **Юридическая совместимость**: доступ правоохранительных органов при наличии надлежащей авторизации  
- **Резервный доступ**: владельцы домена сохраняют доступ к контенту

## Расшифровка публикаций

### Автоматический поток расшифровки

Когда пользователь просматривает зашифрованную публикацию:

1. **Проверка шифрования публикации**
   ```javascript
   if (post.content.encrypted && !post._decrypted) {
     // Post is encrypted and not yet decrypted
   }
   ```

2. **Проверка прав пользователя**
   ```javascript
   const canDecrypt = encryption.keys.some(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );
   ```

3. **Получение секретного ключа чтения**
   ```javascript
   // Option 1: Retrieve from localStorage
   const storedKey = findStoredSecretKey(userAddress, nonce);

   // Option 2: Re-derive from wallet signature
   if (!storedKey) {
     const signature = await signReadingKeyMessage(userAddress, nonce);
     const secretKey = deriveKeyFromSignature(signature, nonce);
   }
   ```

4. **Расшифровка секретного ключа публикации**
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

5. **Расшифровка метаданных**
   ```javascript
   // Decrypt title, preview, tags, categories
   post.title = decryptText(post.title, postSecretKey);
   post.text_preview = decryptText(post.text_preview, postSecretKey);
   post.tags = post.tags.map(t => decryptText(t, postSecretKey));
   ```

6. **Установка контекста шифрования**
   ```javascript
   // For automatic media decryption
   setEncryptedPostContext({ dataCid, postSecretKey });
   swManager.setEncryptionContext(dataCid, postSecretKey);
   ```

7. **Потоковая расшифровка медиа на лету**
   ```javascript
   // Service Worker intercepts all IPFS requests
   // For URLs matching dataCid:
   - Fetch encrypted file
   - Detect encryption format (simple or chunked)
   - Decrypt chunks as needed
   - Stream decrypted bytes to browser

   // Result: videos play immediately, seeking works
   ```

**Реализация**: [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js), [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx:263-291)

### Потоковая расшифровка медиа

Зашифрованные медиафайлы (видео, аудио) расшифровываются на лету с помощью Service Workers:

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

См. [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) для подробной документации по системе потокового шифрования.

## Вопросы безопасности

### Алгоритмы шифрования

- **X25519**: эллиптическая кривая Диффи-Хеллмана (безопасность 256 бит)  
- **XSalsa20-Poly1305**: аутентифицированное шифрование (AEAD)  
- **HKDF-SHA256**: функция вывода ключей  
- **EIP-712**: структурированная подпись данных

### Управление ключами

✅ **Безопасно**:
- Приватные ключи никогда не покидают браузер  
- Ключи выводятся детерминированно из подписей кошелька  
- Service Worker работает в том же origin  
- Контексты шифрования имеют TTL (30 минут)  
- Ключи очищаются при навигации по странице

⚠️ **Ограничения**:
- Уязвимость к XSS-атакам (ключи находятся в памяти)  
- Расширения браузера с полным доступом могут украсть ключи  
- Нет защиты от физического доступа к устройству  
- IPFS-шлюзы видят зашифрованные данные (но не могут их расшифровать)

### Модель угроз

**Защищено от**:
- ✅ Сниффинга со стороны IPFS-шлюзов  
- ✅ MITM-атак (HTTPS + AEAD)  
- ✅ Подделки данных (аутентификация Poly1305)  
- ✅ Replay-атак (уникальные nonce для каждого сообщения)

**Не защищено от**:
- ❌ Злокачественных расширений браузера  
- ❌ XSS-уязвимостей в приложении  
- ❌ Скомпрометированных устройств пользователей  
- ❌ Пользователей, которые делятся своими секретными ключами

### Рекомендуемые практики

1. **Всегда используйте HTTPS** в продакшене  
2. **Храните ключи безопасно** — localStorage опционален, не обязателен  
3. **Очищайте контексты** при переходе со страницы  
4. **Проверяйте получателей** перед шифрованием  
5. **Используйте надежные пароли** для бэкапа кошелька  
6. **Регулярно аудитируйте Big Brothers**  
7. **Отслеживайте логи доступа** на предмет подозрительной активности

## Файлы реализации

### Ядро шифрования
- [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js) - генерация и управление ключами чтения  
- [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js) - хранение ключей чтения в браузере  
- [`src/x/crypto/readingKeyEncryption.js`](../../../../src/x/crypto/readingKeyEncryption.js) - X25519 + XSalsa20-Poly1305 шифрование  
- [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js) - шифрование контента публикации  
- [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js) - расшифровка контента публикации  
- [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js) - шифрование файлов (простое + по чанкам)  
- [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js) - почанковое шифрование для больших файлов

### Управление получателями
- [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js) - выбор подписчиков с ключами чтения  
- [`src/x/crypto/fetchParentPostEncryption.js`](../../../../src/x/crypto/fetchParentPostEncryption.js) - получение получателей родительской публикации

### Процесс публикации
- [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx) - создание дескриптора с шифрованием  
- [`src/x/editor/wizard_steps/StepUploadIPFS.jsx`](../../../../src/x/editor/wizard_steps/StepUploadIPFS.jsx) - шифрование файлов перед загрузкой

### Процесс просмотра
- [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx) - просмотр публикаций с авторасшифровкой  
- [`src/ipfs/encryptedFetch.js`](../../../../src/ipfs/encryptedFetch.js) - получение из IPFS с расшифровкой

### Потоковая расшифровка
- [`src/x/crypto/serviceWorkerManager.js`](../../../../src/x/crypto/serviceWorkerManager.js) - управление Service Worker  
- [`public/crypto-sw.js`](../../../../public/crypto-sw.js) - Service Worker для потоковой расшифровки  
- [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) - подробная документация по потоковому шифрованию

## Пользовательский сценарий

### Для создателей контента

1. **Первичная настройка**
   - Сгенерировать ключ чтения (подписать EIP-712 сообщение)  
   - Опубликовать в блокчейне  
   - По желанию сохранить в браузере

2. **Публикация зашифрованного поста**
   - Написать контент в редакторе  
   - Выбрать аудиторию "Subscribers Only"  
   - Система автоматически:
     - получает список подходящих подписчиков  
     - генерирует ключ шифрования публикации  
     - шифрует контент  
     - шифрует файлы  
     - загружает в IPFS  
     - публикует дескриптор в блокчейн

3. **Просмотр собственных зашифрованных публикаций**
   - Авторасшифровка с использованием сохранённого или пересозданного ключа  
   - Медиаконтент воспроизводится без задержек

### Для подписчиков

1. **Первичная настройка**
   - Сгенерировать ключ чтения  
   - Опубликовать в блокчейне  
   - Подписаться на создателя

2. **Просмотр зашифрованных публикаций**
   - Открыть зашифрованный пост  
   - Система проверяет права  
   - Восстанавливает или пересоздаёт секретный ключ  
   - Автоматически расшифровывает публикацию  
   - Медиа воспроизводится с потоковой расшифровкой

3. **Опции хранения ключей**
   - Сохранить в браузере: подпись не требуется каждый раз  
   - Не сохранять: подписывать сообщение каждый раз (безопаснее)

### Для Big Brothers (модераторов)

1. **Настройка**
   - Сгенерировать ключ чтения  
   - Админ домена добавляет адрес в список `big_brothers`  
   - Автоматически включаются во все зашифрованные публикации

2. **Модерация**
   - Доступ ко всему зашифрованному контенту в домене  
   - Проверка на нарушение политик  
   - Принятие необходимых мер

## Устранение неполадок

### "No Reading Key Found"
- Пользователь ещё не сгенерировал ключ чтения  
- Предложить сгенерировать и опубликовать

### "Failed to Decrypt Post"
- Ключ чтения пользователя отсутствует в списке получателей  
- Проверьте статус подписки  
- Проверьте конфигурацию big_brothers

### "Media Not Playing"
- Service Worker не зарегистрирован (требуется HTTPS)  
- Контекст шифрования не установлен  
- Проверьте консоль браузера на ошибки

### "No Eligible Subscribers"
- У подписчиков нет опубликованных ключей чтения  
- Сообщите подписчикам сгенерировать ключи чтения  
- Проверьте порог минимального платежа

## Будущие улучшения

- **Ротация ключей**: поддержка нескольких активных ключей чтения на пользователя  
- **Бэкап и восстановление**: резервное шифрованное хранение ключей с фразой восстановления  
- **Аппаратные кошельки**: вывод ключей чтения с Ledger/Trezor  
- **Выборочный доступ**: временные права доступа к отдельным публикациям  
- **Аналитика**: приватная аналитика для зашифрованного контента  
- **Поддержка WebAuthn**: вывод ключей чтения из WebAuthn-учётных данных

## Связанная документация

- [Publishing Posts](/docs/core-concepts/publishing-posts) - Общий процесс публикации постов  
- [Showing Posts](/docs/core-concepts/showing-posts) - Отображение и рендеринг постов  
- [User Profile](/docs/core-concepts/user-profile) - Контракт профиля и данные пользователя  
- [Streaming Encryption](../../../../STREAMING_ENCRYPTION.md) - Подробная документация по потоковой расшифровке (исходники)  
- [Content Format](/docs/features/content-format) - Спецификация формата дескриптора