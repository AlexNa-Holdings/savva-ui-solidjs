# Web3 Authorization Flow

The SAVVA platform uses a passwordless Web3 authentication method. Users can "log in" using any EVM-compatible wallet by simply signing a unique, server-provided message. This process verifies ownership of the address and establishes a secure session managed by a browser cookie.

## Overview of the Flow

The authorization process involves a sequence of steps orchestrated between the frontend, the user's wallet, the blockchain, and the SAVVA backend.

1.  **Prepare a Unique Message**: The frontend constructs a unique message for the user to sign. This message is composed of two parts: a dynamic value from a smart contract and a static value from the backend.
2.  **User Signs the Message**: The user is prompted by their wallet (e.g., MetaMask) to sign the prepared message.
3.  **Backend Authentication**: The frontend sends the user's address and the resulting signature to the backend's `/auth` endpoint.
4.  **Session Cookie**: If the signature is valid, the backend responds with a `Set-Cookie` header, establishing an authenticated session.
5.  **Authenticated Requests**: All subsequent API and WebSocket requests from the browser will now automatically include this cookie, identifying the user.
6.  **Fetch User Profile**: Once authenticated, the frontend makes a WebSocket call to `/get-user` to fetch the user's full profile details, such as their avatar and name.

---

## Step-by-Step Implementation

### 1. Preparing the Message to Sign

To prevent replay attacks and ensure each login request is unique, the message to be signed is constructed from two sources:

-   A dynamic **`auth_modifier`** string read from the `UserProfile` smart contract.
-   A static **`auth_text_to_sign`** string provided by the backend's `/info` endpoint.

The frontend first calls the `getString` function on the `UserProfile` contract:

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

It then combines this `modifierString` with the text from `/info`:

```javascript
// Get text from the already-loaded /info response
const textToSign = app.info().auth_text_to_sign;

// Combine in the required order
const messageToSign = textToSign + modifierString;
```

### 2\. Signing with the Wallet

Using `viem`, the frontend requests the user's signature for the combined message. This action opens a prompt in the user's wallet.

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

The resulting `signature` is a long hex string (e.g., `0x...`).

### 3\. Authenticating with the Backend

The frontend then makes a `GET` request to the `/auth` endpoint, sending the user's address, domain, and the new signature as query parameters.

**Crucially**, the `fetch` request must include the **`credentials: 'include'`** option. This tells the browser to process the `Set-Cookie` header in the response, which is essential for establishing the session.

```javascript
// From: src/blockchain/auth.js

const authUrl = new URL(`${httpBase()}auth`);
authUrl.searchParams.set('user_addr', checksummedAccount);
authUrl.searchParams.set('domain', currentDomain);
authUrl.searchParams.set('signature', signature);

const authRes = await fetch(authUrl.toString(), { credentials: 'include' });
```

If successful, the backend's response will include a header similar to this:

```
Set-Cookie: auth=...; Path=/; HttpOnly; Secure; SameSite=Lax
```

### 4\. Making Authenticated API Calls

With the cookie now set in the browser, subsequent API calls (like checking for admin privileges) must also include **`credentials: 'include'`** to ensure the cookie is sent with the request.

```javascript
// From: src/blockchain/auth.js

const isAdminUrl = new URL(`${httpBase()}is-admin`);
isAdminUrl.searchParams.set('address', checksummedAccount);
isAdminUrl.searchParams.set('domain', currentDomain);

const adminRes = await fetch(isAdminUrl.toString(), { credentials: 'include' });
const isAdminData = await adminRes.json(); // e.g., {"result":"ok","admin":true}
const isAdmin = !!isAdminData?.admin;
```

### 5\. Fetching the User Profile (via WebSocket)

The browser automatically sends the auth cookie during the WebSocket connection upgrade. After a successful login, the application's `login` function makes a `wsCall` to the `get-user` method to retrieve the full user profile.

```javascript
// From: src/context/useAppAuth.js (in the login function)

const userProfile = await getWsApi().call('get-user', {
  domain: coreUserData.domain,
  user_addr: checksummedAccount,
});
```

An example response from `/get-user` might look like this:

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

## Storing the Session

The final user object, which is a combination of the core data (`address`, `domain`, `isAdmin`) and the profile fetched from `/get-user`, is stored in the global `AppContext` and persisted to `localStorage`. This allows the session to be restored automatically when the user revisits the app.

## The Logout Process

The logout process reverses these steps:

1.  A `POST` request is sent to the `/logout` API endpoint to invalidate the server-side session and clear the cookie.
2.  The user's data is removed from the global state and `localStorage`.
3.  The WebSocket connection is forced to `reconnect`, establishing a new, unauthenticated session.

-----

## Code Reference

  - **Main orchestration**: `src/blockchain/auth.js`
  - **State management and post-login flow**: `src/context/useAppAuth.js`

