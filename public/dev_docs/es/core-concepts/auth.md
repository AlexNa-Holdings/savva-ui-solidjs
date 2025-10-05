# Flujo de autorización Web3

La plataforma SAVVA utiliza un método de autenticación Web3 sin contraseña. Los usuarios pueden «iniciar sesión» usando cualquier wallet compatible con EVM firmando simplemente un mensaje único proporcionado por el servidor. Este proceso verifica la propiedad de la dirección y establece una sesión segura gestionada por una cookie del navegador.

## Resumen del flujo

El proceso de autorización implica una secuencia de pasos orquestados entre el frontend, la wallet del usuario, la blockchain y el backend de SAVVA.

1.  **Preparar un mensaje único**: El frontend construye un mensaje único para que el usuario lo firme. Este mensaje se compone de dos partes: un valor dinámico de un contrato inteligente y un valor estático del backend.
2.  **El usuario firma el mensaje**: La wallet del usuario (p. ej., MetaMask) le pide que firme el mensaje preparado.
3.  **Autenticación en el backend**: El frontend envía la dirección del usuario y la firma resultante al endpoint `/auth` del backend.
4.  **Cookie de sesión**: Si la firma es válida, el backend responde con una cabecera `Set-Cookie`, estableciendo una sesión autenticada.
5.  **Peticiones autenticadas**: Todas las solicitudes API y WebSocket posteriores desde el navegador incluirán automáticamente esta cookie, identificando al usuario.
6.  **Obtener el perfil de usuario**: Una vez autenticado, el frontend realiza una llamada WebSocket a `/get-user` para obtener los detalles completos del perfil del usuario, como su avatar y nombre.

---

## Implementación paso a paso

### 1. Preparar el mensaje a firmar

Para evitar ataques de repetición (replay attacks) y garantizar que cada solicitud de inicio de sesión sea única, el mensaje a firmar se construye a partir de dos fuentes:

-   Un string dinámico **`auth_modifier`** leído desde el contrato inteligente `UserProfile`.
-   Un string estático **`auth_text_to_sign`** proporcionado por el endpoint `/info` del backend.

El frontend primero llama a la función `getString` en el contrato `UserProfile`:

```javascript
// From: src/blockchain/auth.js

// Get the UserProfile contract instance
const userProfileContract = await getSavvaContract(app, 'UserProfile');

// Prepare arguments for the contract call
const domainHex = toHexBytes32(""); // Domain is empty for the global modifier
const keyHex = toHexBytes32("auth_modifier");

// Fetch the modifier (returns a bytes32 hex string)
const modifierHex = await userProfileContract.read.getString([
  account,      // User's address
  domainHex,    // bytes32 representation of ""
  keyHex        // bytes32 representation of "auth_modifier"
]);

// Convert the hex value to a readable string
const modifierString = hexToString(modifierHex, { size: 32 });
````

A continuación combina este `modifierString` con el texto de `/info`:

```javascript
// Get text from the already-loaded /info response
const textToSign = app.info().auth_text_to_sign;

// Combine in the required order
const messageToSign = textToSign + modifierString;
```

### 2\. Firmar con la wallet

Usando `viem`, el frontend solicita la firma del usuario para el mensaje combinado. Esta acción abre un aviso en la wallet del usuario.

```javascript
// From: src/blockchain/auth.js

const walletClient = createWalletClient({
  chain: app.desiredChain(),
  transport: custom(window.ethereum)
});

const signature = await walletClient.signMessage({
  account,
  message: messageToSign,
});
```

La `signature` resultante es una cadena hex larga (por ejemplo, `0x...`).

### 3\. Autenticación con el backend

A continuación, el frontend realiza una solicitud `GET` al endpoint `/auth`, enviando la dirección del usuario, el dominio y la nueva signature como parámetros de consulta.

**Es crucial**, la petición `fetch` debe incluir la opción **`credentials: 'include'`**. Esto indica al navegador que procese la cabecera `Set-Cookie` en la respuesta, algo esencial para establecer la sesión.

```javascript
// From: src/blockchain/auth.js

const authUrl = new URL(`${httpBase()}auth`);
authUrl.searchParams.set('user_addr', checksummedAccount);
authUrl.searchParams.set('domain', currentDomain);
authUrl.searchParams.set('signature', signature);

const authRes = await fetch(authUrl.toString(), { credentials: 'include' });
```

Si tiene éxito, la respuesta del backend incluirá una cabecera similar a esta:

```
Set-Cookie: auth=...; Path=/; HttpOnly; Secure; SameSite=Lax
```

### 4\. Realizar llamadas API autenticadas

Con la cookie ya establecida en el navegador, las llamadas API posteriores (como comprobar privilegios de administrador) también deben incluir **`credentials: 'include'`** para asegurar que la cookie se envíe con la petición.

```javascript
// From: src/blockchain/auth.js

const isAdminUrl = new URL(`${httpBase()}is-admin`);
isAdminUrl.searchParams.set('address', checksummedAccount);
isAdminUrl.searchParams.set('domain', currentDomain);

const adminRes = await fetch(isAdminUrl.toString(), { credentials: 'include' });
const isAdminData = await adminRes.json(); // e.g., {"result":"ok","admin":true}
const isAdmin = !!isAdminData?.admin;
```

### 5\. Obtener el perfil de usuario (vía WebSocket)

El navegador envía automáticamente la cookie de autenticación durante el upgrade de la conexión WebSocket. Tras un inicio de sesión exitoso, la función `login` de la aplicación realiza una `wsCall` al método `get-user` para recuperar el perfil completo del usuario.

```javascript
// From: src/context/useAppAuth.js (in the login function)

const userProfile = await getWsApi().call('get-user', {
  domain: coreUserData.domain,
  user_addr: checksummedAccount,
});
```

Una respuesta de ejemplo de `/get-user` podría ser:

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

## Almacenamiento de la sesión

El objeto de usuario final, que es una combinación de los datos principales (`address`, `domain`, `isAdmin`) y el perfil obtenido de `/get-user`, se almacena en el `AppContext` global y se persiste en `localStorage`. Esto permite que la sesión se restaure automáticamente cuando el usuario vuelve a visitar la app.

## El proceso de cierre de sesión

El proceso de cierre de sesión invierte estos pasos:

1.  Se envía una solicitud `POST` al endpoint de la API `/logout` para invalidar la sesión en el servidor y borrar la cookie.
2.  Se elimina la información del usuario del estado global y de `localStorage`.
3.  Se fuerza a la conexión WebSocket a `reconnect`, estableciendo una nueva sesión no autenticada.

-----

## Referencia de código

  - **Orquestación principal**: `src/blockchain/auth.js`
  - **Gestión de estado y flujo posterior al inicio de sesión**: `src/context/useAppAuth.js`