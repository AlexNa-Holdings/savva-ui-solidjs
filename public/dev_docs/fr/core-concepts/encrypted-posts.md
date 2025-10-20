# Publications chiffrées

Savva prend en charge les publications chiffrées de bout en bout qui ne peuvent être consultées que par les abonnés. Cette fonctionnalité permet aux créateurs de publier du contenu exclusif pour leurs abonnés payants tout en garantissant que ni la plateforme ni les passerelles IPFS ne peuvent lire le contenu.

## Aperçu

Le système de chiffrement utilise une approche multi-couches :

1. **Clés de lecture** : Les utilisateurs génèrent des paires de clés X25519 de manière déterministe à partir des signatures de portefeuille
2. **Chiffrement des publications** : Chaque publication reçoit une clé de chiffrement unique
3. **Distribution des clés** : La clé de la publication est chiffrée séparément pour chaque destinataire éligible
4. **Chiffrement du contenu** : Tout le contenu de la publication (texte, images, vidéos, audio) est chiffré avec la clé de la publication
5. **Déchiffrement en streaming** : Les médias chiffrés sont déchiffrés à la volée en utilisant des Service Workers

## Clés de lecture

### Qu'est-ce qu'une clé de lecture ?

Une clé de lecture est une paire de clés X25519 qui permet aux utilisateurs de recevoir et de déchiffrer les publications chiffrées. Elle se compose de :
- **Clé publique** : Publiée on-chain dans le contrat UserProfile (visible par tous)
- **Clé privée** : Dérivée de manière déterministe à partir de la signature du portefeuille de l'utilisateur (ne quitte jamais le navigateur)
- **Nonce** : Une valeur aléatoire utilisée pour la dérivation de clé (publiée on-chain)
- **Schéma** : L'identifiant du schéma de chiffrement (`x25519-xsalsa20-poly1305`)

### Processus de génération de clé

Les clés de lecture sont générées de manière déterministe à partir des signatures de portefeuille en suivant les étapes suivantes :

1. **Générer un nonce aléatoire**
   ```javascript
   const nonce = crypto.getRandomValues(new Uint8Array(10));
   // Example: "a1b2c3d4e5f6g7h8i9j0"
   ```

2. **Créer des EIP-712 Typed Data**
   ```javascript
   const typedData = {
     types: {
       EIP712Domain: [
         { name: "name", type: "string" },
         { name: "version", type: "string" }
       ],
       ReadingKey: [
         { name: "context", type: "string" },
         { name: "scheme", type: "string" },
         { name: "nonce", type: "string" }
       ]
     },
     primaryType: "ReadingKey",
     domain: {
       name: "SAVVA",
       version: "1"
     },
     message: {
       context: "SAVVA Reading Key",
       scheme: "x25519-xsalsa20-poly1305",
       nonce: nonce
     }
   };
   ```

3. **Demander la signature au portefeuille**
   ```javascript
   const signature = await ethereum.request({
     method: "eth_signTypedData_v4",
     params: [userAddress, JSON.stringify(typedData)]
   });
   // Returns: 0x + 130 hex chars (r: 64, s: 64, v: 2)
   ```

4. **Extraire r||s de la signature**
   ```javascript
   // Ignore the recovery byte 'v', use only r and s
   const rsBytes = signature.slice(2, 130); // 128 hex chars = 64 bytes
   ```

5. **Dériver la seed avec HKDF-SHA256**
   ```javascript
   const salt = "SAVVA Reading Key:salt";
   const info = `SAVVA Reading Key:x25519-xsalsa20-poly1305:${nonce}`;
   const seed = hkdf(sha256, rsBytes, salt, info, 32);
   ```

6. **Générer la paire de clés X25519**
   ```javascript
   const secretKey = seed; // 32 bytes (clamped by x25519 library)
   const publicKey = x25519.getPublicKey(secretKey);
   ```

7. **Publier les informations publiques**
   ```javascript
   // Store in UserProfile contract:
   - reading_public_key: hex string (64 chars)
   - reading_key_scheme: "x25519-xsalsa20-poly1305"
   - reading_key_nonce: hex string (20 chars)
   ```

**Implémentation** : [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js)

### Avantages de la dérivation de clé

