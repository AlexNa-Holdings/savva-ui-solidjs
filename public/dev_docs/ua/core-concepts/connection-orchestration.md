<!-- public/dev_docs/en/core-concepts/connection-orchestration.md -->

# Оркестрація підключень, збереження `/info` та конфігурація домену

Ця сторінка пояснює докладно, як додаток завантажується, підключається до бекенду, обирає домен та як зберігає/використовує відповідь `/info` та конфігурацію домену. Вона написана для професійних інженерів, які потребують розширення або налагодження цього потоку.

> **Коротко** — Існує єдиний оркестратор (`useAppOrchestrator`), який:
>
> * читає `/default_connect.json` (за згодою повертається до `.yaml`) + необов’язкове локальне переваження,
> * конфігурує HTTP/WS кінцеві точки,
> * отримує `/info`,
> * фіксує остаточний домен,
> * обирає базу для ассетів (prod/test), завантажує пакет домену,
> * перепідключає WebSocket, та
> * (при явному перемиканні) навігує до `/`.

---

## Термінологія та примітиви

* **Backend** — вузол SAVVA (HTTP API + WebSocket).
* **Domain** — яка мережа (брендинг, вкладки, ассети) рендеритиметься.
* **Domain Pack** — папка `\<assetsBase\>/\<domain\>/` з `config.yaml`, `domain.css`, i18n, зображеннями, модулями тощо. Додаток може завантажувати пакети з **prod** (`assets_url`) або **test** (`temp_assets_url`).
* **Override** — невеликий знімок `{ backendLink, domain }`, що зберігається в `localStorage` під ключем `connect_override`.

---

## Мапа файлів (де що лежить)

* **Оркестратор (джерело істини):** `src/context/useAppOrchestrator.js` — логіка завантаження та перемикання, `/info`, середовище ассетів, пакет домену, перепідключення WS. Надає `initializeOrSwitch()`, `setDomain()`, `clearConnectOverride()` та сигнали для `config`, `info`, `assetsEnv`, `domainAssets*`.
* **Обгортка контексту додатка:** `src/context/AppContext.jsx` — використовує оркестратор і виводить `supportedDomains`, `selectedDomain`, ланцюг/мережу, IPFS шлюзи та `assetUrl()`; також забезпечує узгодженість автентифікації при зміні домену.
* **HTTP/WS кінцеві точки:** `src/net/endpoints.js` — обчислює `httpBase()` і `wsUrl()` з `{ backendLink, domain }`, емитить подію при переналаштуванні та надає хелпери.
* **WebSocket runtime:** підхоплює зміни кінцевих точок і перепідключається відповідно.
* **UI перемикання:** `src/x/modals/SwitchConnectModal.jsx` — отримує `<backend>/info`, нормалізує список доменів і застосовує зміни через API додатка.
* **Головна оболонка:** динамічно застосовує `domain.css`, фавікони/мета, GA і прив’язує WS конектор.
* **Примітка про спадщину.** Ви можете зустріти старіший хук `useAppConnection`; продовжуйте користуватися **оркестратором** (поточний дизайн) як єдиним джерелом істини.

---

## 1) Послідовність завантаження — крок за кроком

Оркестратор запускається один раз при монтуванні:

1. **Завантажити налаштування сайту**
   Спробувати `GET /default_connect.json` перш за все; якщо відсутній — відкотитися до `GET /default_connect.yaml`. Розпарсити `backendLink`, `domain` та (опційно) `gear`. Ці значення комбінуються з збереженим **override** (якщо є).

2. **Нормалізувати та попередньо налаштувати кінцеві точки (до `/info`)**
   Перед отриманням `/info` ми встановлюємо кінцеві точки, використовуючи **запитуваний** домен «як є»:
   `configureEndpoints({ backendLink, domain }, "orch:pre-info")`. Це обчислює `httpBase()` і `wsUrl()` та емитить подію зміни, щоб runtime вказував на правильний сервер.

3. **Отримати `/info`**
   `GET <backendLink>/info` (no-cache). JSON зберігається в `orchestrator.info`.

4. **Визначити фінальний домен**
   Якщо користувач явно вказав домен — йому надається **перевага**; інакше ми вибираємо **перший** домен з `/info.domains` (якщо є). Зрешений `{ backendLink, domain }` стає `config`. Якщо це було перемикання, ми **персистимо** override.

5. **Фіналізувати кінцеві точки (після `/info`)**
   Повторно викликати `configureEndpoints` з **остаточним** доменом. Всі HTTP виклики мають використовувати `httpBase()`, а **WS URL містить** `?domain=...`.

6. **Середовище ассетів → завантажити пакет домену**
   Обрати базу з `/info`: `assets_url` (prod) або `temp_assets_url` (test). Спробувати `\<assetsBase\>/\<domain\>/config.yaml`, інакше відкотитися до `/domain_default/config.yaml`. Зберегти `domainAssetsPrefix`, `domainAssetsConfig` та джерело (`domain` vs `default`).

