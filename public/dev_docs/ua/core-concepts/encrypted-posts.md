# Зашифровані дописи

Savva підтримує скрізне (end-to-end) шифрування дописів, які можуть переглядати лише підписники. Ця функція дозволяє творцям публікувати ексклюзивний контент для платних підписників, при цьому платформа та шлюзи IPFS не можуть прочитати вміст.

## Огляд

Система шифрування використовує багаторівневий підхід:

1. **Reading Keys**: Користувачі детерміністично генерують пари ключів X25519 з підписів гаманця  
2. **Post Encryption**: Кожен допис отримує унікальний ключ шифрування  
3. **Key Distribution**: Ключ допису шифрується окремо для кожного допустимого отримувача  
4. **Content Encryption**: Весь вміст допису (текст, зображення, відео, аудіо) шифрується ключем допису  
5. **Streaming Decryption**: Зашифровані медіафайли розшифровуються в режимі потоку за допомогою Service Workers

## Reading Keys

### Що таке Reading Key?

Reading Key — це пара ключів X25519, яка дозволяє користувачам отримувати та розшифровувати зашифровані дописи. Він складається з:
- **Public Key**: опублікований в ланцюжку (on-chain) в контракті UserProfile (видимий усім)
- **Private Key**: детерміністично походить від підпису гаманця користувача (ніколи не покидає браузер)
- **Nonce**: випадкове значення, що використовується для виведення ключа (опубліковане в ланцюжку)
- **Scheme**: ідентифікатор схеми шифрування (`x25519-xsalsa20-poly1305`)

### Процес генерації ключа

Reading keys генеруються детерміністично з підписів гаманця за такими кроками:

1. **Генерація випадкового nonce**
   ```javascript
   const nonce = crypto.getRandomValues(new Uint8Array(10));
   // Example: "a1b2c3d4e5f6g7h8i9j0"
   ```

2. **Створення EIP-712 Typed Data**
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

3. **Запит підпису у гаманця**
   ```javascript
   const signature = await ethereum.request({
     method: "eth_signTypedData_v4",
     params: [userAddress, JSON.stringify(typedData)]
   });
   // Returns: 0x + 130 hex chars (r: 64, s: 64, v: 2)
   ```

4. **Витяг r||s з підпису**
   ```javascript
   // Ignore the recovery byte 'v', use only r and s
   const rsBytes = signature.slice(2, 130); // 128 hex chars = 64 bytes
   ```

5. **Виведення seed за допомогою HKDF-SHA256**
   ```javascript
   const salt = "SAVVA Reading Key:salt";
   const info = `SAVVA Reading Key:x25519-xsalsa20-poly1305:${nonce}`;
   const seed = hkdf(sha256, rsBytes, salt, info, 32);
   ```

6. **Генерація пари ключів X25519**
   ```javascript
   const secretKey = seed; // 32 bytes (clamped by x25519 library)
   const publicKey = x25519.getPublicKey(secretKey);
   ```

7. **Публікація публічної інформації**
   ```javascript
   // Store in UserProfile contract:
   - reading_public_key: hex string (64 chars)
   - reading_key_scheme: "x25519-xsalsa20-poly1305"
   - reading_key_nonce: hex string (20 chars)
   ```

**Реалізація**: [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js)

### Переваги детерміністичного виведення ключів

Детерміністичний підхід до виведення має кілька переваг:

- ✅ **Відтворюваність**: той самий nonce + підпис завжди дають ту саму пару ключів  
- ✅ **Не потрібно зберігання**: секретний ключ можна відновити за потреби  
- ✅ **Контроль користувача**: користувачі можуть обирати, чи зберігати ключ у localStorage браузера  
- ✅ **Ротація ключів**: можна генерувати нові ключі з іншими nonce  
- ✅ **Багато пристроїв**: той самий ключ на будь-якому пристрої з тим самим гаманцем

### Збереження Reading Keys (необов'язково)

Користувачі можуть за бажанням зберігати свій секретний ключ читання в localStorage браузера, щоб уникнути повторних підписів при кожному перегляді зашифрованого контенту.

**Формат зберігання**:
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

**Реалізація**: [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js)

### Публікація Reading Keys

Щоб публікувати зашифровані дописи або отримувати зашифрований вміст, користувачі повинні опублікувати свій публічний ключ читання в блокчейні:

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

Публічний ключ зберігається в смарт-контракті **UserProfile** і асоціюється з адресою користувача та доменом.

## Створення зашифрованих дописів

### Коли дописи шифруються

Допис шифрується в таких випадках:

1. **Тільки для підписників**: творець обирає аудиторію "Subscribers Only"  
2. **Коментарі до зашифрованих дописів**: коментарі успадковують шифрування батьківського допису

### Процес шифрування допису