L'approche de dérivation déterministe présente plusieurs avantages :

- ✅ **Reproductible** : Même nonce + signature produisent toujours la même paire de clés
- ✅ **Pas de stockage requis** : La clé secrète peut être re-dérivée lorsque nécessaire
- ✅ **Contrôle utilisateur** : Les utilisateurs peuvent choisir de stocker la clé dans le localStorage du navigateur
- ✅ **Rotation des clés** : Générer de nouvelles clés avec des nonces différents
- ✅ **Multi-appareils** : Même clé sur n'importe quel appareil avec le même portefeuille

### Stockage des clés de lecture (optionnel)

Les utilisateurs peuvent optionnellement stocker leur clé secrète de lecture dans le localStorage du navigateur pour éviter de devoir re-signer à chaque consultation de contenu chiffré.

**Format de stockage** :
```javascript
localStorage["savva_reading_keys"] = {
  "0xUserAddress": [
    {
      nonce: "a1b2c3d4e5f6g7h8i9j0",
      secretKey: "hex64chars...",
      publicKey: "hex64chars...",
      timestamp: 1234567890
    }
    // Multiple keys for key rotation
  ]
}
```

**Implémentation** : [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js)

### Publication des clés de lecture

Pour publier des posts chiffrés ou recevoir du contenu chiffré, les utilisateurs doivent publier leur clé publique de lecture sur la blockchain :

```javascript
// User flow:
1. Generate reading key (signs EIP-712 message)
2. Publish to UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce
3. Transaction confirmed on-chain
4. Public key now discoverable by content creators
```

La clé publique est stockée dans le contrat intelligent **UserProfile** et associée à l'adresse et au domaine de l'utilisateur.

## Création de publications chiffrées

### Quand les publications sont chiffrées

Les publications sont chiffrées dans les scénarios suivants :

1. **Publications réservées aux abonnés** : Le créateur sélectionne l'audience "Subscribers Only"
2. **Commentaires sur des publications chiffrées** : Les commentaires héritent du chiffrement de la publication parente

### Processus de chiffrement d'une publication

#### Étape 1 : Générer la clé de chiffrement de la publication

Chaque publication chiffrée reçoit une paire de clés X25519 unique :

```javascript
const postKey = {
  secretKey: randomBytes(32),  // Random secret key
  publicKey: x25519.getPublicKey(secretKey)
};
```

Cette clé est utilisée pour chiffrer tout le contenu de cette publication spécifique.

**Implémentation** : [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:23-31)

#### Étape 2 : Déterminer les destinataires

Le système construit une liste de destinataires qui pourront déchiffrer la publication.

##### Pour les publications régulières réservées aux abonnés :

1. **Récupérer les abonnés éligibles**
   ```javascript
   // Query backend for users who:
   - Have active subscriptions (weeks > 0)
   - Meet minimum payment threshold
   - To the ACTOR (the account posting - could be user or NPO)
   ```

2. **Récupérer les clés de lecture**
   ```javascript
   // For each subscriber, fetch from UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce

   // Skip subscribers without reading keys
   ```

3. **Ajouter l'utilisateur autorisé**
   ```javascript
   // Ensure the wallet owner can decrypt their own post
   if (!recipients.includes(authorizedUser)) {
     recipients.push(authorizedUser);
   }
   ```

4. **Ajouter les Big Brothers** (modérateurs de domaine)
   ```javascript
   // Fetch from domain configuration
   const bigBrothers = domain.big_brothers || [];

   // Add each big_brother to recipients if they have reading keys
   for (const address of bigBrothers) {
     const readingKey = await fetchReadingKey(address);
     if (readingKey) {
       recipients.push(address);
     }
   }
   ```

**Implémentation** : [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js)

##### Pour les commentaires sur des publications chiffrées :

```javascript
// Use the same recipients as the parent post
const parentEncryption = await fetchParentPostEncryption(parentCid);
const recipients = parentEncryption.recipients;

// Ensure commenter and big_brothers are included
```

**Implémentation** : [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:214-259)

#### Étape 3 : Chiffrer le contenu de la publication

Le contenu de la publication est chiffré avec la clé secrète de la publication. **Remarque** : le titre reste non chiffré pour permettre l'affichage dans les cartes de publication, tandis que le texte de prévisualisation et le contenu sont chiffrés :

