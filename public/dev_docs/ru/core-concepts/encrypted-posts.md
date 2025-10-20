# Encrypted Posts

Savva поддерживает сквозное шифрование постов, которые могут просматривать только подписчики. Эта функция позволяет создателям публиковать эксклюзивный контент для платных подписчиков, при этом платформа и шлюзы IPFS не могут прочитать содержимое.

## Overview

Система шифрования использует многоуровневый подход:

1. **Reading Keys**: пользователи детерминированно генерируют пары ключей X25519 из подписей кошелька
2. **Post Encryption**: каждый пост получает уникальный ключ шифрования
3. **Key Distribution**: ключ поста шифруется отдельно для каждого подходящего получателя
4. **Content Encryption**: весь контент поста (текст, изображения, видео, аудио) шифруется с помощью ключа поста
5. **Streaming Decryption**: зашифрованные медиа расшифровываются на лету с помощью Service Workers

## Reading Keys

### What is a Reading Key?

Reading Key — это пара ключей X25519, которая позволяет пользователям получать и расшифровывать зашифрованные посты. Она состоит из:
- **Public Key**: публикуется в контракте UserProfile (видно всем)
- **Private Key**: выводится детерминированно из подписи кошелька пользователя (никогда не покидает браузер)
- **Nonce**: случайное значение, используемое для вывода ключа (публикуется в цепочке)
- **Scheme**: идентификатор схемы шифрования (`x25519-xsalsa20-poly1305`)

### Key Generation Process

Reading keys генерируются детерминированно из подписей кошелька с помощью следующих шагов:

1. **Generate Random Nonce**
   ```javascript
   const nonce = crypto.getRandomValues(new Uint8Array(10));
   // Example: "a1b2c3d4e5f6g7h8i9j0"
   ```

2. **Create EIP-712 Typed Data**
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

3. **Request Wallet Signature**
   ```javascript
   const signature = await ethereum.request({
     method: "eth_signTypedData_v4",
     params: [userAddress, JSON.stringify(typedData)]
   });
   // Returns: 0x + 130 hex chars (r: 64, s: 64, v: 2)
   ```

4. **Extract r||s from Signature**
   ```javascript
   // Ignore the recovery byte 'v', use only r and s
   const rsBytes = signature.slice(2, 130); // 128 hex chars = 64 bytes
   ```

5. **Derive Seed Using HKDF-SHA256**
   ```javascript
   const salt = "SAVVA Reading Key:salt";
   const info = `SAVVA Reading Key:x25519-xsalsa20-poly1305:${nonce}`;
   const seed = hkdf(sha256, rsBytes, salt, info, 32);
   ```

6. **Generate X25519 Keypair**
   ```javascript
   const secretKey = seed; // 32 bytes (clamped by x25519 library)
   const publicKey = x25519.getPublicKey(secretKey);
   ```

7. **Publish Public Information**
   ```javascript
   // Store in UserProfile contract:
   - reading_public_key: hex string (64 chars)
   - reading_key_scheme: "x25519-xsalsa20-poly1305"
   - reading_key_nonce: hex string (20 chars)
   ```

**Implementation**: [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js)

### Key Derivation Benefits

Детерминированный подход к выводу ключей имеет несколько преимуществ:

- ✅ **Reproducible**: одинаковая nonce + подпись всегда дают одну и ту же пару ключей
- ✅ **No Storage Required**: секретный ключ можно заново вывести при необходимости
- ✅ **User Control**: пользователи могут сами решать, сохранять ли ключ в localStorage браузера
- ✅ **Key Rotation**: можно генерировать новые ключи с разными nonce
- ✅ **Multi-Device**: тот же ключ доступен на любом устройстве с тем же кошельком

### Storing Reading Keys (Optional)

Пользователи опционально могут хранить свой секретный reading key в localStorage браузера, чтобы не выполнять подпись при каждом просмотре зашифрованного контента.

**Storage Format**:
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

**Implementation**: [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js)

### Publishing Reading Keys

Чтобы публиковать зашифрованные посты или получать зашифрованный контент, пользователям нужно опубликовать свой reading public key в блокчейн:

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

## Creating Encrypted Posts

### When Posts Are Encrypted

Посты шифруются в следующих сценариях:

1. **Subscriber-Only Posts**: создатель выбирает аудиторию "Только подписчики"
2. **Comments on Encrypted Posts**: комментарии наследуют шифрование родительского поста