7. **Примусове перепідключення WS**
   Оновити URL клієнта ws, перепідключитися, чекати відкриття (до ~8 с). Це гарантує, що runtime синхронізований з новим доменом і бекендом.

8. **Навігація**
   При явному перемиканні навігуємо до `/` (щоб зберегти коректний стан маршрутизації після великої зміни контексту).

> Оркестратор надає той самий API для повторного запуску цієї послідовності у будь‑який момент; `setDomain()` використовує той самий шлях під капотом.

---

## 2) Обчислення кінцевих точок (HTTP & WS)

`src/net/endpoints.js` — ЄДИНЕ місце, що знає активну базу та ws url:

### `configureEndpoints({ backendLink, domain }, reason)`

* Нормалізує базу (гарантує `https://…/`).
* Зберігає **domain** (рядок).
* Виводить WebSocket URL (`ws:`/`wss:`) з `?domain=<name>&space=public`.
* Емітує подію `ENDPOINTS_CHANGED`.

Увесь інший код викликає геттери (`httpBase()`, `wsUrl()`, `wsQuery()`) і/або підписується на зміни.

### WS runtime реагує на зміни

Runtime слухає зміну кінцевих точок і може перепідключитися. Оркестратор також явно встановлює URL і викликає `reconnect`.

### HTTP виклики

Для кінцевих точок, які потребують `domain` у запиті (авторизація, адмін-перевірки тощо), викликачі додають його через `URLSearchParams` до `httpBase()`. (Див. приклади в `auth.js`.)

---

## 3) `/info` — що ми зберігаємо і як використовуємо

Сирий JSON `/info` зберігається як **сигнал**: `orchestrator.info()`.

**Типова форма (скорочено):**

```json
{
  "domains": ["savva.app", {"name":"art.savva"}],
  "blockchain_id": 369,
  "ipfs_gateways": ["https://cloudflare-ipfs.com/ipfs/"],
  "assets_url": "https://cdn…/assets/",
  "temp_assets_url": "https://cdn…/assets-test/"
}
```

**Де це використовується:**

* **Домен(и)** — `AppContext` виводить `supportedDomains` (нормалізовані, без дублікатів) та `selectedDomain`. Якщо `config.domain` встановлений, йому надається перевага; інакше використовується перший підтримуваний домен.
* **Ланцюг/мережа** — `desiredChainId = info.blockchain_id` → `desiredChain()` виводить повну метадані; `ensureWalletOnDesiredChain()` може викликатися перед виконанням транзакцій.
* **IPFS шлюзи** — `remoteIpfsGateways` береться з `info.ipfs_gateways`, а `activeIpfsGateways` опційно додає **локальний** шлюз зверху, якщо увімкнено в налаштуваннях.
* **База ассетів** — Оркестратор обирає `assets_url` (prod) або `temp_assets_url` (test), обчислює `\<assetsBase\>/\<domain\>/`, потім завантажує пакет домену. Активний префікс + розпарсений конфіг публікуються через `domainAssetsPrefix()` / `domainAssetsConfig()`.
* **Фічі додатка, що використовують `/info`** — наприклад, відображення ціни токену шукає `/info.savva_contracts.SavvaToken.address`, щоб додати базовий токен SAVVA до таблиці цін.

---

## 4) Конфігурація домену — збереження та споживання

Після кроку (6) у процесі завантаження додаток має:

* `assetsEnv()` — `"prod"` або `"test"` (перемикається в Налаштуваннях, використовується адміністратором).
* `assetsBaseUrl()` — обчислено з `/info` + env.
* `domainAssetsPrefix()` — або `\<assetsBase\>/\<domain\>/`, або `/domain_default/`.
* `domainAssetsConfig()` — розпарсений `config.yaml`.

### Хто читає конфіг домену?

* **CSS та брендинг**

  * `DomainCssLoader` завантажує `assetUrl("domain.css")`, з bust‑кешем за ревізією `(env|domain|assets_cid)`.
  * `FaviconLoader` читає секцію `favicon` (розміри іконок, manifest, mask icon, meta) і оновлює `<link rel="icon">` тощо; URL резолюються через `assetUrl(relPath)` і також кеш‑бастяться.

* **Інтернаціоналізація (мови на рівні домену)**

  * При кожному завантаженні конфігу додаток публікує мовні коди домену в i18n систему і коригує `<title>` документа під поточну локальну назву. Також він **валідовує** поточну мову відносно нового домену і перемикає на підтримувану, якщо потрібно.

* **Модулі / вкладки**

  * Головна навігаційна панель (`TabsBar`) читає `config.modules.tabs` (за замовчуванням `modules/tabs.yaml`) і завантажує YAML через **asset loader** використовуючи `assetUrl()`. Вкладки локалізуються через i18n ключі та/або метадані кожної вкладки.

* **HTML‑блоки та інші ассети**

  * Віджети (наприклад, `HtmlBlock`) викликають `loadAssetResource(app, relPath)`, що резолює відносні шляхи через `assetUrl()` і отримує текст/YAML відповідно.