```javascript
// For each locale:
{
  title: title,  // NOT encrypted - remains public for display
  text_preview: encryptText(preview, postSecretKey),
  categories: categories,  // NOT encrypted - public for indexing
  tags: tags  // NOT encrypted - public for indexing
}
```

Ce qui est chiffré :
- ✅ Texte de prévisualisation (`text_preview`)
- ✅ Titres de chapitres
- ✅ Tous les fichiers de contenu (markdown, médias)

Ce qui reste public :
- ❌ Titre de la publication
- ❌ Catégories
- ❌ Tags

Format de chiffrement : `nonce:ciphertext` (les deux encodés en hex)

Algorithme : XSalsa20-Poly1305 (chiffrement authentifié)

#### Étape 4 : Chiffrer la clé de la publication pour chaque destinataire

Pour chaque destinataire, chiffrer la clé secrète de la publication en utilisant leur clé publique de lecture :

```javascript
for (const recipient of recipients) {
  // Generate ephemeral keypair for this recipient
  const ephemeralKey = x25519.utils.randomPrivateKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralKey);

  // Compute shared secret using ECDH
  const sharedSecret = x25519.getSharedSecret(
    ephemeralKey,
    recipient.publicKey
  );

  // Encrypt post secret key with shared secret
  const nonce = randomBytes(24);
  const cipher = xsalsa20poly1305(sharedSecret, nonce);
  const encryptedKey = cipher.encrypt(postSecretKey);

  // Store for this recipient
  encryption.keys.push({
    address: recipient.address,
    encrypted_key: bytesToHex(encryptedKey),
    ephemeral_public_key: bytesToHex(ephemeralPublicKey),
    nonce: bytesToHex(nonce)
  });
}
```

Cela utilise la construction **X25519 + XSalsa20-Poly1305** (similaire à `crypto_box` de NaCl).

**Implémentation** : [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:97-122)

#### Étape 5 : Chiffrer les fichiers (images, vidéos, audio)

Tous les fichiers téléchargés sont chiffrés avant d'être envoyés à IPFS :

##### Petits fichiers (< 1 Mo)
```javascript
// Simple encryption: nonce + encrypted data
const nonce = randomBytes(24);
const cipher = xsalsa20poly1305(postSecretKey, nonce);
const encrypted = cipher.encrypt(fileData);

const encryptedFile = new Uint8Array(24 + encrypted.length);
encryptedFile.set(nonce, 0);
encryptedFile.set(encrypted, 24);
```

##### Grands fichiers (≥ 1 Mo)
```javascript
// Chunked encryption for streaming (256 KB chunks)
// Header format:
{
  magic: "SAVVA_EC",
  version: 1,
  chunkSize: 262144,  // 256 KB
  totalChunks: n,
  originalSize: bytes
}

// Each chunk independently encrypted:
for each chunk {
  nonce = randomBytes(24);
  cipher = xsalsa20poly1305(postSecretKey, nonce);
  encryptedChunk = nonce + cipher.encrypt(chunk);
}
```

Cela permet le **déchiffrement en streaming** — les vidéos peuvent commencer à être lues avant que le fichier entier soit déchiffré.

**Implémentation** : [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js), [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js)

#### Étape 6 : Construire les métadonnées de chiffrement

Le descripteur inclut les métadonnées de chiffrement :

```yaml
savva_spec_version: "2.0"
data_cid: QmXXX...
encrypted: true
locales:
  en:
    title: "My Post Title"  # NOT encrypted - public for display
    text_preview: "a1b2c3d4:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b..."
    tags:
      - "technology"  # NOT encrypted - public for indexing
      - "tutorial"
    categories:
      - "programming"  # NOT encrypted - public for indexing
    data_path: en/data.md
    chapters:
      - title: "nonce4:encrypted_chapter_title"
        data_path: en/chapters/1.md

encryption:
  type: "x25519-xsalsa20-poly1305"
  reading_key_nonce: "abc123..."  # Publisher's reading key nonce
  reading_public_key: "def456..." # Publisher's reading public key
  keys:
    - address: "0xSubscriber1"
      encrypted_key: "789ghi..."
      ephemeral_public_key: "jkl012..."
      nonce: "mno345..."
    - address: "0xSubscriber2"
      encrypted_key: "678pqr..."
      ephemeral_public_key: "stu901..."
      nonce: "vwx234..."
    # ... one entry per recipient
```

