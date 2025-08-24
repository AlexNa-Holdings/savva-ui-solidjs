# Поток авторизации Web3

Платформа SAVVA использует метод аутентификации Web3 без пароля. Пользователи могут "войти", используя любой совместимый с EVM кошелек, просто подписав уникальное сообщение, предоставленное сервером. Этот процесс подтверждает право собственности на адрес и устанавливает безопасную сессию, управляемую куки браузера.

## Обзор потока

Процесс авторизации включает последовательность шагов, организованных между фронтендом, кошельком пользователя, блокчейном и бэкендом SAVVA.

1.  **Подготовка уникального сообщения**: Фронтенд создает уникальное сообщение для подписания пользователем. Это сообщение состоит из двух частей: динамического значения из смарт-контракта и статического значения из бэкенда.
2.  **Пользователь подписывает сообщение**: Кошелек пользователя (например, MetaMask) предлагает подписать подготовленное сообщение.
3.  **Аутентификация на бэкенде**: Фронтенд отправляет адрес пользователя и полученную подпись на конечную точку `/auth` бэкенда.
4.  **Кука сессии**: Если подпись действительна, бэкенд отвечает заголовком `Set-Cookie`, устанавливая аутентифицированную сессию.
5.  **Аутентифицированные запросы**: Все последующие API и WebSocket запросы из браузера теперь автоматически будут включать эту куку, идентифицируя пользователя.
6.  **Получение профиля пользователя**: После аутентификации фронтенд делает WebSocket вызов к `/get-user`, чтобы получить полные данные профиля пользователя, такие как его аватар и имя.

---

## Пошаговая реализация

### 1. Подготовка сообщения для подписания

Чтобы предотвратить атаки повторного воспроизведения и обеспечить уникальность каждого запроса на вход, сообщение для подписания создается из двух источников:

-   Динамическая строка **`auth_modifier`**, считываемая из смарт-контракта `UserProfile`.
-   Статическая строка **`auth_text_to_sign`**, предоставленная конечной точкой `/info` бэкенда.

Сначала фронтенд вызывает функцию `getString` на контракте `UserProfile`:

```javascript
// Из: src/blockchain/auth.js

// Получить экземпляр контракта UserProfile
const userProfileContract = await getSavvaContract(app, 'UserProfile');

// Подготовить аргументы для вызова контракта
const domainHex = toHexBytes32(""); // Домен пуст для глобального модификатора
const keyHex = toHexBytes32("auth_modifier");

// Получить модификатор (возвращает строку в формате bytes32 hex)
const modifierHex = await userProfileContract.read.getString([
  account,      // Адрес пользователя
  domainHex,    // bytes32 представление ""
  keyHex        // bytes32 представление "auth_modifier"
]);

// Преобразовать шестнадцатеричное значение в читаемую строку
const modifierString = hexToString(modifierHex, { size: 32 });
```

Затем он объединяет эту `modifierString` с текстом из `/info`:

```javascript
// Получить текст из уже загруженного ответа /info
const textToSign = app.info().auth_text_to_sign;

// Объединить в требуемом порядке
const messageToSign = textToSign + modifierString;
```

### 2\. Подписание с помощью кошелька

Используя `viem`, фронтенд запрашивает подпись пользователя для объединенного сообщения. Это действие открывает запрос в кошельке пользователя.

```javascript
// Из: src/blockchain/auth.js

const walletClient = createWalletClient({
  chain: app.desiredChain(),
  transport: custom(window.ethereum)
});

const signature = await walletClient.signMessage({
  account,
  message: messageToSign,
});
```

Полученная `signature` — это длинная шестнадцатеричная строка (например, `0x...`).

### 3\. Аутентификация на бэкенде

Затем фронтенд делает `GET` запрос к конечной точке `/auth`, отправляя адрес пользователя, домен и новую подпись в качестве параметров запроса.

**Критически важно**, чтобы запрос `fetch` включал опцию **`credentials: 'include'`**. Это говорит браузеру обработать заголовок `Set-Cookie` в ответе, что необходимо для установления сессии.

```javascript
// Из: src/blockchain/auth.js

const authUrl = new URL(`${httpBase()}auth`);
authUrl.searchParams.set('user_addr', checksummedAccount);
authUrl.searchParams.set('domain', currentDomain);
authUrl.searchParams.set('signature', signature);

const authRes = await fetch(authUrl.toString(), { credentials: 'include' });
```

Если запрос успешен, ответ бэкенда будет включать заголовок, похожий на этот:

```
Set-Cookie: auth=...; Path=/; HttpOnly; Secure; SameSite=Lax
```

### 4\. Выполнение аутентифицированных API вызовов

С установленной кукой в браузере последующие API вызовы (например, проверка прав администратора) также должны включать **`credentials: 'include'`**, чтобы гарантировать, что кука отправляется с запросом.

```javascript
// Из: src/blockchain/auth.js

const isAdminUrl = new URL(`${httpBase()}is-admin`);
isAdminUrl.searchParams.set('address', checksummedAccount);
isAdminUrl.searchParams.set('domain', currentDomain);

const adminRes = await fetch(isAdminUrl.toString(), { credentials: 'include' });
const isAdminData = await adminRes.json(); // например, {"result":"ok","admin":true}
const isAdmin = !!isAdminData?.admin;
```

### 5\. Получение профиля пользователя (через WebSocket)

Браузер автоматически отправляет куку авторизации во время обновления соединения WebSocket. После успешного входа функция `login` приложения делает `wsCall` к методу `get-user`, чтобы получить полный профиль пользователя.

```javascript
// Из: src/context/useAppAuth.js (в функции login)

const userProfile = await getWsApi().call('get-user', {
  domain: coreUserData.domain,
  user_addr: checksummedAccount,
});
```

Пример ответа от `/get-user` может выглядеть так:

```json
{
  "name": "alexna",
  "avatar": "QmbXwxPzs2veVYFbm7yybfK3rBMxEebuhAcWh3tuKdDTbq?filename=.png",
  "staked": 42529097734827650000000000,
  "n_followers": 9,
  "banned": false
}
```

-----

## Хранение сессии

Финальный объект пользователя, который является комбинацией основных данных (`address`, `domain`, `isAdmin`) и профиля, полученного из `/get-user`, хранится в глобальном `AppContext` и сохраняется в `localStorage`. Это позволяет автоматически восстанавливать сессию, когда пользователь повторно посещает приложение.

## Процесс выхода

Процесс выхода отменяет эти шаги:

1.  `POST` запрос отправляется на конечную точку API `/logout`, чтобы аннулировать серверную сессию и очистить куку.
2.  Данные пользователя удаляются из глобального состояния и `localStorage`.
3.  Соединение WebSocket принудительно `переподключается`, устанавливая новую, неаутентифицированную сессию.

-----

## Справочник по коду

  - **Основная организация**: `src/blockchain/auth.js`
  - **Управление состоянием и поток после входа**: `src/context/useAppAuth.js`