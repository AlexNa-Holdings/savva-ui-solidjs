# Зашифровані пости

Savva підтримує end-to-end шифровані пости, які можуть переглядати лише підписники. Ця функція дозволяє творцям публікувати ексклюзивний контент для платних підписників, при цьому платформа та IPFS-шлюзи не можуть прочитати вміст.

## Огляд

Система шифрування використовує багаторівневий підхід:

1. **Ключі читача**: користувачі генерують X25519 пари ключів детерміністично з підписів гаманця
2. **Шифрування поста**: кожен пост отримує унікальний ключ шифрування
3. **Розповсюдження ключів**: ключ поста шифрується окремо для кожного допустимого отримувача
4. **Шифрування вмісту**: весь вміст поста (текст, зображення, відео, аудіо) шифрується ключем поста
5. **Динамічне розшифрування**: зашифровані медіа розшифровуються на льоту за допомогою Service Workers

## Ключі читача

### Що таке ключ читача?

Ключ читача — це пара ключів X25519, яка дозволяє користувачам отримувати та розшифровувати зашифровані пости. Вона складається з:
- **Публічний ключ**: публікується в смарт-контракті UserProfile (видимий для всіх)
- **Приватний ключ**: детерміністично виводиться з підпису гаманця користувача (ніколи не покидає браузер)
- **Nonce**: випадкове значення, що використовується для виведення ключа (публікується в ланцюжку)
- **Схема**: ідентифікатор схеми шифрування (`x25519-xsalsa20-poly1305`)

### Процес генерації ключа

Ключі читача генеруються детерміністично з підписів гаманця за такими кроками:

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

3. **Запит підпису гаманця**
   ```javascript
   const signature = await ethereum.request({
     method: "eth_signTypedData_v4",
     params: [userAddress, JSON.stringify(typedData)]
   });
   // Returns: 0x + 130 hex chars (r: 64, s: 64, v: 2)
   ```

4. **Витягнення r||s з підпису**
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

6. **Генерація X25519 пари ключів**
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

Реалізація: [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js)

### Переваги детерміністичного виведення ключів

Детерміністичний підхід до виведення ключів має кілька переваг:

- ✅ Відтворюваність: той самий nonce + підпис завжди дають ту саму пару ключів
- ✅ Не вимагає зберігання: секретний ключ можна відновити за потреби
- ✅ Контроль користувача: користувачі можуть вирішувати, зберігати ключ у localStorage браузера чи ні
- ✅ Ротація ключів: можна генерувати нові ключі з іншими nonce
- ✅ Багато пристроїв: той самий ключ на будь-якому пристрої з тим самим гаманцем

### Зберігання ключів читача (необов’язково)

Користувачі можуть за бажанням зберігати свій секретний ключ читача у localStorage браузера, щоб уникнути повторного підписування щоразу при перегляді зашифрованого контенту.

Формат зберігання:
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

Реалізація: [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js)

### Публікація ключів читача

Щоб публікувати зашифровані пости або отримувати зашифрований контент, користувачі повинні опублікувати свій публічний ключ читача в блокчейн:

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

Публічний ключ зберігається в смарт-контракті **UserProfile** та асоціюється з адресою користувача й доменом.

## Створення зашифрованих постів

### Коли пости шифруються

Пости шифруються в наступних сценаріях:

1. **Пости лише для підписників**: творець обирає аудиторію "Subscribers Only"
2. **Коментарі до зашифрованих постів**: коментарі успадковують шифрування батьківського поста

### Процес шифрування поста

#### Крок 1: Генерація ключа шифрування поста

Кожен зашифрований пост отримує унікальну X25519 пару ключів:

```javascript
const postKey = {
  secretKey: randomBytes(32),  // Random secret key
  publicKey: x25519.getPublicKey(secretKey)
};
```

Цей ключ використовується для шифрування всього вмісту цього конкретного поста.

Реалізація: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:23-31)

#### Крок 2: Визначення отримувачів

Система формує список отримувачів, які зможуть розшифрувати пост.

