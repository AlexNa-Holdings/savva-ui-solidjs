# Публикация поста

Публикация контента на платформе SAVVA — это процесс из трёх шагов, который обеспечивает целостность данных, децентрализацию и проверку в цепочке. Поток включает подготовку данных поста локально, загрузку контента и его дескриптора в IPFS и, наконец, регистрацию поста в блокчейне через вызов смарт-контракта.

Фронтенд-редактор автоматизирует этот процесс с помощью мастера, но понимание базовых шагов важно для разработчиков.

---

## Шаг 1: Подготовка данных поста

Перед любой загрузкой или транзакцией редактор организует пост в стандартизированную структуру каталогов. Эта структура управляется локально с использованием File System API.

Основные компоненты:

* Файл параметров (`params.json`) для настроек, специфичных для редактора.
* Файл дескриптора (`info.yaml`), который определяет структуру поста и метаданные для IPFS.
* Markdown-файлы с содержимым для каждого языка.
* Каталог `uploads/` для любых прикреплённых медиафайлов (изображения, видео и т.д.).

### Пример `params.json`

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

**Параметры аудитории и контроля доступа:**

* **audience**: Либо `"public"` (по умолчанию), либо `"subscribers"` для постов только для подписчиков.
* **minWeeklyPaymentWei**: Минимальная еженедельная ставка, требуемая для доступа к посту (в wei, как строка).
* **allowPurchase**: Если `true`, разрешает единовременную покупку доступа для не-подписчиков.
* **purchasePriceWei**: Цена единовременной покупки доступа в токенах SAVVA (в wei, как строка).

---

## Шаг 2: Дескриптор поста (`info.yaml`)

Этот файл является каноническим определением поста и загружается в IPFS. Он связывает все части контента и содержит информацию о контроле доступа и шифровании.

### Дескриптор публичного поста

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

### Дескриптор поста только для подписчиков (зашифрованный)

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

### Справочник полей дескриптора

**Поля верхнего уровня:**

| Field | Description |
|-------|-------------|
| `savva_spec_version` | Версия схемы, в настоящее время `"2.0"` |
| `data_cid` | IPFS CID директории, содержащей все файлы контента |
| `guid` | Уникальный идентификатор поста |
| `recipient_list_type` | Тип доступа: `"public"` или `"subscribers"` |
| `recipient_list_min_weekly` | Минимальная еженедельная ставка в wei (строка) |
| `gateways` | Список предпочитаемых IPFS-шлюзов для получения контента |
| `locales` | Языко-специфичные метаданные контента |
| `encryption` | Блок шифрования (только для постов, доступных по подписке) |

**Поля локали:**

| Field | Description |
|-------|-------------|
| `title` | Заголовок поста (всегда не зашифрован и доступен для отображения) |
| `text_preview` | Текст превью (для постов для подписчиков зашифрован как `nonce:ciphertext`) |
| `tags` | Массив тегов (всегда нешифрован для индексации) |
| `categories` | Массив категорий (всегда нешифрован для индексации) |
| `data_path` | Относительный путь к основному файлу контента |
| `chapters` | Массив объектов глав с полем `data_path` и необязательным `title` |

**Поля блока шифрования:**

| Field | Description |
|-------|-------------|
| `type` | Схема шифрования: `x25519-xsalsa20-poly1305` |
| `key_exchange_alg` | Алгоритм обмена ключами: `x25519` |
| `key_exchange_pub_key` | Публичный ключ X25519 поста (hex) |
| `access_type` | Тип доступа: `for_subscribers_only` |
| `min_weekly_pay` | Минимальное требование к еженедельной оплате в wei (строка) |
| `allow_purchase` | Разрешена ли единовременная покупка |
| `purchase_price` | Цена покупки в wei (строка) |
| `processor_address` | Адрес платежного процессора для верификации покупки |
| `purchase_token` | Адрес контракта токена для платежей при покупке (SAVVA) |
| `recipients` | Отображение адресов получателей на их зашифрованные ключи поста |

**Поля записи получателя:**

| Field | Description |
|-------|-------------|
| `pass` | Зашифрованный секретный ключ поста (hex) |
| `pass_nonce` | nonce, использованный для шифрования (hex) |
| `pass_ephemeral_pub_key` | Эфемерный публичный ключ для ECDH (hex) |
| `reading_public_key` | Публичный ключ чтения получателя (hex) |
| `reading_key_scheme` | Схема шифрования для ключа чтения |
| `reading_key_nonce` | Nonce, связанный с ключом чтения |

---

## Процесс шифрования для постов только для подписчиков

При создании поста только для подписчиков:

1. **Генерация ключа поста**: Для поста генерируется случайная пара ключей X25519.
2. **Шифрование контента**: Тело поста и файлы глав шифруются с использованием XSalsa20-Poly1305 и секретного ключа поста.
3. **Шифрование превью**: Поле `text_preview` шифруется и хранится в виде `nonce:ciphertext`.
4. **Формирование списка получателей**: Ключ поста шифруется для каждого подходящего получателя с использованием их опубликованного публичного ключа для чтения через обмен ключами ECDH.
5. **Включение обязательных получателей**:
   - Автор поста (всегда может расшифровать собственный контент)
   - Все big_brothers, настроенные для домена
   - Платёжный процессор (если доступ по покупке включён)
   - Подходящие подписчики, соответствующие требованию по минимальной оплате

---

## Шаг 3: Загрузка в IPFS

Процесс загрузки выполняется в двух отдельных этапах, которыми управляет API хранилища бэкенда.

1. **Загрузка каталога с контентом**: Все файлы контента (например, `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) загружаются как один каталог в IPFS. Для зашифрованных постов эти файлы шифруются перед загрузкой. Бэкенд возвращает один IPFS CID для этого каталога, который становится `data_cid`.
2. **Загрузка дескриптора**: Файл `info.yaml` генерируется с `data_cid` из предыдущего шага. Этот YAML-файл затем загружается в IPFS как отдельный файл. CID этого файла `info.yaml` является финальным IPFS-указателем на пост.

---

## Шаг 4: Регистрация в блокчейне

Последний шаг — зафиксировать пост в блокчейне, вызвав функцию `reg` в смарт-контракте `ContentRegistry`.

Фронтенд выполняет эту транзакцию с следующими параметрами:

* **domain**: Текущее доменное имя (например, `savva.app`).
* **author**: Адрес кошелька пользователя.
* **guid**: Уникальный идентификатор из `params.json`.
* **ipfs**: IPFS CID файла дескриптора `info.yaml` из Шага 3.
* **content\_type**: Строка `bytes32`, обычно `post` для нового контента или `post-edit` для обновлений.

### Пример вызова контракта

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

После успешной обработки транзакции пост официально публикуется и появится в лентах контента.