> Активний `assetUrl(relPath)` — **просто** `domainAssetsPrefix()` + `relPath` (без ведучого `/`); це гарантує узгодженість усіх споживачів.

### Налаштування → Ассети (діагностика)

Адміністратори можуть переключити **prod/test**, побачити **активний префікс/джерело** та запустити діагностику, що підтверджує наявність ключових полів (логотипи, локалі, вкладки, favicon). Цей вигляд читає *лише* опубліковані сигнали оркестратора.

---

## 5) Як працює перемикання (бекенд/домен)

### UI потік

1. Діалог **Switch backend / domain** приймає URL бекенду.
2. Виконує `<backend>/info`, щоб заповнити нормалізований список доменів (`[{name, …}]`).
3. Застосовує вибір, викликаючи API додатка.

### Потік оркестратора

* Якщо змінився **backend**, спочатку **виконується логаут**, щоб уникнути перехресного стану cookie.
* Попередньо конфігуруємо кінцеві точки (запитуваний домен), отримуємо `/info`, визначаємо фінальний домен.
* Персистимо override, встановлюємо `config`, **фіналізуємо кінцеві точки**, завантажуємо пакет домену, **перепідключаємо WS**, навігуємо додому.

### Узгодженість автентифікації

Якщо користувач залогінений і `config.domain` змінюється, додаток проактивно виконує логаут, щоб уникнути дій у невідповідному контексті. Пояснювальний тост інформує користувача чому.

---

## 6) `AppContext` — на що ваш код може покладатися

`useApp()` відкриває стабільний інтерфейс, підкріплений оркестратором:

* **Стан підключення:** `loading()`, `error()`, `config()`, `info()` (сирий `/info`).
* **Домени:** `supportedDomains()`, `selectedDomain()`, `selectedDomainName()`.
* **Мережа:** `desiredChainId()`, `desiredChain()`, `ensureWalletOnDesiredChain()`.
* **IPFS:** `remoteIpfsGateways()`, `activeIpfsGateways()`.
* **Ассети:** `assetsEnv()`, `assetsBaseUrl()`, `domainAssetsPrefix()`, `domainAssetsConfig()`, та `assetUrl(relPath)`.
* **API перемикання:** `initializeOrSwitch(newSettings)`, `setDomain(name)`, `clearConnectOverride()`.
* **i18n хелпери:** `t(key, vars?)`, `lang()`, `setLang(code)`.

### Приклад: завантаження YAML‑фрагмента з пакета домену

```js
// (not a component, just a sketch)
// All visible strings MUST be localized; here none are shown to the user.
import { useApp } from "../context/AppContext.jsx";
import { loadAssetResource } from "../utils/assetLoader.js";

async function loadDomainTabs() {
  const app = useApp();
  const rel = app.domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml";
  const data = await loadAssetResource(app, rel, { type: "yaml" });
  return Array.isArray(data?.tabs) ? data.tabs : [];
}
```

### Приклад: побудова авторизованого виклику, що потребує домену

```js
// All user-visible strings must be localized via t():
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

## 7) Обробка помилок та порожні стани

Коли підключення не вдається під час завантаження (наприклад, некоректний конфіг, `/info` недоступний), `AppContext` відкриває `error()`, і оболонка рендерить центровану картку з помилкою з i18n‑рядками та кнопкою **Retry**.

---

## 8) Примітки з i18n та UX інваріантами

* **Кожен** рядок, видимий користувачу в UI‑коді, повинен бути `t("…")` з `useApp()` (навігація, налаштування, тости тощо).
* `document.title` походить з локалізованого `title` у конфігу домену. Зміна **домена** або **env** негайно оновлює брендинг без повторної збірки.

---

## 9) Зразки для довідки

* Попередня конфігурація → `/info` → фінальна конфігурація — ядро оркестратора.
* База ассетів та fallback пакета домену — оркестратор.
* Кінцеві точки та WS URL (`?domain=...`) — єдине джерело.
* WS runtime + перепідключення при зміні кінцевих точок — деталі runtime.
* Діалог перемикання `/info` fetch & нормалізація доменів — UI деталь.

---

## 10) Операційний чекліст

* Щоб змінити значення за замовчуванням для деплойменту, оновіть **`/default_connect.json`** (або `/default_connect.yaml`) на хостингу.
* Щоб переключити під час роботи, використайте **Switch dialog** (шестерня має бути увімкненою конфігурацією сайту).
* Щоб попередньо переглянути пакет домену, увімкніть **Settings → Assets → Environment: Test**. Додаток завантажиться з `temp_assets_url`.
* Якщо ви змінюєте **backend**, додаток **виконає логаут** спочатку, щоб уникнути крос‑бекендних cookie.

---

## Додаток: модель даних у загальному вигляді

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

Ось повна картина. З цими примітивами ви можете безпечно розширювати UI, будучи впевненими, що кінцеві точки, `/info` та ресурси домену залишаються **узгодженими** та **реактивними** по всьому додатку.