##### Для звичайних постів лише для підписників:

1. **Отримати список придатних підписників**
   ```javascript
   // Query backend for users who:
   - Have active subscriptions (weeks > 0)
   - Meet minimum payment threshold
   - To the ACTOR (the account posting - could be user or NPO)
   ```

2. **Отримати ключі читача**
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

Реалізація: [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js)

##### Для коментарів до зашифрованих постів:

```javascript
// Use the same recipients as the parent post
const parentEncryption = await fetchParentPostEncryption(parentCid);
const recipients = parentEncryption.recipients;

// Ensure commenter and big_brothers are included
```

Реалізація: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:214-259)

#### Крок 3: Шифрування вмісту поста

Весь текстовий вміст у дескрипторі шифрується за допомогою секретного ключа поста:

```javascript
// For each locale:
{
  title: encryptText(title, postSecretKey),
  text_preview: encryptText(preview, postSecretKey),
  tags: tags.map(t => encryptText(t, postSecretKey)),
  categories: categories.map(c => encryptText(c, postSecretKey))
}
```

Формат шифрування: `nonce:ciphertext` (обидва у hex)

Алгоритм: XSalsa20-Poly1305 (автентифіковане шифрування)

#### Крок 4: Шифрування ключа поста для кожного отримувача

Для кожного отримувача шифрується секретний ключ поста за допомогою його публічного ключа читача:

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

Це використовує конструкцію **X25519 + XSalsa20-Poly1305** (схожу на NaCl `crypto_box`).

Реалізація: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:97-122)

#### Крок 5: Шифрування файлів (зображення, відео, аудіо)

Всі завантажені файли шифруються перед відправленням на IPFS:

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

Це дозволяє **стрімове розшифрування** — відео може почати відтворюватися до повного завершення розшифрування файлу.

Реалізація: [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js), [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js)

#### Крок 6: Побудова метаданих шифрування

Дескриптор включає метадані шифрування:

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

Реалізація: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:167-211)

## Big Brothers (модератори домену)

Big Brothers — це спеціальні адреси, налаштовані на рівні домену, які автоматично отримують доступ до **усіх зашифрованих постів** у цьому домені. Це дозволяє модерацію контенту, зберігаючи end-to-end шифрування.

### Налаштування

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

1. **Автоматичне включення**: при створенні зашифрованого поста система:
   - Отримує `big_brothers` з конфігурації домену
   - Отримує ключі читача для кожного big brother
   - Додає їх до списку отримувачів
   - Шифрує ключ поста для кожного big brother

2. **Дедуплікація**: якщо big brother вже є підписником, він не дублюється

3. **Граціозна відмова**: якщо big brother не має ключа читача, його пропускають (логують, але це не блокує публікацію)

Реалізація: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:280-322)

### Сценарії використання

- **Модерація контенту**: перегляд зашифрованих постів на предмет порушень політики
- **Підтримка клієнтів**: допомога користувачам з питаннями щодо зашифрованого контенту
- **Юридична відповідність**: доступ правоохоронних органів за належною авторизацією
- **Резервний доступ**: власники домену зберігають доступ до контенту

## Розшифрування постів

### Автоматичний потік розшифрування

Коли користувач переглядає зашифрований пост:

1. **Перевірити шифрування поста**
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

3. **Отримати секретний ключ читача**
   ```javascript
   // Option 1: Retrieve from localStorage
   const storedKey = findStoredSecretKey(userAddress, nonce);

   // Option 2: Re-derive from wallet signature
   if (!storedKey) {
     const signature = await signReadingKeyMessage(userAddress, nonce);
     const secretKey = deriveKeyFromSignature(signature, nonce);
   }
   ```

