# Публикация поста

Публикация контента на платформе SAVVA — это процесс из трёх шагов, который обеспечивает целостность данных, децентрализацию и верификацию в цепочке. Поток операций включает локальную подготовку данных поста, загрузку контента и его дескриптора в IPFS и, наконец, регистрацию поста в блокчейне через вызов смарт-контракта.

Фронтенд-редактор автоматизирует этот процесс через мастера, но понимание базовых шагов важно для разработчиков.

---

## Шаг 1: Подготовка данных поста

Прежде чем произойдёт загрузка или транзакция, редактор организует пост в стандартизированную структуру каталогов. Эта структура управляется локально с помощью File System API.

Основные компоненты:

* Файл параметров (`params.json`) для настроек самого редактора.
* Файл-дескриптор (`info.yaml`), который определяет структуру поста и метаданные для IPFS.
* Markdown-файлы с содержимым для каждого языка.
* Каталог `uploads/` для связанных медиафайлов (изображения, видео и т.д.).

### Пример `params.json`

Этот файл содержит настройки, используемые UI редактора, и не публикуется в цепочке.

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

### Пример `info.yaml` (Дескриптор поста)

Этот файл является каноническим определением поста и загружается в IPFS. Он связывает все части контента между собой.

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

* **data\_cid**: IPFS CID каталога, содержащего все Markdown-файлы и загруженные файлы.
* **locales**: Содержит метаданные для конкретных языков. Поля `title` и `text_preview` из редактора сохраняются здесь.
* **data\_path / chapters.data\_path**: Относительные пути к файлам контента внутри каталога с `data_cid`.

---

## Шаг 2: Загрузка в IPFS

Процесс загрузки проходит в двух отдельных фазах, которые обрабатываются API хранилища бэкенда.

1. **Загрузка каталога контента**: Все файлы контента (например, `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) загружаются как единый каталог в IPFS. Бэкенд возвращает один IPFS CID для этого каталога, который становится `data_cid`.
2. **Загрузка дескриптора**: Файл `info.yaml` генерируется с `data_cid` из предыдущего шага. Этот YAML затем загружается в IPFS как отдельный файл. CID этого файла `info.yaml` является финальным указателем в IPFS для поста.

---

## Шаг 3: Регистрация в блокчейне

Последний шаг — зафиксировать пост в блокчейне, вызвав функцию `reg` в смарт-контракте `ContentRegistry`.

Фронтенд выполняет эту транзакцию с использованием следующих параметров:

* **domain**: Текущее доменное имя (например, `savva.app`).
* **author**: Адрес кошелька пользователя.
* **guid**: Уникальный идентификатор из `params.json`.
* **ipfs**: IPFS CID файла-дескриптора `info.yaml` из шага 2.
* **content\_type**: Строка типа `bytes32`, обычно `post` для нового контента или `post-edit` для обновлений.

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

После успешной майнинга транзакции пост официально публикуется и появится в лентах контента.