**Implémentation** : [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:167-211)

## Big Brothers (modérateurs de domaine)

Les Big Brothers sont des adresses spéciales configurées au niveau du domaine qui obtiennent automatiquement l'accès à **toutes les publications chiffrées** de ce domaine. Cela permet la modération de contenu tout en maintenant le chiffrement de bout en bout.

### Configuration

Les Big Brothers sont configurés dans le fichier `config.json` :

```javascript
{
  "domains": [
    {
      "name": "example.com",
      "big_brothers": [
        "0x1234567890123456789012345678901234567890",
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      ]
      // ...
    }
  ]
}
```

### Comment fonctionnent les Big Brothers

1. **Inclusion automatique** : Lors de la création d'une publication chiffrée, le système :
   - Récupère `big_brothers` depuis la configuration du domaine
   - Récupère les clés de lecture pour chaque big brother
   - Les ajoute à la liste des destinataires
   - Chiffre la clé de publication pour chaque big brother

2. **Déduplication** : Si un big brother est déjà abonné, il n'est pas dupliqué

3. **Tolérance aux échecs** : Si un big brother n'a pas de clé de lecture, il est ignoré (consigné dans les logs mais cela n'empêche pas la publication)

**Implémentation** : [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:280-322)

### Cas d'utilisation

- **Modération de contenu** : Examiner les publications chiffrées pour violations de politique
- **Support client** : Aider les utilisateurs pour des problèmes liés au contenu chiffré
- **Conformité légale** : Accès par les forces de l'ordre avec autorisation appropriée
- **Accès de sauvegarde** : Propriétaires de domaine maintenant l'accès au contenu

## Déchiffrement des publications

### Flux de déchiffrement automatique

Quand un utilisateur consulte une publication chiffrée :

1. **Vérifier le chiffrement de la publication**
   ```javascript
   if (post.content.encrypted && !post._decrypted) {
     // Post is encrypted and not yet decrypted
   }
   ```

2. **Vérifier l'éligibilité de l'utilisateur**
   ```javascript
   const canDecrypt = encryption.keys.some(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );
   ```

3. **Obtenir la clé secrète de lecture**
   ```javascript
   // Option 1: Retrieve from localStorage
   const storedKey = findStoredSecretKey(userAddress, nonce);

   // Option 2: Re-derive from wallet signature
   if (!storedKey) {
     const signature = await signReadingKeyMessage(userAddress, nonce);
     const secretKey = deriveKeyFromSignature(signature, nonce);
   }
   ```

4. **Déchiffrer la clé secrète de la publication**
   ```javascript
   // Find encrypted key for this user
   const keyEntry = encryption.keys.find(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );

   // Compute shared secret using ECDH
   const sharedSecret = x25519.getSharedSecret(
     userSecretKey,
     keyEntry.ephemeral_public_key
   );

   // Decrypt the post secret key
   const cipher = xsalsa20poly1305(sharedSecret, keyEntry.nonce);
   const postSecretKey = cipher.decrypt(keyEntry.encrypted_key);
   ```

5. **Déchiffrer les métadonnées**
   ```javascript
   // Decrypt preview text (title, tags, and categories are public)
   post.text_preview = decryptText(post.text_preview, postSecretKey);
   // Title, tags, and categories remain as-is (not encrypted)
   ```

6. **Définir le contexte de chiffrement**
   ```javascript
   // For automatic media decryption
   setEncryptedPostContext({ dataCid, postSecretKey });
   swManager.setEncryptionContext(dataCid, postSecretKey);
   ```

7. **Déchiffrer les médias à la volée**
   ```javascript
   // Service Worker intercepts all IPFS requests
   // For URLs matching dataCid:
   - Fetch encrypted file
   - Detect encryption format (simple or chunked)
   - Decrypt chunks as needed
   - Stream decrypted bytes to browser

   // Result: videos play immediately, seeking works
   ```

**Implémentation** : [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js), [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx:263-291)

### Déchiffrement des médias en streaming