4. **Розшифрувати секретний ключ поста**
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
   // Decrypt title, preview, tags, categories
   post.title = decryptText(post.title, postSecretKey);
   post.text_preview = decryptText(post.text_preview, postSecretKey);
   post.tags = post.tags.map(t => decryptText(t, postSecretKey));
   ```

6. **Встановити контекст шифрування**
   ```javascript
   // For automatic media decryption
   setEncryptedPostContext({ dataCid, postSecretKey });
   swManager.setEncryptionContext(dataCid, postSecretKey);
   ```

7. **Розшифрувати медіа на льоту**
   ```javascript
   // Service Worker intercepts all IPFS requests
   // For URLs matching dataCid:
   - Fetch encrypted file
   - Detect encryption format (simple or chunked)
   - Decrypt chunks as needed
   - Stream decrypted bytes to browser

   // Result: videos play immediately, seeking works
   ```

Реалізація: [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js), [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx:263-291)

### Стрімове розшифрування медіа

Зашифровані медіа-файли (відео, аудіо) розшифровуються на льоту за допомогою Service Workers:

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

Див. [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) для детальної документації щодо системи стрімового шифрування.

## Міркування щодо безпеки

### Алгоритми шифрування

- **X25519**: Elliptic Curve Diffie-Hellman (256-бітна стійкість)
- **XSalsa20-Poly1305**: Автентифіковане шифрування (AEAD)
- **HKDF-SHA256**: Функція виведення ключів
- **EIP-712**: Структуроване підписування даних

### Управління ключами

✅ **Безпека**:
- Приватні ключі ніколи не покидають браузер
- Ключі виводяться детерміністично з підписів гаманця
- Service Worker працює в тій же origin
- Контексти шифрування мають TTL (30 хвилин)
- Ключі очищуються при навігації сторінки

⚠️ **Обмеження**:
- Вразливість до XSS-атак (ключі в пам'яті)
- Розширення браузера з повним доступом можуть вкрасти ключі
- Немає захисту від фізичного доступу до пристрою
- IPFS-шлюзи бачать зашифровані дані (але не можуть їх розшифрувати)

### Модель загроз

ЗАХИЩЕНО ВІД:
- ✅ Прослуховування IPFS-шлюзами
- ✅ Man-in-the-middle атак (HTTPS + AEAD)
- ✅ Підтасовування даних (автентифікація Poly1305)
- ✅ Replay-атак (унікальні nonce для кожного повідомлення)

НЕ ЗАХИЩЕНО ВІД:
- ❌ Зловмисних розширень браузера
- ❌ XSS-вразливостей у застосунку
- ❌ Компрометації пристроїв користувачів
- ❌ Користувачів, що діляться своїми секретними ключами

### Кращі практики

1. **Завжди використовувати HTTPS** у продакшні
2. **Безпечно зберігати ключі** — localStorage опціонально, не обов’язково
3. **Очищати контексти** при переході зі сторінки
4. **Перевіряти отримувачів** перед шифруванням
5. **Використовувати надійні паролі** для резервних копій гаманця
6. **Регулярно аудіювати Big Brothers**
7. **Моніторити логи доступу** на предмет підозрілої активності

## Файли реалізації

### Ядро шифрування
- [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js) - Генерація та управління ключами читача
- [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js) - Зберігання ключів читача в браузері
- [`src/x/crypto/readingKeyEncryption.js`](../../../../src/x/crypto/readingKeyEncryption.js) - X25519 + XSalsa20-Poly1305 шифрування
- [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js) - Шифрування вмісту поста
- [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js) - Розшифрування вмісту поста
- [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js) - Шифрування файлів (просто + чанки)
- [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js) - Чанкове шифрування для великих файлів

### Управління отримувачами
- [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js) - Отримання підписників з ключами читача
- [`src/x/crypto/fetchParentPostEncryption.js`](../../../../src/x/crypto/fetchParentPostEncryption.js) - Отримати отримувачів батьківського поста

### Потік публікації
- [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx) - Створення дескриптора з шифруванням
- [`src/x/editor/wizard_steps/StepUploadIPFS.jsx`](../../../../src/x/editor/wizard_steps/StepUploadIPFS.jsx) - Шифрування файлів перед завантаженням

### Потік перегляду
- [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx) - Перегляд поста з автоматичним розшифруванням
- [`src/ipfs/encryptedFetch.js`](../../../../src/ipfs/encryptedFetch.js) - Завантаження з IPFS з розшифруванням

### Стрімове розшифрування
- [`src/x/crypto/serviceWorkerManager.js`](../../../../src/x/crypto/serviceWorkerManager.js) - Управління Service Worker
- [`public/crypto-sw.js`](../../../../public/crypto-sw.js) - Service Worker для стрімового розшифрування
- [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) - Детальна документація зі стрімового шифрування

## Потік взаємодії для користувачів

### Для творців контенту

1. **Початкове налаштування**
   - Згенерувати ключ читача (підпис EIP-712 повідомлення)
   - Опублікувати в блокчейн
   - За бажанням зберегти у браузері

2. **Публікація зашифрованого поста**
   - Написати контент в редакторі
   - Вибрати аудиторію "Subscribers Only"
   - Система автоматично:
     - Отримає придатних підписників
     - Згенерує ключ шифрування поста
     - Зашифрує контент
     - Зашифрує файли
     - Завантажить на IPFS
     - Опублікує дескриптор в блокчейн

3. **Перегляд власних зашифрованих постів**
   - Автоматичне розшифрування за збереженим або відновленим ключем
   - Медіа відтворюється безшовно

### Для підписників

1. **Початкове налаштування**
   - Згенерувати ключ читача
   - Опублікувати в блокчейн
   - Підписатися на творця

2. **Перегляд зашифрованих постів**
   - Відкрити зашифрований пост
   - Система перевіряє право доступу
   - Отримує або відновлює секретний ключ
   - Автоматично розшифровує пост
   - Медіа відтворюється зі стрімовим розшифруванням

3. **Опції зберігання ключа**
   - Зберігати в браузері: немає потреби повторно підписуватися
   - Не зберігати: підписувати повідомлення щораз (безпечніше)

### Для Big Brothers (модераторів)

1. **Налаштування**
   - Згенерувати ключ читача
   - Адмін домену додає адресу в список `big_brothers`
   - Автоматично включається в усі зашифровані пости

2. **Модерація**
   - Мають доступ до всього зашифрованого контенту в домені
   - Перевіряють на предмет порушень політики
   - Вживають відповідних заходів

## Усунення несправностей

### "No Reading Key Found"
- Користувач ще не згенерував ключ читача
- Запропонувати згенерувати та опублікувати

### "Failed to Decrypt Post"
- Ключ читача користувача відсутній у списку отримувачів
- Перевірити статус підписки
- Перевірити конфігурацію big_brothers

### "Media Not Playing"
- Service Worker не зареєстрований (потребує HTTPS)
- Контекст шифрування не встановлений
- Перевірити консоль браузера на помилки

### "No Eligible Subscribers"
- Жоден підписник не опублікував ключ читача
- Повідомити підписників про необхідність згенерувати ключі читача
- Перевірити мінімальний поріг платежу

## Майбутні покращення

- **Ротація ключів**: підтримка кількох активних ключів читача на користувача
- **Резервне копіювання й відновлення**: зашифроване резервне копіювання ключів з фразою відновлення
- **Апаратні гаманці**: виведення ключів читача з Ledger/Trezor
- **Селективний доступ**: тимчасові доступи для конкретних постів
- **Аналітика**: приватно-зберігаючі метрики для зашифрованого контенту
- **Підтримка WebAuthn**: виведення ключів читача з WebAuthn облікових даних

## Супутня документація

- [Publishing Posts](/docs/core-concepts/publishing-posts) - Загальний процес публікації постів
- [Showing Posts](/docs/core-concepts/showing-posts) - Відображення та рендеринг постів
- [User Profile](/docs/core-concepts/user-profile) - Контракт профілю користувача та дані
- [Streaming Encryption](../../../../STREAMING_ENCRYPTION.md) - Детальна документація зі стрімового розшифрування (джерельний код)
- [Content Format](/docs/features/content-format) - Специфікація формату дескриптора