# Потік авторизації Web3

Платформа SAVVA використовує безпарольний метод аутентифікації Web3. Користувачі можуть "увійти" за допомогою будь-якого гаманця, сумісного з EVM, просто підписавши унікальне повідомлення, надане сервером. Цей процес перевіряє право власності на адресу та встановлює безпечну сесію, керовану кукі браузера.

## Огляд потоку

Процес авторизації складається з послідовності кроків, організованих між фронтендом, гаманцем користувача, блокчейном та бекендом SAVVA.

1.  **Підготовка унікального повідомлення**: Фронтенд створює унікальне повідомлення для підпису користувача. Це повідомлення складається з двох частин: динамічного значення з смарт-контракту та статичного значення з бекенду.
2.  **Користувач підписує повідомлення**: Користувач отримує запит від свого гаманця (наприклад, MetaMask) на підпис підготовленого повідомлення.
3.  **Аутентифікація на бекенді**: Фронтенд надсилає адресу користувача та отриманий підпис на кінцеву точку `/auth` бекенду.
4.  **Кукі сесії**: Якщо підпис дійсний, бекенд відповідає заголовком `Set-Cookie`, встановлюючи аутентифіковану сесію.
5.  **Аутентифіковані запити**: Усі наступні API та WebSocket запити з браузера тепер автоматично включатимуть це кукі, ідентифікуючи користувача.
6.  **Отримання профілю користувача**: Після аутентифікації фронтенд робить WebSocket виклик до `/get-user`, щоб отримати повні деталі профілю користувача, такі як його аватар та ім'я.

---

## Покрокова реалізація

### 1. Підготовка повідомлення для підпису

Щоб запобігти атакам повторного використання та забезпечити унікальність кожного запиту на вхід, повідомлення для підпису складається з двох джерел:

-   Динамічний рядок **`auth_modifier`**, прочитаний з смарт-контракту `UserProfile`.
-   Статичний рядок **`auth_text_to_sign`**, наданий кінцевою точкою `/info` бекенду.

Фронтенд спочатку викликає функцію `getString` на контракті `UserProfile`:

```javascript
// З: src/blockchain/auth.js

// Отримати екземпляр контракту UserProfile
const userProfileContract = await getSavvaContract(app, 'UserProfile');

// Підготувати аргументи для виклику контракту
const domainHex = toHexBytes32(""); // Домен порожній для глобального модифікатора
const keyHex = toHexBytes32("auth_modifier");

// Отримати модифікатор (повертає рядок hex bytes32)
const modifierHex = await userProfileContract.read.getString([
  account,      // Адреса користувача
  domainHex,    // bytes32 представлення ""
  keyHex        // bytes32 представлення "auth_modifier"
]);

// Перетворити hex значення на читабельний рядок
const modifierString = hexToString(modifierHex, { size: 32 });
```

Потім він об'єднує цей `modifierString` з текстом з `/info`:

```javascript
// Отримати текст з вже завантаженого відповіді /info
const textToSign = app.info().auth_text_to_sign;

// Об'єднати в потрібному порядку
const messageToSign = textToSign + modifierString;
```

### 2\. Підписування гаманцем

Використовуючи `viem`, фронтенд запитує підпис користувача для об'єднаного повідомлення. Ця дія відкриває запит у гаманці користувача.

```javascript
// З: src/blockchain/auth.js

const walletClient = createWalletClient({
  chain: app.desiredChain(),
  transport: custom(window.ethereum)
});

const signature = await walletClient.signMessage({
  account,
  message: messageToSign,
});
```

Отриманий `signature` є довгим hex рядком (наприклад, `0x...`).

### 3\. Аутентифікація на бекенді

Фронтенд потім робить запит `GET` до кінцевої точки `/auth`, надсилаючи адресу користувача, домен та новий підпис як параметри запиту.

**Критично**, запит `fetch` повинен включати опцію **`credentials: 'include'`**. Це говорить браузеру обробити заголовок `Set-Cookie` у відповіді, що є суттєвим для встановлення сесії.

```javascript
// З: src/blockchain/auth.js

const authUrl = new URL(`${httpBase()}auth`);
authUrl.searchParams.set('user_addr', checksummedAccount);
authUrl.searchParams.set('domain', currentDomain);
authUrl.searchParams.set('signature', signature);

const authRes = await fetch(authUrl.toString(), { credentials: 'include' });
```

Якщо успішно, відповідь бекенду міститиме заголовок, подібний до цього:

```
Set-Cookie: auth=...; Path=/; HttpOnly; Secure; SameSite=Lax
```

### 4\. Виконання аутентифікованих API викликів

З кукі, тепер встановленим у браузері, наступні API виклики (наприклад, перевірка адміністративних привілеїв) також повинні включати **`credentials: 'include'`**, щоб забезпечити надсилання кукі з запитом.

```javascript
// З: src/blockchain/auth.js

const isAdminUrl = new URL(`${httpBase()}is-admin`);
isAdminUrl.searchParams.set('address', checksummedAccount);
isAdminUrl.searchParams.set('domain', currentDomain);

const adminRes = await fetch(isAdminUrl.toString(), { credentials: 'include' });
const isAdminData = await adminRes.json(); // наприклад, {"result":"ok","admin":true}
const isAdmin = !!isAdminData?.admin;
```

### 5\. Отримання профілю користувача (через WebSocket)

Браузер автоматично надсилає кукі авторизації під час оновлення з'єднання WebSocket. Після успішного входу функція `login` програми виконує `wsCall` до методу `get-user`, щоб отримати повний профіль користувача.

```javascript
// З: src/context/useAppAuth.js (в функції входу)

const userProfile = await getWsApi().call('get-user', {
  domain: coreUserData.domain,
  user_addr: checksummedAccount,
});
```

Приклад відповіді з `/get-user` може виглядати так:

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

## Зберігання сесії

Останній об'єкт користувача, який є комбінацією основних даних (`address`, `domain`, `isAdmin`) та профілю, отриманого з `/get-user`, зберігається в глобальному `AppContext` та зберігається в `localStorage`. Це дозволяє автоматично відновити сесію, коли користувач знову відвідує додаток.

## Процес виходу

Процес виходу скасовує ці кроки:

1.  Запит `POST` надсилається до API кінцевої точки `/logout`, щоб анулювати сесію на сервері та очистити кукі.
2.  Дані користувача видаляються з глобального стану та `localStorage`.
3.  З'єднання WebSocket примусово "перепідключається", встановлюючи нову, неаутентифіковану сесію.

-----

## Кодова довідка

  - **Основна організація**: `src/blockchain/auth.js`
  - **Управління станом та потік після входу**: `src/context/useAppAuth.js`