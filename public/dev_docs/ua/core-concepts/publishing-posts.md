# Публікація допису

Публікація контенту на платформі SAVVA — це триетапний процес, який забезпечує цілісність даних, децентралізацію та перевірку в ланцюгу. Потік включає підготовку даних допису локально, завантаження контенту та його дескриптора в IPFS і, нарешті, реєстрацію допису в блокчейні через виклик смарт-контракту.

Фронтенд-редактор автоматизує цей процес через майстра, але розуміння базових кроків важливе для розробників.

---

## Крок 1: Підготовка даних допису

Перш ніж відбудеться будь-яке завантаження або транзакція, редактор організовує допис у стандартизовану структуру директорій. Ця структура керується локально за допомогою File System API.

Основні компоненти:

* Файл параметрів (`params.json`) для налаштувань редактора.
* Файл дескриптора (`info.yaml`), який визначає структуру допису та метадані для IPFS.
* Markdown-файли з контентом для кожної мови.
* Директорія `uploads/` для пов'язаних медіафайлів (зображення, відео тощо).

### Приклад `params.json`

This file holds settings used by the editor UI and is not published on-chain.

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

Параметри аудиторії та контролю доступу:

* **audience**: або "public" (за замовчуванням), або "subscribers" для дописів тільки для підписників.
* **minWeeklyPaymentWei**: Мінімальний щотижневий платіж для доступу до допису (у wei, як рядок).
* **allowPurchase**: Якщо `true`, дозволяє одноразову покупку доступу для не-підписників.
* **purchasePriceWei**: Ціна одноразової покупки доступу в токенах SAVVA (у wei, як рядок).

---

## Крок 2: Опис допису (`info.yaml`)

Цей файл є канонічним визначенням допису і завантажується в IPFS. Він зв'язує всі частини контенту й містить інформацію щодо контролю доступу та шифрування.

### Опис для публічного допису

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

### Опис для допису лише для підписників (шифрований)

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

### Опис полів дескриптора

Кореневі поля:

| Field | Description |
|-------|-------------|
| `savva_spec_version` | Версія схеми, наразі `"2.0"` |
| `data_cid` | IPFS CID директорії, що містить усі файли контенту |
| `guid` | Унікальний ідентифікатор допису |
| `recipient_list_type` | Тип доступу: `"public"` або `"subscribers"` |
| `recipient_list_min_weekly` | Мінімальний щотижневий платіж у wei (рядок) |
| `gateways` | Список пріоритетних IPFS-шлюзів для отримання контенту |
| `locales` | Мовно-специфічні метадані контенту |
| `encryption` | Блок шифрування (тільки для дописів для підписників) |

Поля локалі:

| Field | Description |
|-------|-------------|
| `title` | Заголовок допису (завжди нешифрований для відображення) |
| `text_preview` | Текст превью (шифрується як `nonce:ciphertext` для дописів для підписників) |
| `tags` | Масив тегів (завжди нешифрований для індексації) |
| `categories` | Масив категорій (завжди нешифрований для індексації) |
| `data_path` | Відносний шлях до основного файлу контенту |
| `chapters` | Масив об'єктів розділів з `data_path` і необов'язковим `title` |

Поля блоку шифрування:

| Field | Description |
|-------|-------------|
| `type` | Схема шифрування: `x25519-xsalsa20-poly1305` |
| `key_exchange_alg` | Алгоритм обміну ключами: `x25519` |
| `key_exchange_pub_key` | X25519 публічний ключ допису (hex) |
| `access_type` | Обмеження доступу: `for_subscribers_only` |
| `min_weekly_pay` | Вимога мінімального щотижневого платежу у wei (рядок) |
| `allow_purchase` | Чи дозволена одноразова покупка |
| `purchase_price` | Ціна покупки у wei (рядок) |
| `processor_address` | Адреса платіжного процесора для верифікації покупок |
| `purchase_token` | Адреса контракту токена для платежів при покупці (SAVVA) |
| `recipients` | Мапа адрес отримувачів до їх зашифрованих ключів допису |

Поля запису отримувача:

| Field | Description |
|-------|-------------|
| `pass` | Зашифрований секретний ключ допису (hex) |
| `pass_nonce` | Нонс, що використовувався для шифрування (hex) |
| `pass_ephemeral_pub_key` | Ефемерний публічний ключ для ECDH (hex) |
| `reading_public_key` | Публічний ключ читача отримувача (hex) |
| `reading_key_scheme` | Схема шифрування для ключа читання |
| `reading_key_nonce` | Нонс, пов'язаний з ключем читання |

---

## Потік шифрування для дописів лише для підписників

Під час створення допису лише для підписників:

1. Генерується ключ допису: випадкова X25519 пара ключів генерується для допису.
2. Шифрування вмісту: тіло допису та файли розділів шифруються за допомогою XSalsa20-Poly1305 із секретним ключем допису.
3. Шифрування прев'ю: поле `text_preview` шифрується й зберігається як `nonce:ciphertext`.
4. Формування списку отримувачів: ключ допису шифрується для кожного права отримувача, використовуючи їх опублікований ключ читання через ECDH.
5. Включення необхідних отримувачів:
   - Автор допису (завжди може розшифрувати свій контент)
   - Усі big_brothers, налаштовані для домену
   - Платіжний процесор (якщо дозволений доступ через покупку)
   - Правомочні підписники, які відповідають вимозі мінімального платежу

---

## Крок 3: Завантаження в IPFS

Процес завантаження відбувається в два окремі етапи, які обробляються через storage API бекенду.

1. Завантаження директорії контенту: усі файли контенту (наприклад, `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) завантажуються як одна директорія в IPFS. Для зашифрованих дописів ці файли шифруються перед завантаженням. Бекенд повертає єдиний IPFS CID для цієї директорії, який стає `data_cid`.
2. Завантаження дескриптора: `info.yaml` генерується з `data_cid` з попереднього кроку. Цей YAML-файл потім завантажується в IPFS як окремий файл. CID цього файлу `info.yaml` є фінальною IPFS-indoпкою для допису.

---

## Крок 4: Реєстрація в блокчейні

Останній крок — зафіксувати допис у блокчейні, викликавши функцію `reg` на смарт-контракті `ContentRegistry`.

Фронтенд виконує цю транзакцію з такими параметрами:

* **domain**: поточне доменне ім'я (наприклад, `savva.app`).
* **author**: адреса гаманця користувача.
* **guid**: унікальний ідентифікатор з `params.json`.
* **ipfs**: IPFS CID файлу-дескриптора `info.yaml` з Кроку 3.
* **content\_type**: рядок `bytes32`, зазвичай `post` для нового контенту або `post-edit` для оновлень.

### Приклад виклику контракту

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

Після успішного майнінгу транзакції допис офіційно публікується і з'явиться в контентних стрічках.