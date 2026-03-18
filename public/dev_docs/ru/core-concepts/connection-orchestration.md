<!-- public/dev_docs/en/core-concepts/connection-orchestration.md -->

# Оркестрация подключения, хранение `/info` и конфигурация домена

На этой странице подробно описывается, как приложение загружается, подключается к бэкенду, выбирает домен и как оно хранит/использует ответ `/info` и конфигурацию домена. Текст предназначен для профессиональных инженеров, которым нужно расширять или отлаживать этот процесс.

> **Коротко** — существует единый оркестратор (`useAppOrchestrator`), который:
>
> * читает `/default_connect.json` (с альтернативой `.yaml`), плюс опциональный локальный оверрайд,
> * настраивает HTTP/WS эндпоинты,
> * запрашивает `/info`,
> * финализирует домен,
> * выбирает базу для ассетов (prod/test), загружает пакет домена,
> * переподключает WebSocket, и
> * (при явном переключении) переходит на `/`.

---

## Термины и примитивы

* **Backend** — узел SAVVA (HTTP API + WebSocket).
* **Domain** — сеть/контекст (брендинг, вкладки, ассеты), которую нужно отрисовать.
* **Domain Pack** — папка `\<assetsBase\>/\<domain\>/` с `config.yaml`, `domain.css`, i18n, изображениями, модулями и т.д. Приложение может загружать пакеты из **prod** (`assets_url`) или **test** (`temp_assets_url`).
* **Override** — небольшой снимок `{ backendLink, domain }`, сохраняемый в `localStorage` под ключом `connect_override`.

---

## Карта файлов (где что лежит)

* **Оркестратор (источник истины):** `src/context/useAppOrchestrator.js` — логика загрузки и переключения, `/info`, окружение ассетов, пакет домена, переподключение WS. Экспонирует `initializeOrSwitch()`, `setDomain()`, `clearConnectOverride()` и сигналы `config`, `info`, `assetsEnv`, `domainAssets*`.
* **Обёртка контекста приложения:** `src/context/AppContext.jsx` — потребляет оркестратор и выводит `supportedDomains`, `selectedDomain`, цепочку/сеть, IPFS-шлюзы и `assetUrl()`; также обеспечивает согласованность авторизации при смене домена.
* **HTTP/WS эндпоинты:** `src/net/endpoints.js` — вычисляет `httpBase()` и `wsUrl()` из `{ backendLink, domain }`, эмитит событие при перенастройке и предоставляет хелперы.
* **Рантайм WebSocket:** подхватывает изменения эндпоинтов и переподключается.
* **UI переключения:** `src/x/modals/SwitchConnectModal.jsx` — запрашивает `<backend>/info`, нормализует список доменов и применяет изменения через API приложения.
* **Главная оболочка:** динамически применяет `domain.css`, фавиконы/мета, GA и привязывает WS-коннектор.
* **Пояснение по наследию.** Вы можете встретить старый хук `useAppConnection`; продолжайте использовать **оркестратор** (текущий дизайн) как единый источник истины.

---

## 1) Последовательность загрузки — шаг за шагом

Оркестратор выполняется один раз при монтировании:

1. **Загрузить дефолты сайта**  
   Попытаться `GET /default_connect.json` в первую очередь; если недоступен, откатиться на `GET /default_connect.yaml`. Распарсить `backendLink`, `domain` и (опционально) `gear`. Эти значения комбинируются с сохранённым **оверрайдом** (если он есть).

2. **Нормализовать и предварительно настроить эндпоинты (pre-info)**  
   До запроса `/info` мы настраиваем эндпоинты, используя **запрошенный** домен как есть:
   `configureEndpoints({ backendLink, domain }, "orch:pre-info")`. Это вычисляет `httpBase()` и `wsUrl()` и эмитит событие изменения, чтобы рантайм мог указывать на правильный сервер.

3. **Запросить `/info`**  
   `GET <backendLink>/info` (no-cache). JSON сохраняется в `orchestrator.info`.