### Post Encryption Process

#### Step 1: Generate Post Encryption Key

Каждому зашифрованному посту назначается уникальная пара ключей X25519:

```javascript
const postKey = {
  secretKey: randomBytes(32),  // Random secret key
  publicKey: x25519.getPublicKey(secretKey)
};
```

Этот ключ используется для шифрования всего контента данного поста.

**Implementation**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:23-31)

#### Step 2: Determine Recipients

Система собирает список получателей, которые смогут расшифровать пост.

##### For Regular Subscriber-Only Posts:

1. **Fetch Eligible Subscribers**
   ```javascript
   // Query backend for users who:
   - Have active subscriptions (weeks > 0)
   - Meet minimum payment threshold
   - To the ACTOR (the account posting - could be user or NPO)
   ```

2. **Fetch Reading Keys**
   ```javascript
   // For each subscriber, fetch from UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce

   // Skip subscribers without reading keys
   ```

3. **Add Authorized User**
   ```javascript
   // Ensure the wallet owner can decrypt their own post
   if (!recipients.includes(authorizedUser)) {
     recipients.push(authorizedUser);
   }
   ```

4. **Add Big Brothers** (Domain Moderators)
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

**Implementation**: [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js)

##### For Comments on Encrypted Posts:

```javascript
// Use the same recipients as the parent post
const parentEncryption = await fetchParentPostEncryption(parentCid);
const recipients = parentEncryption.recipients;

// Ensure commenter and big_brothers are included
```

**Implementation**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:214-259)

#### Step 3: Encrypt Post Content

Контент поста шифруется с помощью секретного ключа поста. **Примечание**: заголовок остается нешифрованным, чтобы его можно было показывать в карточках поста, а текст превью и содержимое шифруются:

```javascript
// For each locale:
{
  title: title,  // NOT encrypted - remains public for display
  text_preview: encryptText(preview, postSecretKey),
  categories: categories,  // NOT encrypted - public for indexing
  tags: tags  // NOT encrypted - public for indexing
}
```

**Что шифруется:**
- ✅ Текст превью (`text_preview`)
- ✅ Названия глав
- ✅ Все файлы контента (markdown, медиа)

**Что остается публичным:**
- ❌ Заголовок поста
- ❌ Категории
- ❌ Теги

**Формат шифрования**: `nonce:ciphertext` (оба в hex-кодировке)

**Алгоритм**: XSalsa20-Poly1305 (аутентифицированное шифрование)

#### Step 4: Encrypt Post Key for Each Recipient

Для каждого получателя секретный ключ поста шифруется с использованием его reading public key:

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

Это использует конструкцию **X25519 + XSalsa20-Poly1305** (аналогично `crypto_box` в NaCl).

**Implementation**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:97-122)

#### Step 5: Encrypt Files (Images, Videos, Audio)

Все загруженные файлы шифруются перед отправкой в IPFS:

##### Small Files (< 1 MB)
```javascript
// Simple encryption: nonce + encrypted data
const nonce = randomBytes(24);
const cipher = xsalsa20poly1305(postSecretKey, nonce);
const encrypted = cipher.encrypt(fileData);

const encryptedFile = new Uint8Array(24 + encrypted.length);
encryptedFile.set(nonce, 0);
encryptedFile.set(encrypted, 24);
```

##### Large Files (≥ 1 MB)
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

Это обеспечивает **потоковую расшифровку** — видео могут начать воспроизводиться до полной расшифровки файла.

**Implementation**: [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js), [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js)

#### Step 6: Build Encryption Metadata

Дескриптор включает метаданные шифрования:

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

**Implementation**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:167-211)

## Big Brothers (Domain Moderators)

Big Brothers — это специальные адреса, настраиваемые на уровне домена, которые автоматически получают доступ ко всем зашифрованным постам в этом домене. Это позволяет модерации контента при сохранении сквозного шифрования.

### Configuration

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

### How Big Brothers Work

1. **Automatic Inclusion**: при создании зашифрованного поста система:
   - получает `big_brothers` из конфигурации домена
   - получает reading keys для каждого big brother
   - добавляет их в список получателей
   - шифрует ключ поста для каждого big brother

2. **Deduplication**: если big brother уже является подписчиком, он не дублируется

3. **Graceful Failure**: если у big brother нет reading key, он пропускается (логируется, но не блокирует публикацию)

**Implementation**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:280-322)