#### Крок 1: Генерація ключа шифрування допису

Кожен зашифрований допис отримує унікальну пару ключів X25519:

```javascript
const postKey = {
  secretKey: randomBytes(32),  // Random secret key
  publicKey: x25519.getPublicKey(secretKey)
};
```

Цей ключ використовується для шифрування всього вмісту конкретного допису.

**Реалізація**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:23-31)

#### Крок 2: Визначення отримувачів

Система будує список отримувачів, які зможуть розшифрувати допис.

##### Для звичайних дописів "Тільки для підписників":

1. **Отримати список підписників, які відповідають умовам**
   ```javascript
   // Query backend for users who:
   - Have active subscriptions (weeks > 0)
   - Meet minimum payment threshold
   - To the ACTOR (the account posting - could be user or NPO)
   ```

2. **Отримати Reading Keys**
   ```javascript
   // For each subscriber, fetch from UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce

   // Skip subscribers without reading keys
   ```

3. **Додати авторизованого користувача**
   ```javascript
   // Ensure the wallet owner can decrypt their own post
   if (!recipients.includes(authorizedUser)) {
     recipients.push(authorizedUser);
   }
   ```

4. **Додати Big Brothers** (модератори домену)
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

**Реалізація**: [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js)

##### Для коментарів до зашифрованих дописів:

```javascript
// Use the same recipients as the parent post
const parentEncryption = await fetchParentPostEncryption(parentCid);
const recipients = parentEncryption.recipients;

// Ensure commenter and big_brothers are included
```

**Реалізація**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:214-259)

#### Крок 3: Шифрування вмісту допису

Вміст допису шифрується за допомогою секретного ключа поста. **Примітка**: заголовок залишається нешифрованим, щоб його можна було показувати в картках дописів, а прев'ю текст та контент — шифруються:

```javascript
// For each locale:
{
  title: title,  // NOT encrypted - remains public for display
  text_preview: encryptText(preview, postSecretKey),
  categories: categories,  // NOT encrypted - public for indexing
  tags: tags  // NOT encrypted - public for indexing
}
```

Що шифрується:
- ✅ Текст прев'ю (`text_preview`)  
- ✅ Назви розділів  
- ✅ Усі файли контенту (markdown, медіа)

Що залишається публічним:
- ❌ Заголовок допису  
- ❌ Категорії  
- ❌ Теги

Формат шифрування: `nonce:ciphertext` (обидва у hex-кодуванні)

Алгоритм: XSalsa20-Poly1305 (автентифіковане шифрування)

#### Крок 4: Шифрування ключа допису для кожного отримувача

Для кожного отримувача шифрується секретний ключ допису за допомогою їхнього публічного reading key:

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

Це використовує конструкцію **X25519 + XSalsa20-Poly1305** (схоже на NaCl `crypto_box`).

**Реалізація**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:97-122)

#### Крок 5: Шифрування файлів (зображення, відео, аудіо)

Усі завантажені файли шифруються перед відправкою в IPFS:

##### Малі файли (< 1 MB)
```javascript
// Simple encryption: nonce + encrypted data
const nonce = randomBytes(24);
const cipher = xsalsa20poly1305(postSecretKey, nonce);
const encrypted = cipher.encrypt(fileData);

const encryptedFile = new Uint8Array(24 + encrypted.length);
encryptedFile.set(nonce, 0);
encryptedFile.set(encrypted, 24);
```

##### Великі файли (≥ 1 MB)
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

Це дозволяє **стрімове розшифрування** — відео може почати відтворюватися до повного розшифрування файлу.

**Реалізація**: [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js), [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js)

#### Крок 6: Побудова метаданих шифрування

Дескриптор включає метадані шифрування:

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

**Реалізація**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:167-211)

## Big Brothers (модератори домену)

Big Brothers — це спеціальні адреси, налаштовані на рівні домену, які автоматично отримують доступ до **всіх зашифрованих дописів** у цьому домені. Це дозволяє модерацію контенту, зберігаючи скрізне шифрування.

### Конфігурація

Big Brothers налаштовуються у файлі `config.json`:

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

### Як працюють Big Brothers

1. **Автоматичне включення**: при створенні зашифрованого допису система:
   - отримує `big_brothers` з конфігурації домену  
   - отримує reading keys для кожного big brother  
   - додає їх у список отримувачів  
   - шифрує ключ допису для кожного big brother

2. **Дедуплікація**: якщо big brother вже є підписником, він не дублюється

3. **Граціозне пропускання помилок**: якщо big brother не має reading key, його пропускають (логуються, але це не блокує публікацію)

**Реалізація**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:280-322)

### Варіанти використання