4. **Решить окончательный домен**  
   Если пользователь явно запросил домен, он **уважается**; иначе выбирается **первый** домен из `/info.domains` (если он есть). Разрешённый `{ backendLink, domain }` становится `config`. Если это было переключение, мы **сохраняем** оверрайд.

5. **Финализировать эндпоинты (post-info)**  
   Повторно вызвать `configureEndpoints` с **окончательным** доменом. Все HTTP-вызовы должны использовать `httpBase()`, а **WS URL включает** `?domain=...`.

6. **Окружение ассетов → загрузить пакет домена**  
   Выбрать базу из `/info`: `assets_url` (prod) или `temp_assets_url` (test). Попытаться загрузить `\<assetsBase\>/\<domain\>/config.yaml`, иначе откатиться на `/domain_default/config.yaml`. Сохранить `domainAssetsPrefix`, `domainAssetsConfig` и источник (`domain` vs `default`).

7. **Принудительное переподключение WS**  
   Обновить URL клиента ws, переподключиться, ждать открытия (до ~8 секунд). Это гарантирует, что рантайм синхронизирован с новым доменом и бэкендом.

8. **Навигация**  
   При явном переключении перейти на `/` (это сохраняет корректность состояния роутинга после значительного изменения контекста).

> Оркестратор экспортирует тот же API для повторного запуска этой последовательности в любой момент; `setDomain()` использует тот же путь под капотом.

---

## 2) Вычисление эндпоинтов (HTTP & WS)

`src/net/endpoints.js` — **единственное** место, которое знает активную базу и ws url:

### `configureEndpoints({ backendLink, domain }, reason)`

* Нормализует базу (гарантирует `https://…/`).
* Сохраняет **domain** (строку).
* Производит WebSocket URL (`ws:`/`wss:`) с `?domain=<name>&space=public`.
* Эмитит событие `ENDPOINTS_CHANGED`.

Весь остальной код вызывает геттеры (`httpBase()`, `wsUrl()`, `wsQuery()`) и/или подписывается на изменения.

### Рантайм WS реагирует на изменения

Рантайм слушает изменение эндпоинтов и может переподключиться. Оркестратор также явно устанавливает URL и вызывает `reconnect`.

### HTTP-вызовы

Для эндпоинтов, которым нужен `domain` в query (auth, проверки admin и т.д.), вызывающие стороны добавляют его через `URLSearchParams` в `httpBase()`. (См. примеры в `auth.js`.)

---

## 3) `/info` — что мы сохраняем и как используем

Сырой JSON `/info` сохраняется как **сигнал**: `orchestrator.info()`.

**Типичная форма (сокращённо):**

```json
{
  "domains": ["savva.app", {"name":"art.savva"}],
  "blockchain_id": 369,
  "ipfs_gateways": ["https://cloudflare-ipfs.com/ipfs/"],
  "assets_url": "https://cdn…/assets/",
  "temp_assets_url": "https://cdn…/assets-test/"
}
```

**Где используется:**

* **Домены** — `AppContext` выводит `supportedDomains` (нормализованные, без дубликатов) и `selectedDomain`. Если `config.domain` задан, он предпочтителен; иначе используется первый поддерживаемый домен.
* **Цепочка/сеть** — `desiredChainId = info.blockchain_id` → `desiredChain()` выводит полные метаданные; `ensureWalletOnDesiredChain()` может вызываться перед транзакционными потоками.
* **IPFS-шлюзы** — `remoteIpfsGateways` берётся из `info.ipfs_gateways`, а `activeIpfsGateways` опционально добавляет **локальный** шлюз, если он включён в настройках.
* **База ассетов** — оркестратор выбирает `assets_url` (prod) или `temp_assets_url` (test), вычисляет `\<assetsBase\>/\<domain\>/`, затем загружает пакет домена. Активный префикс + распарсенная конфигурация публикуются через `domainAssetsPrefix()` / `domainAssetsConfig()`.
* **Фичи приложения, использующие `/info`** — например, маппинг цен токенов смотрит `/info.savva_contracts.SavvaToken.address`, чтобы поместить базовый токен SAVVA в таблицу цен.

---

## 4) Конфигурация домена — хранение и потребление