### Use Cases

- **Content Moderation**: проверка зашифрованных постов на нарушение правил
- **Customer Support**: помощь пользователям с проблемами зашифрованного контента
- **Legal Compliance**: доступ правоохранительных органов при надлежащей авторизации
- **Backup Access**: владельцы домена сохраняют доступ к контенту

## Decrypting Posts

### Automatic Decryption Flow

Когда пользователь просматривает зашифрованный пост:

1. **Check Post Encryption**
   ```javascript
   if (post.content.encrypted && !post._decrypted) {
     // Post is encrypted and not yet decrypted
   }
   ```

2. **Check User Eligibility**
   ```javascript
   const canDecrypt = encryption.keys.some(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );
   ```

3. **Get Reading Secret Key**
   ```javascript
   // Option 1: Retrieve from localStorage
   const storedKey = findStoredSecretKey(userAddress, nonce);

   // Option 2: Re-derive from wallet signature
   if (!storedKey) {
     const signature = await signReadingKeyMessage(userAddress, nonce);
     const secretKey = deriveKeyFromSignature(signature, nonce);
   }
   ```

4. **Decrypt Post Secret Key**
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

5. **Decrypt Metadata**
   ```javascript
   // Decrypt preview text (title, tags, and categories are public)
   post.text_preview = decryptText(post.text_preview, postSecretKey);
   // Title, tags, and categories remain as-is (not encrypted)
   ```

6. **Set Encryption Context**
   ```javascript
   // For automatic media decryption
   setEncryptedPostContext({ dataCid, postSecretKey });
   swManager.setEncryptionContext(dataCid, postSecretKey);
   ```

7. **Decrypt Media On-The-Fly**
   ```javascript
   // Service Worker intercepts all IPFS requests
   // For URLs matching dataCid:
   - Fetch encrypted file
   - Detect encryption format (simple or chunked)
   - Decrypt chunks as needed
   - Stream decrypted bytes to browser

   // Result: videos play immediately, seeking works
   ```

**Implementation**: [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js), [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx:263-291)

### Streaming Media Decryption

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

## Security Considerations

### Encryption Algorithms

- **X25519**: Эллиптическая кривая Диффи-Хеллмана (безопасность 256 бит)
- **XSalsa20-Poly1305**: Аутентифицированное шифрование (AEAD)
- **HKDF-SHA256**: Функция вывода ключей
- **EIP-712**: Подписание структурированных данных

### Key Management

✅ **Безопасно**:
- Приватные ключи никогда не покидают браузер
- Ключи выводятся детерминированно из подписей кошелька
- Service Worker работает в том же origin
- Контексты шифрования имеют TTL (30 минут)
- Ключи очищаются при навигации по странице

⚠️ **Ограничения**:
- Уязвимость к XSS-атакам (ключи в памяти)
- Расширения браузера с полным доступом могут украсть ключи
- Нет защиты от физического доступа к устройству
- Шлюзы IPFS видят зашифрованные данные (но не могут их расшифровать)

### Threat Model

**Защищает от**:
- ✅ Подглядывания со стороны шлюзов IPFS
- ✅ MITM-атак (HTTPS + AEAD)
- ✅ Подделки данных (аутентификация Poly1305)
- ✅ Повторных атак (уникальные nonce для каждого сообщения)

**Не защищает от**:
- ❌ Злонамеренных расширений браузера
- ❌ XSS-уязвимостей в приложении
- ❌ Компрометации устройства пользователя
- ❌ Пользователей, которые делятся своими секретными ключами

### Best Practices

1. **Always Use HTTPS** в продакшене
2. **Store Keys Securely** - localStorage опционален, не обязателен
3. **Clear Contexts** при переходе со страницы
4. **Validate Recipients** перед шифрованием
5. **Use Strong Passwords** для резервной копии кошелька
6. **Audit Big Brothers** регулярно
7. **Monitor Access Logs** для обнаружения подозрительной активности

## Implementation Files

### Core Encryption
- [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js) - Reading key generation and management
- [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js) - Browser storage for reading keys
- [`src/x/crypto/readingKeyEncryption.js`](../../../../src/x/crypto/readingKeyEncryption.js) - X25519 + XSalsa20-Poly1305 encryption
- [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js) - Post content encryption
- [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js) - Post content decryption
- [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js) - File encryption (simple + chunked)
- [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js) - Chunked encryption for large files