Les fichiers médias chiffrés (vidéos, audio) sont déchiffrés à la volée en utilisant des Service Workers :

```javascript
// Service Worker intercepts fetch
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.includes(dataCid)) {
    // This is an encrypted resource
    event.respondWith(streamDecrypt(event.request));
  }
});

async function streamDecrypt(request) {
  // Fetch encrypted file
  const response = await fetch(request);
  const encrypted = await response.arrayBuffer();

  // Check format
  if (isChunkedFormat(encrypted)) {
    // Decrypt specific chunks for Range request
    const range = parseRangeHeader(request.headers.get('range'));
    const chunks = getChunksForRange(range);

    // Decrypt only needed chunks
    const decrypted = chunks.map(i => decryptChunk(encrypted, i));

    return new Response(decrypted, {
      status: 206,
      headers: { 'Content-Range': ... }
    });
  } else {
    // Decrypt entire file
    const decrypted = decryptSimple(encrypted);
    return new Response(decrypted);
  }
}
```

Voir [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) pour la documentation détaillée sur le système de chiffrement en streaming.

## Considérations de sécurité

### Algorithmes de chiffrement

- **X25519** : Diffie-Hellman sur courbe elliptique (sécurité 256 bits)
- **XSalsa20-Poly1305** : Chiffrement authentifié (AEAD)
- **HKDF-SHA256** : Fonction de dérivation de clés
- **EIP-712** : Signature de données structurées

### Gestion des clés

✅ **Sécurisé** :
- Les clés privées ne quittent jamais le navigateur
- Les clés sont dérivées de manière déterministe à partir des signatures du portefeuille
- Le Service Worker s'exécute sous la même origine
- Les contextes de chiffrement ont un TTL (30 minutes)
- Les clés sont effacées lors de la navigation hors page

⚠️ **Limitations** :
- Vulnérable aux attaques XSS (clés en mémoire)
- Les extensions de navigateur avec accès total peuvent voler les clés
- Pas de protection contre l'accès physique à l'appareil
- Les passerelles IPFS voient les données chiffrées (mais ne peuvent pas les déchiffrer)

### Modèle de menace

**Protégé contre** :
- ✅ Reniflage par les passerelles IPFS
- ✅ Attaques de type "man-in-the-middle" (HTTPS + AEAD)
- ✅ Altération des données (authentification Poly1305)
- ✅ Attaques par rejeu (nonces uniques par message)

**Non protégé contre** :
- ❌ Extensions de navigateur malveillantes
- ❌ Vulnérabilités XSS dans l'application
- ❌ Appareils utilisateurs compromis
- ❌ Utilisateurs partageant leurs clés secrètes

### Bonnes pratiques

1. **Toujours utiliser HTTPS** en production
2. **Stocker les clés en toute sécurité** - localStorage est optionnel, pas requis
3. **Effacer les contextes** lors de la navigation
4. **Valider les destinataires** avant de chiffrer
5. **Utiliser des mots de passe forts** pour la sauvegarde du portefeuille
6. **Auditer régulièrement les Big Brothers**
7. **Surveiller les journaux d'accès** pour détecter des activités suspectes

## Fichiers d'implémentation

### Chiffrement principal
- [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js) - Génération et gestion des clés de lecture
- [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js) - Stockage navigateur pour les clés de lecture
- [`src/x/crypto/readingKeyEncryption.js`](../../../../src/x/crypto/readingKeyEncryption.js) - X25519 + XSalsa20-Poly1305 encryption
- [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js) - Chiffrement du contenu des publications
- [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js) - Déchiffrement du contenu des publications
- [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js) - Chiffrement des fichiers (simple + chunked)
- [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js) - Chiffrement en chunks pour les gros fichiers

### Gestion des destinataires
- [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js) - Récupérer les abonnés avec clés de lecture
- [`src/x/crypto/fetchParentPostEncryption.js`](../../../../src/x/crypto/fetchParentPostEncryption.js) - Obtenir les destinataires de la publication parente

### Flux de publication
- [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx) - Création du descripteur avec chiffrement
- [`src/x/editor/wizard_steps/StepUploadIPFS.jsx`](../../../../src/x/editor/wizard_steps/StepUploadIPFS.jsx) - Chiffrement des fichiers avant upload

