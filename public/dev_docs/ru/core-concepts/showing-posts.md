# Отображение Постов

Отображение поста SAVVA — это процесс из двух этапов.

1. Получите список объектов метаданных постов из бэкенда SAVVA.
2. Используйте информацию IPFS из этих метаданных, чтобы получить фактическое содержимое (название, текст, изображения и т. д.) из децентрализованной сети.

---

## Шаг 1: Получение Метаданных Постов из Бэкенда

Основной способ получить список постов — это метод WebSocket **`content-list`**.
Он поддерживает пагинацию, сортировку и фильтрацию.

### Вызов `content-list`

Вы вызываете метод с параметрами, указывающими, какой контент вам нужен. Пример:

```js
// Пример вызова с использованием помощника wsMethod приложения
const posts = await app.wsMethod("content-list")({
  domain: "savva.app",      // Домен для получения постов
  limit: 12,                // Количество элементов на странице
  offset: 0,                // Начальный индекс (для пагинации)
  lang: "en",               // Предпочитаемый язык для метаданных
  order_by: "fund_amount",  // Сортировка по общему количеству полученных средств
  content_type: "post",     // Нам нужны только посты
  show_nsfw: true,          // true, если настройки пользователя это позволяют, иначе false
  category: "en:SAVVA Talk" // Необязательно: фильтрация по категории
});
```

---

## Структура Объекта Поста

Метод `content-list` возвращает массив **объектов постов**.
Каждый из них содержит метаданные и указатели, необходимые для получения полного содержимого.

Пример:

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
  "tags": ["децентрализация", "социальные"],
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

### Объяснение Ключевых Полей

* **author** — информация о профиле автора (включая сумму ставок).
* **savva\_cid / short\_cid** — уникальные идентификаторы. Используйте их для построения URL (`/post/<short_cid>`).
* **ipfs / savva\_content.data\_cid** — указатели на контент IPFS.
* **savva\_content** — метаданные, кэшированные на бэкенде (названия, превью, миниатюры). Отлично подходит для рендеринга ленты без получения IPFS.
* **fund** — информация о фонде поста.
* **reactions** — массив счетчиков для каждого типа реакции.

---

## Шаг 2: Получение Полного Содержимого из IPFS

Хотя `savva_content` полезен для превью, полное содержимое должно быть получено из IPFS (тело поста, главы, активы).

### Разрешение Путей Содержимого

Местоположение `info.yaml` зависит от формата:

* **Современный формат**

  * `savva_content.data_cid` = базовый CID для активов.
  * `ipfs` = прямой путь к `info.yaml`.
* **Устаревший формат**

  * Нет `data_cid`.
  * `ipfs` = базовый CID. Дескриптор предполагается по адресу `<ipfs>/info.yaml`.

### Утилитные Функции

Используйте помощники из `src/ipfs/utils.js`:

```js
import {
  getPostDescriptorPath,
  getPostContentBaseCid,
  resolvePostCidPath
} from "../../ipfs/utils.js";

const post = { ... };

// 1. Путь к файлу дескриптора
const descriptorPath = getPostDescriptorPath(post);

// 2. Базовый CID для активов
const contentBaseCid = getPostContentBaseCid(post);

// 3. Разрешение относительного пути (например, миниатюра)
const fullThumbnailPath = resolvePostCidPath(post, post.savva_content.thumbnail);
```

---

## Приоритизация Шлюзов IPFS

Порядок получения:

1. **Локальный узел** (если включен).
2. **Специфические шлюзы постов** (указанные в дескрипторе).
3. **Системные шлюзы** (бэкенд `/info`).

Это обеспечивает наилучшую скорость и доступность.

---

## Дескриптор Поста (`info.yaml`)

Файл YAML, определяющий полную структуру: языки, главы, метаданные.

### Пример `info.yaml`

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

### Ключевые Поля Дескриптора

* **thumbnail** — относительный путь к главному изображению.
* **gateways** — необязательные рекомендуемые шлюзы IPFS.
* **locales** — объект, ключи которого — языковые коды.

  * **title / text\_preview / tags / categories** — метаданные, специфичные для языка.
  * **data\_path** — основной Markdown контент для этого языка.
  * **chapters** — массив глав, каждая из которых содержит `title` и `data_path`.

Чтобы получить полное содержимое главы:

```txt
<content_base_cid>/content/en/chapter1.md
```