- **Модерація контенту**: перегляд зашифрованих дописів на предмет порушень політик  
- **Підтримка клієнтів**: допомога користувачам із зашифрованим контентом  
- **Юридична відповідність**: доступ правоохоронних органів за належної авторизації  
- **Резервний доступ**: власники доменів зберігають доступ до контенту

## Розшифрування дописів

### Автоматичний потік розшифрування

Коли користувач переглядає зашифрований допис:

1. **Перевірити, чи допис зашифрований**
   ```javascript
   if (post.content.encrypted && !post._decrypted) {
     // Post is encrypted and not yet decrypted
   }
   ```

2. **Перевірити право користувача на розшифрування**
   ```javascript
   const canDecrypt = encryption.keys.some(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );
   ```

3. **Отримати секретний reading key**
   ```javascript
   // Option 1: Retrieve from localStorage
   const storedKey = findStoredSecretKey(userAddress, nonce);

   // Option 2: Re-derive from wallet signature
   if (!storedKey) {
     const signature = await signReadingKeyMessage(userAddress, nonce);
     const secretKey = deriveKeyFromSignature(signature, nonce);
   }
   ```

4. **Розшифрувати секретний ключ допису**
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

5. **Розшифрувати метадані**
   ```javascript
   // Decrypt preview text (title, tags, and categories are public)
   post.text_preview = decryptText(post.text_preview, postSecretKey);
   // Title, tags, and categories remain as-is (not encrypted)
   ```

6. **Встановити контекст шифрування**
   ```javascript
   // For automatic media decryption
   setEncryptedPostContext({ dataCid, postSecretKey });
   swManager.setEncryptionContext(dataCid, postSecretKey);
   ```

7. **Розшифрувати медіа в режимі потоку**
   ```javascript
   // Service Worker intercepts all IPFS requests
   // For URLs matching dataCid:
   - Fetch encrypted file
   - Detect encryption format (simple or chunked)
   - Decrypt chunks as needed
   - Stream decrypted bytes to browser

   // Result: videos play immediately, seeking works
   ```

**Реалізація**: [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js), [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx:263-291)

### Стрімове розшифрування медіа

Зашифровані медіафайли (відео, аудіо) розшифровуються в режимі потоку за допомогою Service Workers:

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

Див. [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) для детальної документації по системі стрімового шифрування.

## Питання безпеки

### Алгоритми шифрування

- **X25519**: Еліптичне криве Diffie-Hellman (256-бітна безпека)  
- **XSalsa20-Poly1305**: Автентифіковане шифрування (AEAD)  
- **HKDF-SHA256**: Функція виведення ключів  
- **EIP-712**: Структурований підпис даних

### Управління ключами

✅ **Безпечно**:
- Приватні ключі ніколи не залишають браузер  
- Ключі виводяться детерміністично з підписів гаманця  
- Service Worker працює в тій же origin  
- Контексти шифрування мають TTL (30 хвилин)  
- Ключі очищаються при навігації зі сторінки