### Flux de consultation
- [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx) - Consultation des publications avec déchiffrement automatique
- [`src/ipfs/encryptedFetch.js`](../../../../src/ipfs/encryptedFetch.js) - Récupération IPFS avec déchiffrement

### Déchiffrement en streaming
- [`src/x/crypto/serviceWorkerManager.js`](../../../../src/x/crypto/serviceWorkerManager.js) - Gestion du Service Worker
- [`public/crypto-sw.js`](../../../../public/crypto-sw.js) - Service Worker pour le déchiffrement en streaming
- [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) - Docs détaillées sur le chiffrement en streaming

## Flux d'expérience utilisateur

### Pour les créateurs de contenu

1. **Première configuration**
   - Générer une clé de lecture (signer un message EIP-712)
   - Publier sur la blockchain
   - Optionnel : stocker dans le navigateur

2. **Publier une publication chiffrée**
   - Rédiger le contenu dans l'éditeur
   - Sélectionner l'audience "Subscribers Only"
   - Le système fait automatiquement :
     - Récupère les abonnés éligibles
     - Génére la clé de chiffrement de la publication
     - Chiffre le contenu
     - Chiffre les fichiers
     - Upload sur IPFS
     - Publie le descripteur sur la blockchain

3. **Consulter ses propres publications chiffrées**
   - Déchiffrement automatique en utilisant la clé stockée ou re-dérivée
   - Les médias sont lus de façon fluide grâce au streaming

### Pour les abonnés

1. **Première configuration**
   - Générer une clé de lecture
   - Publier sur la blockchain
   - S'abonner au créateur

2. **Consulter des publications chiffrées**
   - Ouvrir la publication chiffrée
   - Le système vérifie l'éligibilité
   - Récupère ou re-dérive la clé secrète
   - Déchiffre la publication automatiquement
   - Les médias sont lus avec déchiffrement en streaming

3. **Options de stockage des clés**
   - Stocker dans le navigateur : pas de re-signature nécessaire
   - Ne pas stocker : signer le message à chaque fois (plus sécurisé)

### Pour les Big Brothers (modérateurs)

1. **Configuration**
   - Générer une clé de lecture
   - L'administrateur de domaine ajoute l'adresse à la liste `big_brothers`
   - Inclus automatiquement dans toutes les publications chiffrées

2. **Modération**
   - Accéder à tout le contenu chiffré du domaine
   - Examiner pour violations de politique
   - Prendre les mesures appropriées

## Dépannage

### "No Reading Key Found"
- L'utilisateur n'a pas encore généré de clé de lecture
- Inviter à générer et publier la clé

### "Failed to Decrypt Post"
- La clé de lecture de l'utilisateur n'est pas dans la liste des destinataires
- Vérifier le statut d'abonnement
- Vérifier la configuration des big_brothers

### "Media Not Playing"
- Le Service Worker n'est pas enregistré (requiert HTTPS)
- Le contexte de chiffrement n'est pas défini
- Vérifier la console du navigateur pour les erreurs

### "No Eligible Subscribers"
- Aucun abonné n'a publié de clés de lecture
- Informer les abonnés de générer des clés de lecture
- Vérifier le seuil de paiement minimum

## Améliorations futures

- **Rotation des clés** : Support pour plusieurs clés de lecture actives par utilisateur
- **Sauvegarde & récupération** : Sauvegarde chiffrée des clés avec phrase de récupération
- **Portefeuilles matériels** : Dérivation de clé de lecture avec Ledger/Trezor
- **Partage sélectif** : Accès temporaire pour des publications spécifiques
- **Analytique** : Metrics préservant la confidentialité pour le contenu chiffré
- **Support WebAuthn** : Clés de lecture dérivées des identifiants WebAuthn

## Documentation associée

- [Publishing Posts](/docs/core-concepts/publishing-posts) - Flux général de publication
- [Showing Posts](/docs/core-concepts/showing-posts) - Affichage et rendu des publications
- [User Profile](/docs/core-concepts/user-profile) - Contrat de profil et données utilisateur
- [Streaming Encryption](../../../../STREAMING_ENCRYPTION.md) - Docs détaillées sur le déchiffrement en streaming (source)
- [Content Format](/docs/features/content-format) - Spécification du format du descripteur