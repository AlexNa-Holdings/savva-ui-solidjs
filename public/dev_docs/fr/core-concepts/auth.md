# Flux d'Autorisation Web3

La plateforme SAVVA utilise une méthode d'authentification Web3 sans mot de passe. Les utilisateurs peuvent "se connecter" en utilisant n'importe quel portefeuille compatible EVM en signant simplement un message unique fourni par le serveur. Ce processus vérifie la propriété de l'adresse et établit une session sécurisée gérée par un cookie de navigateur.

## Vue d'ensemble du Flux

Le processus d'autorisation implique une séquence d'étapes orchestrées entre le frontend, le portefeuille de l'utilisateur, la blockchain et le backend de SAVVA.

1.  **Préparer un Message Unique** : Le frontend construit un message unique que l'utilisateur doit signer. Ce message est composé de deux parties : une valeur dynamique provenant d'un contrat intelligent et une valeur statique provenant du backend.
2.  **L'utilisateur signe le Message** : L'utilisateur est invité par son portefeuille (par exemple, MetaMask) à signer le message préparé.
3.  **Authentification Backend** : Le frontend envoie l'adresse de l'utilisateur et la signature résultante à l'endpoint `/auth` du backend.
4.  **Cookie de Session** : Si la signature est valide, le backend répond avec un en-tête `Set-Cookie`, établissant une session authentifiée.
5.  **Requêtes Authentifiées** : Toutes les requêtes API et WebSocket suivantes du navigateur incluront automatiquement ce cookie, identifiant l'utilisateur.
6.  **Récupérer le Profil Utilisateur** : Une fois authentifié, le frontend effectue un appel WebSocket à `/get-user` pour récupérer les détails complets du profil de l'utilisateur, tels que son avatar et son nom.

---

## Mise en Œuvre Étape par Étape

### 1. Préparation du Message à Signer

Pour prévenir les attaques par rejeu et garantir que chaque demande de connexion soit unique, le message à signer est construit à partir de deux sources :

-   Une chaîne dynamique **`auth_modifier`** lue à partir du contrat intelligent `UserProfile`.
-   Une chaîne statique **`auth_text_to_sign`** fournie par l'endpoint `/info` du backend.

Le frontend appelle d'abord la fonction `getString` sur le contrat `UserProfile` :

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
```

Il combine ensuite ce `modifierString` avec le texte provenant de `/info` :

```javascript
// Get text from the already-loaded /info response
const textToSign = app.info().auth_text_to_sign;

// Combine in the required order
const messageToSign = textToSign + modifierString;
```

### 2\. Signature avec le Portefeuille

En utilisant `viem`, le frontend demande la signature de l'utilisateur pour le message combiné. Cette action ouvre une invite dans le portefeuille de l'utilisateur.

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

La `signature` résultante est une longue chaîne hexadécimale (par exemple, `0x...`).

### 3\. Authentification avec le Backend

Le frontend effectue ensuite une requête `GET` à l'endpoint `/auth`, envoyant l'adresse de l'utilisateur, le domaine et la nouvelle signature en tant que paramètres de requête.

**Crucialement**, la requête `fetch` doit inclure l'option **`credentials: 'include'`**. Cela indique au navigateur de traiter l'en-tête `Set-Cookie` dans la réponse, ce qui est essentiel pour établir la session.

```javascript
// From: src/blockchain/auth.js

const authUrl = new URL(`${httpBase()}auth`);
authUrl.searchParams.set('user_addr', checksummedAccount);
authUrl.searchParams.set('domain', currentDomain);
authUrl.searchParams.set('signature', signature);

const authRes = await fetch(authUrl.toString(), { credentials: 'include' });
```

Si cela réussit, la réponse du backend inclura un en-tête similaire à celui-ci :

```
Set-Cookie: auth=...; Path=/; HttpOnly; Secure; SameSite=Lax
```

### 4\. Effectuer des Appels API Authentifiés

Avec le cookie maintenant défini dans le navigateur, les appels API suivants (comme vérifier les privilèges d'administrateur) doivent également inclure **`credentials: 'include'`** pour s'assurer que le cookie est envoyé avec la requête.

```javascript
// From: src/blockchain/auth.js

const isAdminUrl = new URL(`${httpBase()}is-admin`);
isAdminUrl.searchParams.set('address', checksummedAccount);
isAdminUrl.searchParams.set('domain', currentDomain);

const adminRes = await fetch(isAdminUrl.toString(), { credentials: 'include' });
const isAdminData = await adminRes.json(); // e.g., {"result":"ok","admin":true}
const isAdmin = !!isAdminData?.admin;
```

### 5\. Récupérer le Profil Utilisateur (via WebSocket)

Le navigateur envoie automatiquement le cookie d'authentification lors de la mise à niveau de la connexion WebSocket. Après une connexion réussie, la fonction `login` de l'application effectue un `wsCall` à la méthode `get-user` pour récupérer le profil complet de l'utilisateur.

```javascript
// From: src/context/useAppAuth.js (in the login function)

const userProfile = await getWsApi().call('get-user', {
  domain: coreUserData.domain,
  user_addr: checksummedAccount,
});
```

Un exemple de réponse de `/get-user` pourrait ressembler à ceci :

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

## Stockage de la Session

L'objet utilisateur final, qui est une combinaison des données principales (`address`, `domain`, `isAdmin`) et du profil récupéré depuis `/get-user`, est stocké dans le `AppContext` global et persistant dans `localStorage`. Cela permet de restaurer automatiquement la session lorsque l'utilisateur revient sur l'application.

## Le Processus de Déconnexion

Le processus de déconnexion inverse ces étapes :

1.  Une requête `POST` est envoyée à l'endpoint API `/logout` pour invalider la session côté serveur et effacer le cookie.
2.  Les données de l'utilisateur sont supprimées de l'état global et de `localStorage`.
3.  La connexion WebSocket est forcée à `reconnect`, établissant une nouvelle session non authentifiée.

-----

## Référence de Code

  - **Orchestration principale** : `src/blockchain/auth.js`
  - **Gestion de l'état et flux post-connexion** : `src/context/useAppAuth.js`