После шага (6) в потоке загрузки приложение имеет:

* `assetsEnv()` — `"prod"` или `"test"` (переключение в Настройках, используется администраторами).
* `assetsBaseUrl()` — вычислено из `/info` + окружения.
* `domainAssetsPrefix()` — либо `\<assetsBase\>/\<domain\>/`, либо `/domain_default/`.
* `domainAssetsConfig()` — распарсенный `config.yaml`.

### Кто читает конфиг домена?

* **CSS и брендинг**

  * `DomainCssLoader` загружает `assetUrl("domain.css")`, с инвалидирующей кэш параметром ревизии `(env|domain|assets_cid)`.
  * `FaviconLoader` читает секцию `favicon` (размеры иконок, манифест, mask icon, meta) и обновляет `<link rel="icon">` и т.д.; URL-ы разрешаются через `assetUrl(relPath)` и тоже кеш-бастятся.

* **Интернационализация (языки на домен)**

  * При каждой загрузке конфига приложение публикует языковые коды домена в систему i18n и корректирует `<title>` документа по текущей локали `title`. Также оно **валидирует** текущий язык относительно нового домена и переключается на поддерживаемый, если это необходимо.

* **Модули / Вкладки**

  * Основная навигация (`TabsBar`) читает `config.modules.tabs` (по умолчанию `modules/tabs.yaml`) и загружает YAML через **asset loader**, используя `assetUrl()`. Вкладки локализуются через ключи i18n и/или метаданные каждой вкладки.

* **HTML-блоки и другие ассеты**

  * Виджеты (например, `HtmlBlock`) вызывают `loadAssetResource(app, relPath)`, который разрешает относительные пути через `assetUrl()` и загружает текст/YAML соответствующе.

> Активный `assetUrl(relPath)` — это **просто** `domainAssetsPrefix()` + `relPath` (без ведущего `/`); это сохраняет согласованность у всех потребителей.

### Настройки → Ассеты (диагностика)

Администраторы могут переключать **prod/test**, видеть **активный префикс/источник** и запускать диагностику, которая подтверждает наличие ключевых полей (логотипы, локали, вкладки, favicon). Этот вид читает *только* опубликованные сигналы оркестратора.

---

## 5) Как работает переключение (бэкенд/домен)

### UI-поток

1. Диалог **Switch backend / domain** принимает URL бэкенда.
2. Вызывает `<backend>/info`, чтобы заполнить нормализованный список доменов (`[{name, …}]`).
3. Применяет выбор, вызывая API приложения.

### Поток оркестратора

* Если изменился **backend**, мы сначала **выходим из аккаунта** чтобы избежать состояния кук от разных бэкендов.
* Предварительно настраиваем эндпоинты (запрошенный домен), запрашиваем `/info`, разрешаем окончательный домен.
* Сохраняем оверрайд, задаём `config`, **финализируем эндпоинты**, загружаем пакет домена, **переподключаем WS**, переходим на главную.

### Согласованность авторизации

Если пользователь залогинен и `config.domain` изменился, приложение проактивно выкидывает сессию, чтобы не действовать в несоответствующем контексте. Появляется тост с объяснением причины.

---

## 6) `AppContext` — на что ваш код может опираться

`useApp()` предоставляет стабильный интерфейс, подложкой для которого служит оркестратор:

* **Состояние подключения:** `loading()`, `error()`, `config()`, `info()` (сырое `/info`).
* **Домены:** `supportedDomains()`, `selectedDomain()`, `selectedDomainName()`.
* **Сеть:** `desiredChainId()`, `desiredChain()`, `ensureWalletOnDesiredChain()`.
* **IPFS:** `remoteIpfsGateways()`, `activeIpfsGateways()`.
* **Ассеты:** `assetsEnv()`, `assetsBaseUrl()`, `domainAssetsPrefix()`, `domainAssetsConfig()`, и `assetUrl(relPath)`.
* **API переключения:** `initializeOrSwitch(newSettings)`, `setDomain(name)`, `clearConnectOverride()`.
* **Хелперы i18n:** `t(key, vars?)`, `lang()`, `setLang(code)`.