### Recipient Management
- [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js) - Fetch subscribers with reading keys
- [`src/x/crypto/fetchParentPostEncryption.js`](../../../../src/x/crypto/fetchParentPostEncryption.js) - Get parent post recipients

### Publishing Flow
- [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx) - Descriptor creation with encryption
- [`src/x/editor/wizard_steps/StepUploadIPFS.jsx`](../../../../src/x/editor/wizard_steps/StepUploadIPFS.jsx) - File encryption before upload

### Viewing Flow
- [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx) - Post viewing with auto-decryption
- [`src/ipfs/encryptedFetch.js`](../../../../src/ipfs/encryptedFetch.js) - IPFS fetching with decryption

### Streaming Decryption
- [`src/x/crypto/serviceWorkerManager.js`](../../../../src/x/crypto/serviceWorkerManager.js) - Service Worker management
- [`public/crypto-sw.js`](../../../../public/crypto-sw.js) - Service Worker for streaming decryption
- [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) - Detailed streaming encryption docs

## User Experience Flow

### For Content Creators

1. **First Time Setup**
   - Сгенерировать Reading Key (подписать EIP-712 сообщение)
   - Опубликовать в блокчейне
   - Опционально сохранить в браузере

2. **Publishing Encrypted Post**
   - Написать контент в редакторе
   - Выбрать аудиторию "Только подписчики"
   - Система автоматически:
     - Получит подходящих подписчиков
     - Сгенерирует ключ шифрования поста
     - Зашифрует контент
     - Зашифрует файлы
     - Загрузит в IPFS
     - Опубликует дескриптор в блокчейне

3. **Viewing Own Encrypted Posts**
   - Автоматическая расшифровка с использованием сохранённого или вновь выведенного ключа
   - Медиа воспроизводится без задержек

### For Subscribers

1. **First Time Setup**
   - Сгенерировать Reading Key
   - Опубликовать в блокчейне
   - Подписаться на создателя

2. **Viewing Encrypted Posts**
   - Открыть зашифрованный пост
   - Система проверяет право доступа
   - Достаёт или выводит секретный ключ
   - Автоматически расшифровывает пост
   - Медиа воспроизводится с потоковой расшифровкой

3. **Key Storage Options**
   - Сохранить в браузере: не требуется повторная подпись
   - Не сохранять: каждый раз подписывать сообщение (более безопасно)

### For Big Brothers (Moderators)

1. **Setup**
   - Сгенерировать Reading Key
   - Админ домена добавляет адрес в список `big_brothers`
   - Автоматически включаются во все зашифрованные посты

2. **Moderation**
   - Доступ ко всему зашифрованному контенту в домене
   - Просмотр на предмет нарушений правил
   - Принятие соответствующих мер

## Troubleshooting

### "No Reading Key Found"
- Пользователь ещё не сгенерировал reading key
- Предложить сгенерировать и опубликовать

### "Failed to Decrypt Post"
- Reading key пользователя нет в списке получателей
- Проверьте статус подписки
- Проверьте конфигурацию big_brothers

### "Media Not Playing"
- Service Worker не зарегистрирован (требуется HTTPS)
- Контекст шифрования не установлен
- Проверьте консоль браузера на ошибки

### "No Eligible Subscribers"
- Ни один из подписчиков не опубликовал reading keys
- Сообщите подписчикам сгенерировать reading keys
- Проверьте минимальный порог оплаты

## Future Enhancements

- **Key Rotation**: поддержка нескольких активных reading keys у пользователя
- **Backup & Recovery**: зашифрованный бэкап ключа с восстановлением через фразу восстановления
- **Hardware Wallets**: вывод reading key с Ledger/Trezor
- **Selective Sharing**: временные права доступа для отдельных постов
- **Analytics**: приватная аналитика для зашифрованного контента
- **WebAuthn Support**: вывод reading keys из WebAuthn-учётных записей

## Related Documentation

- [Publishing Posts](/docs/core-concepts/publishing-posts) - Общий процесс публикации постов
- [Showing Posts](/docs/core-concepts/showing-posts) - Отображение и рендеринг постов
- [User Profile](/docs/core-concepts/user-profile) - Контракт профиля и данные пользователя
- [Streaming Encryption](../../../../STREAMING_ENCRYPTION.md) - Подробная документация по потоковой расшифровке (исходники)
- [Content Format](/docs/features/content-format) - Спецификация формата дескриптора