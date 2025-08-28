# Показ Постів

Відображення поста SAVVA є двоетапним процесом.

1. Отримати список об'єктів метаданих постів з бекенду SAVVA.
2. Використати інформацію IPFS з цих метаданих для отримання фактичного контенту (назва, текст, зображення тощо) з децентралізованої мережі.

---

## Крок 1: Отримання Метаданих Постів з Бекенду

Основний спосіб отримати список постів - це метод WebSocket **`content-list`**.
Він підтримує пагінацію, сортування та фільтрацію.

### Виклик `content-list`

Ви викликаєте метод з параметрами, що вказують, який контент вам потрібен. Приклад:

```js
// Приклад виклику з використанням допоміжного методу wsMethod програми
const posts = await app.wsMethod("content-list")({
  domain: "savva.app",      // Домен для отримання постів
  limit: 12,                // Кількість елементів на сторінці
  offset: 0,                // Початковий індекс (для пагінації)
  lang: "en",               // Бажана мова для метаданих
  order_by: "fund_amount",  // Сортувати за загальною сумою отриманих коштів
  content_type: "post",     // Ми хочемо лише пости
  category: "en:SAVVA Talk" // Необов'язково: фільтрувати за категорією
});
```

---

## Структура Об'єкта Поста

Метод `content-list` повертає масив **об'єктів постів**.
Кожен містить метадані та вказівники, необхідні для отримання повного контенту.

Приклад:

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
  "tags": ["децентралізація", "соціальні"],
  "savva_content": {
    "data_cid": "bafybeig...",
    "locales": {
      "en": {
        "text_preview": "Це короткий анонс змісту поста...",
        "title": "Мій перший пост на SAVVA"
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

### Пояснення Ключових Полів

* **author** — інформація профілю автора (включаючи суму, що була вкладена).
* **savva\_cid / short\_cid** — унікальні ідентифікатори. Використовуйте їх для побудови URL (`/post/<short_cid>`).
* **ipfs / savva\_content.data\_cid** — вказівники на контент IPFS.
* **savva\_content** — метадані, кешовані на бекенді (назви, анонси, ескізи). Чудово підходять для рендерингу стрічки без отримання з IPFS.
* **fund** — інформація про фонд поста.
* **reactions** — масив кількостей для кожного типу реакції.

---

## Крок 2: Отримання Повного Контенту з IPFS

Хоча `savva_content` корисний для попереднього перегляду, повний контент потрібно отримати з IPFS (тіло поста, глави, активи).

### Вирішення Шляхів Контенту

Розташування `info.yaml` залежить від формату:

* **Сучасний формат**

  * `savva_content.data_cid` = базовий CID для активів.
  * `ipfs` = прямий шлях до `info.yaml`.
* **Спадковий формат**

  * Немає `data_cid`.
  * `ipfs` = базовий CID. Описувач вважається на `<ipfs>/info.yaml`.

### Утиліти

Використовуйте допоміжні функції з `src/ipfs/utils.js`:

```js
import {
  getPostDescriptorPath,
  getPostContentBaseCid,
  resolvePostCidPath
} from "../../ipfs/utils.js";

const post = { ... };

// 1. Шлях до файлу описувача
const descriptorPath = getPostDescriptorPath(post);

// 2. Базовий CID для активів
const contentBaseCid = getPostContentBaseCid(post);

// 3. Вирішити відносний шлях (наприклад, ескіз)
const fullThumbnailPath = resolvePostCidPath(post, post.savva_content.thumbnail);
```

---

## Пріоритетність Шлюзів IPFS

Порядок отримання:

1. **Локальний вузол** (якщо увімкнено).
2. **Специфічні шлюзи постів** (перераховані в описувачі).
3. **Системні шлюзи** (бекенд `/info`).

Це забезпечує найкращу швидкість і доступність.

---

## Опис Поста (`info.yaml`)

Файл YAML, що визначає повну структуру: мови, глави, метадані.

### Приклад `info.yaml`

```yaml
thumbnail: assets/post_thumbnail.png
gateways:
  - https://my-fast-pinning-service.cloud

locales:
  en:
    title: "Розуміння децентралізованих систем"
    text_preview: "Глибоке занурення в основні концепції децентралізації..."
    tags: ["блокчейн", "системи", "web3"]
    categories: ["Технології"]
    data_path: content/en/main.md
    chapters:
      - title: "Що таке блокчейн?"
        data_path: content/en/chapter1.md
      - title: "IPFS та адресація контенту"
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

### Ключові Поля Описувача

* **thumbnail** — відносний шлях до основного зображення.
* **gateways** — необов'язкові рекомендовані шлюзи IPFS.
* **locales** — об'єкт, ключований кодами мов.

  * **title / text\_preview / tags / categories** — метадані, специфічні для мови.
  * **data\_path** — основний Markdown контент для цієї мови.
  * **chapters** — масив глав, кожна з яких має `title` та `data_path`.

Щоб отримати повний контент глави:

```txt
<content_base_cid>/content/en/chapter1.md
```