### Пример: загрузка YAML-фрагмента из пакета домена

```js
// (не компонент, просто набросок)
// Все видимые строки ДОЛЖНЫ быть локализованы; здесь пользователю ничего не показывается.
import { useApp } from "../context/AppContext.jsx";
import { loadAssetResource } from "../utils/assetLoader.js";

async function loadDomainTabs() {
  const app = useApp();
  const rel = app.domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml";
  const data = await loadAssetResource(app, rel, { type: "yaml" });
  return Array.isArray(data?.tabs) ? data.tabs : [];
}
```

### Пример: формирование аутентифицированного вызова, требующего домен

```js
// Все пользовательские строки должны быть локализованы через t():
import { useApp } from "../context/AppContext.jsx";

async function fetchAdminFlag(address) {
  const { t } = useApp();
  const url = new URL(`${httpBase()}is-admin`);
  url.searchParams.set("address", address);
  url.searchParams.set("domain", useApp().selectedDomainName());
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(t("error.connection.message"));
  return (await res.json())?.admin === true;
}
```

---

## 7) Обработка ошибок и состояния пустоты

Когда подключение не удаётся при старте (например, испорченная конфигурация, `/info` недоступен), `AppContext` экспонирует `error()` и оболочка рендерит центрированную карточку ошибки с i18n-строками и кнопкой **Retry**.

---

## 8) Примечания по i18n и UX-инвариантам

* **Каждая** видимая пользователю строка в UI-коде должна быть `t("…")` из `useApp()` (навигация, настройки, тосты и т.д.).
* `document.title` выводится из локализованного `title` в конфиге домена. Изменение **домена** или **окружения** обновляет брендинг мгновенно без пересборки.

---

## 9) Справочные фрагменты

* Pre‑info configure → `/info` → final configure — ядро оркестратора.
* База ассетов и fallback пакета домена — оркестратор.
* Эндпоинты и WS URL (`?domain=...`) — единый источник.
* Рантайм WS + переподключение при изменении эндпоинтов — детали рантайма.
* Диалог переключения, запрос `/info` и нормализация доменов — детали UI.

---

## 10) Операционный чеклист

* Чтобы изменить дефолты в деплое, обновите **`/default_connect.json`** (или `/default_connect.yaml`) на хостинге веб-сервера.
* Чтобы переключиться во время работы, используйте **Switch dialog** (gear должен быть включён в конфиге сайта).
* Чтобы предварительно просмотреть пакет домена, переключитесь в **Settings → Assets → Environment: Test**. Приложение загрузит из `temp_assets_url`.
* Если вы переключаете **backend**, приложение **выходит из аккаунта** заранее, чтобы избежать конфликтов кук между бэкендами.

---

## Приложение: модель данных вкратце

```ts
// Simplified conceptual model

type AppConfig = {
  backendLink: string;   // normalized with trailing slash
  domain: string;        // chosen domain name
  gear: boolean;         // UI gear enabled (from site YAML)
};

type Info = {
  domains: Array<string | { name: string; website?: string }>;
  blockchain_id?: number;
  ipfs_gateways?: string[];
  assets_url?: string;
  temp_assets_url?: string;
  // ...other fields (e.g., savva_contracts)
};

type Orchestrator = {
  config(): AppConfig | null;
  info(): Info | null;
  loading(): boolean;
  error(): Error | null;

  // orchestration
  initializeOrSwitch(newSettings?: Partial<AppConfig>): Promise<void>;
  setDomain(name: string): Promise<void>;
  clearConnectOverride(): void;

  // assets
  assetsEnv(): "prod" | "test";
  setAssetsEnv(next: "prod" | "test"): void;
  assetsBaseUrl(): string;
  domainAssetsPrefix(): string;           // '/domain_default/' or '<assetsBase>/<domain>/'
  domainAssetsConfig(): any | null;       // parsed config.yaml
};
```

---

Вот полная картина. С этими примитивами вы можете безопасно расширять UI, будучи уверенными, что эндпоинты, `/info` и ресурсы домена остаются **согласованными** и **реактивными** по всему приложению.