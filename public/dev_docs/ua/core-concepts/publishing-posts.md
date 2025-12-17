# Публікація допису

Публікація контенту на платформі SAVVA — це триетапний процес, що забезпечує цілісність даних, децентралізацію та перевірку в мережі (on-chain). Потік включає підготовку даних допису локально, завантаження контенту та його дескриптора в IPFS, а згодом реєстрацію допису в блокчейні через виклик смарт-контракту.

Фронтенд-редактор автоматизує цей процес через майстер, але розуміння базових кроків важливе для розробників.

---

## Крок 1: Підготовка даних допису

До будь-якого завантаження або транзакції редактор організовує допис у стандартизовану структуру директорій. Ця структура керується локально за допомогою API файлової системи.

Основні компоненти:

* Файл параметрів (`params.json`) для налаштувань, специфічних для редактора.
* Описовий файл (`info.yaml`), який визначає структуру допису та метадані для IPFS.
* Markdown-файли для вмісту кожної мови.
* Директорія `uploads/` для пов’язаних медіафайлів (зображення, відео тощо).

### Приклад `params.json`

Цей файл містить налаштування інтерфейсу редактора і не публікується в блокчейні.

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

### Приклад `info.yaml` (Дескриптор допису)

Цей файл є канонічним визначенням допису і завантажується в IPFS. Він пов’язує всі частини вмісту.

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

* **data\_cid**: IPFS CID директорії, що містить усі Markdown-файли та завантажені файли.
* **locales**: Містить метадані, специфічні для мов. Тут зберігаються `title` та `text_preview` із редактора.
* **data\_path / chapters.data\_path**: Відносні шляхи до файлів контенту всередині директорії `data_cid`.

---

## Крок 2: Завантаження в IPFS

Процес завантаження проходить у дві окремі фази, що обробляються API сховища бекенда.

1. **Upload Content Directory**: Усі файли контенту (наприклад, `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) завантажуються як одна директорія в IPFS. Бекенд повертає один IPFS CID для цієї директорії, який стає `data_cid`.
2. **Upload Descriptor**: Файл `info.yaml` генерується з використанням `data_cid` з попереднього кроку. Цей YAML-файл потім завантажується в IPFS як окремий файл. CID цього файлу `info.yaml` є фінальним IPFS-посиланням на допис.

---

## Крок 3: Реєстрація в блокчейні

Останній крок — зафіксувати допис у блокчейні, викликавши функцію `reg` у смарт-контракті `ContentRegistry`.

Фронтенд виконує цю транзакцію з такими параметрами:

* **domain**: Поточна доменна назва (наприклад, `savva.app`).
* **author**: Адреса гаманця користувача.
* **guid**: Унікальний ідентифікатор із `params.json`.
* **ipfs**: IPFS CID файлу-опису `info.yaml` з Кроку 2.
* **content\_type**: Рядок типу `bytes32`, зазвичай `post` для нового контенту або `post-edit` для оновлень.

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

Після успішного майнінгу транзакції допис офіційно публікується й з’явиться в стрічках контенту.