⚠️ **Обмеження**:
- Вразливість до XSS-атак (ключі в пам'яті)  
- Розширення браузера з повним доступом можуть вкрасти ключі  
- Немає захисту від фізичного доступу до пристрою  
- Шлюзи IPFS бачать зашифровані дані (але не можуть їх розшифрувати)

### Модель загроз

ЗАХИЩЕНО ВІД:
- ✅ Підглядання через шлюзи IPFS  
- ✅ Атаки "man-in-the-middle" (HTTPS + AEAD)  
- ✅ Зміни даних (аутентифікація Poly1305)  
- ✅ Атаки повторення (унікальні nonces для кожного повідомлення)

НЕ ЗАХИЩЕНО ВІД:
- ❌ Зловмисних розширень браузера  
- ❌ XSS-вразливостей у застосунку  
- ❌ Компрометації пристроїв користувачів  
- ❌ Користувачів, які діляться своїми секретними ключами

### Найкращі практики

1. **Завжди використовувати HTTPS** у продакшені  
2. **Безпечно зберігати ключі** — localStorage опційно, не обов'язково  
3. **Очищати контексти** при виході зі сторінки  
4. **Перевіряти отримувачів** перед шифруванням  
5. **Використовувати сильні паролі** для бекапу гаманця  
6. **Регулярно проводити аудит Big Brothers**  
7. **Моніторити логи доступу** на предмет підозрілої активності

## Файли реалізації

### Ядро шифрування
- [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js) - Генерація та управління reading key  
- [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js) - Збереження ключів читання в браузері  
- [`src/x/crypto/readingKeyEncryption.js`](../../../../src/x/crypto/readingKeyEncryption.js) - X25519 + XSalsa20-Poly1305 шифрування  
- [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js) - Шифрування вмісту допису  
- [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js) - Розшифрування вмісту допису  
- [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js) - Шифрування файлів (просте + по чанкам)  
- [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js) - Шифрування по чанкам для великих файлів

### Управління отримувачами
- [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js) - Отримання підписників з reading keys  
- [`src/x/crypto/fetchParentPostEncryption.js`](../../../../src/x/crypto/fetchParentPostEncryption.js) - Отримати отримувачів батьківського допису

### Потік публікації
- [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx) - Створення дескриптора з шифруванням  
- [`src/x/editor/wizard_steps/StepUploadIPFS.jsx`](../../../../src/x/editor/wizard_steps/StepUploadIPFS.jsx) - Шифрування файлів перед завантаженням

### Потік перегляду
- [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx) - Перегляд допису з автоматичним розшифруванням  
- [`src/ipfs/encryptedFetch.js`](../../../../src/ipfs/encryptedFetch.js) - Отримання з IPFS з розшифруванням

### Стрімове розшифрування
- [`src/x/crypto/serviceWorkerManager.js`](../../../../src/x/crypto/serviceWorkerManager.js) - Керування Service Worker  
- [`public/crypto-sw.js`](../../../../public/crypto-sw.js) - Service Worker для стрімового розшифрування  
- [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) - Детальна документація зі стрімового шифрування

## Потік взаємодії користувача

### Для творців контенту

1. **Початкове налаштування**
   - Згенерувати Reading Key (підписати EIP-712 повідомлення)  
   - Опублікувати в блокчейні  
   - За бажанням зберегти в браузері

2. **Публікація зашифрованого допису**
   - Написати контент в редакторі  
   - Обрати аудиторію "Subscribers Only"  
   - Система автоматично:
     - Отримає списки підписників, які відповідають умовам  
     - Згенерує ключ шифрування поста  
     - Зашифрує вміст  
     - Зашифрує файли  
     - Завантажить на IPFS  
     - Опублікує дескриптор у блокчейні

3. **Перегляд власних зашифрованих дописів**
   - Автоматичне розшифрування з використанням збереженого або повторно виведеного ключа  
   - Медіа транслюється без проблем

### Для підписників

1. **Початкове налаштування**
   - Згенерувати Reading Key  
   - Опублікувати в блокчейні  
   - Підписатися на творця

2. **Перегляд зашифрованих дописів**
   - Відкрити зашифрований допис  
   - Система перевіряє права  
   - Отримує або повторно виводить секретний ключ  
   - Автоматично розшифровує допис  
   - Медіа відтворюється за допомогою стрімового розшифрування

3. **Опції збереження ключів**
   - Зберегти в браузері: повторний підпис не потрібен  
   - Не зберігати: підписувати повідомлення кожного разу (безпечніше)

### Для Big Brothers (модераторів)

1. **Налаштування**
   - Згенерувати Reading Key  
   - Адміністратор домену додає адресу в список `big_brothers`  
   - Автоматично включаються у всі зашифровані дописи

2. **Модерація**
   - Доступ до всього зашифрованого контенту в домені  
   - Перегляд для виявлення порушень політики  
   - Прийняття відповідних дій

## Усунення неполадок

### "No Reading Key Found"
- Користувач ще не згенерував ключ читання  
- Запропонувати згенерувати та опублікувати

### "Failed to Decrypt Post"
- Ключ читання користувача відсутній у списку отримувачів  
- Перевірити статус підписки  
- Перевірити конфігурацію big_brothers

### "Media Not Playing"
- Service Worker не зареєстрований (потребує HTTPS)  
- Контекст шифрування не встановлено  
- Перевірити консоль браузера на помилки

### "No Eligible Subscribers"
- Жоден підписник не опублікував reading keys  
- Повідомити підписників згенерувати reading keys  
- Перевірити мінімальний платіжний поріг

## Майбутні покращення

- **Ротація ключів**: підтримка кількох активних ключів читання для користувача  
- **Бекап і відновлення**: зашифрований бекап ключів з відновлювальною фразою  
- **Апаратні гаманці**: виведення reading key з Ledger/Trezor  
- **Селективний доступ**: тимчасові права доступу для окремих дописів  
- **Аналітика**: приватні метрики для зашифрованого контенту  
- **Підтримка WebAuthn**: виведення ключів читання з облікових даних WebAuthn

## Супутня документація

- [Publishing Posts](/docs/core-concepts/publishing-posts) - Загальний процес публікації дописів  
- [Showing Posts](/docs/core-concepts/showing-posts) - Відображення та рендеринг дописів  
- [User Profile](/docs/core-concepts/user-profile) - Контракт профілю та дані користувача  
- [Streaming Encryption](../../../../STREAMING_ENCRYPTION.md) - Детальна документація по стрімовому розшифруванню (джерельний код)  
- [Content Format](/docs/features/content-format) - Специфікація формату дескриптора