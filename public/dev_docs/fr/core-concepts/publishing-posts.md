# Publication d'un article

Publier du contenu sur la plateforme SAVVA est un processus en trois étapes qui garantit l'intégrité des données, la décentralisation et la vérification on-chain. Le flux consiste à préparer les données de la publication localement, à téléverser le contenu et son descripteur sur IPFS, puis enfin à enregistrer la publication sur la blockchain via un appel de smart contract.

L'éditeur frontend automatise ce processus via un assistant, mais comprendre les étapes sous-jacentes est essentiel pour les développeurs.

---

## Étape 1 : Préparer les données de la publication

Avant tout téléversement ou transaction, l'éditeur organise la publication dans une structure de répertoires standardisée. Cette structure est gérée localement à l'aide de l'API du système de fichiers (File System API).

Les composants principaux sont :

* Un fichier de paramètres (`params.json`) pour les réglages spécifiques à l'éditeur.
* Un fichier descripteur (`info.yaml`) qui définit la structure et les métadonnées de la publication pour IPFS.
* Des fichiers Markdown pour le contenu de chaque langue.
* Un répertoire `uploads/` pour tout média associé (images, vidéos, etc.).

### Exemple `params.json`

Ce fichier contient les paramètres utilisés par l'interface de l'éditeur et n'est pas publié sur la blockchain.

```json
{
  "guid": "c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a",
  "nsfw": false,
  "fundraiser": 0,
  "publishAsNewPost": true,
  "audience": "subscribers",
  "minWeeklyPaymentWei": "1000000000000000000000",
  "allowPurchase": true,
  "purchasePriceWei": "99000000000000000000",
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

**Paramètres d'audience et de contrôle d'accès :**

* **audience** : Soit `"public"` (par défaut) soit `"subscribers"` pour les publications réservées aux abonnés.
* **minWeeklyPaymentWei** : Paiement minimal hebdomadaire requis pour accéder à la publication (en wei, sous forme de chaîne).
* **allowPurchase** : Si `true`, permet l'accès par achat unique pour les non-abonnés.
* **purchasePriceWei** : Prix pour l'accès par achat unique en tokens SAVVA (en wei, sous forme de chaîne).

---

## Étape 2 : Le descripteur de la publication (`info.yaml`)

Ce fichier est la définition canonique de la publication et est téléversé sur IPFS. Il relie toutes les pièces de contenu entre elles et contient les informations de contrôle d'accès et de chiffrement.

### Descripteur pour publication publique

```yaml
savva_spec_version: "2.0"
data_cid: bafybeih...
guid: c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a
recipient_list_type: public
gateways:
  - https://ipfs.io/
locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    tags: []
    categories: []
    data_path: "en/data.md"
    chapters:
      - data_path: "en/chapters/1.md"
      - data_path: "en/chapters/2.md"
```

### Descripteur pour publication réservée aux abonnés (chiffré)

```yaml
savva_spec_version: "2.0"
data_cid: QmaHRmTymgC9unG14rHJpwfv6DWFgzuJjVhtjHcY8cCjkS
guid: 249c62bd-54f7-4865-bc83-922d21ed90a6
recipient_list_type: subscribers
recipient_list_min_weekly: "1000000000000000000000"
gateways:
  - https://savva.myfilebase.com/ipfs/
  - https://test.savva.app/api/ipfs/
locales:
  en:
    title: "Premium Content Title"
    text_preview: "0ee338af352029c34bfc65ab2d39bcb4622a08206a247f8e:f3f352e0df63aaac..."
    tags: []
    categories: []
    data_path: en/data.md
    chapters: []
encryption:
  type: x25519-xsalsa20-poly1305
  key_exchange_alg: x25519
  key_exchange_pub_key: cb8711e46877d7775a55d6ae446d445b500ce77f6a5514999d275280eceb707e
  access_type: for_subscribers_only
  min_weekly_pay: "1000000000000000000000"
  allow_purchase: true
  purchase_price: "99000000000000000000"
  processor_address: "0xC0959416606AEd87B09f6B205BbAD2e0cA0A9f48"
  purchase_token: "0x99eadb13da88952c18f980bd6b910adba770130e"
  recipients:
    "0xe328b70d1db5c556234cade0df86b3afbf56dd32":
      pass: f3a7cc9fe83091b562273e5395d0ad1dca3ef0f9f06cfd22bee0180a39c8541c...
      pass_nonce: d326da17dfcc6e333fc036732954370407f66df0f1141518
      pass_ephemeral_pub_key: cca725f1a50a2614cf019115f7c7ac45d1bda916813dc038055b14409c5d5e59
      reading_public_key: 1f61298e54fd3da75192f509002fc7d9e10b019b55d1806e75c7efa836836418
      reading_key_scheme: x25519-xsalsa20-poly1305
      reading_key_nonce: 18d1609e898d5e252604
```

### Référence des champs du descripteur

**Champs au niveau racine :**

| Field | Description |
|-------|-------------|
| `savva_spec_version` | Version du schéma, actuellement `"2.0"` |
| `data_cid` | CID IPFS du répertoire contenant tous les fichiers de contenu |
| `guid` | Identifiant unique de la publication |
| `recipient_list_type` | Type d'accès : `"public"` ou `"subscribers"` |
| `recipient_list_min_weekly` | Paiement hebdomadaire minimum requis en wei (chaîne) |
| `gateways` | Liste des gateways IPFS préférées pour la récupération du contenu |
| `locales` | Métadonnées du contenu spécifiques à chaque langue |
| `encryption` | Bloc de chiffrement (uniquement pour les publications réservées aux abonnés) |

**Champs des locales :**

| Field | Description |
|-------|-------------|
| `title` | Titre de la publication (toujours en clair pour l'affichage) |
| `text_preview` | Texte d'aperçu (chiffré sous la forme `nonce:ciphertext` pour les publications réservées aux abonnés) |
| `tags` | Tableau de tags (toujours en clair pour l'indexation) |
| `categories` | Tableau de catégories (toujours en clair pour l'indexation) |
| `data_path` | Chemin relatif vers le fichier de contenu principal |
| `chapters` | Tableau d'objets chapitre contenant `data_path` et éventuellement `title` |

**Champs du bloc de chiffrement :**

| Field | Description |
|-------|-------------|
| `type` | Schéma de chiffrement : `x25519-xsalsa20-poly1305` |
| `key_exchange_alg` | Algorithme d'échange de clés : `x25519` |
| `key_exchange_pub_key` | Clé publique X25519 de la publication (hex) |
| `access_type` | Restriction d'accès : `for_subscribers_only` |
| `min_weekly_pay` | Montant hebdomadaire minimum requis en wei (chaîne) |
| `allow_purchase` | Indique si l'achat ponctuel est activé |
| `purchase_price` | Prix d'achat en wei (chaîne) |
| `processor_address` | Adresse du processeur de paiement pour la vérification des achats |
| `purchase_token` | Adresse du contrat du token pour les paiements d'achat (SAVVA) |
| `recipients` | Map des adresses des destinataires vers leurs clés de publication chiffrées |

**Champs d'une entrée destinataire :**

| Field | Description |
|-------|-------------|
| `pass` | Clé secrète de la publication chiffrée (hex) |
| `pass_nonce` | Nonce utilisé pour le chiffrement (hex) |
| `pass_ephemeral_pub_key` | Clé publique éphémère pour ECDH (hex) |
| `reading_public_key` | Clé publique de lecture du destinataire (hex) |
| `reading_key_scheme` | Schéma de chiffrement pour la clé de lecture |
| `reading_key_nonce` | Nonce associé à la clé de lecture |

---

## Flux de chiffrement pour les publications réservées aux abonnés

Lors de la création d'une publication réservée aux abonnés :

1. Générer la clé de la publication : une paire de clés X25519 aléatoire est générée pour la publication.
2. Chiffrer le contenu : le corps de la publication et les fichiers de chapitres sont chiffrés en utilisant XSalsa20-Poly1305 avec la clé secrète de la publication.
3. Chiffrer les aperçus : le champ `text_preview` est chiffré et stocké sous la forme `nonce:ciphertext`.
4. Construire la liste des destinataires : la clé de publication est chiffrée pour chaque destinataire éligible en utilisant leur clé de lecture publiée via un échange de clés ECDH.
5. Inclure les destinataires requis :
   - L'auteur de la publication (peut toujours déchiffrer son propre contenu)
   - Tous les big_brothers configurés pour le domaine
   - Le processeur de paiement (si l'accès par achat est activé)
   - Les abonnés éligibles répondant au montant de paiement minimal requis

---

## Étape 3 : Téléverser sur IPFS

Le processus de téléversement se déroule en deux phases distinctes, gérées par l'API de stockage du backend.

1. Téléverser le répertoire de contenu : tous les fichiers de contenu (par ex. `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) sont téléversés en tant que répertoire unique sur IPFS. Pour les publications chiffrées, ces fichiers sont chiffrés avant le téléversement. Le backend renvoie un unique CID IPFS pour ce répertoire, qui devient le `data_cid`.
2. Téléverser le descripteur : le fichier `info.yaml` est généré avec le `data_cid` de l'étape précédente. Ce fichier YAML est ensuite téléversé sur IPFS en tant que fichier autonome. Le CID de ce fichier `info.yaml` est le pointeur IPFS final pour la publication.

---

## Étape 4 : Enregistrer sur la blockchain

L'étape finale consiste à enregistrer la publication sur la blockchain en appelant la fonction `reg` du smart contract `ContentRegistry`.

Le frontend exécute cette transaction avec les paramètres suivants :

* **domain** : Le nom de domaine courant (par ex. `savva.app`).
* **author** : L'adresse du portefeuille de l'utilisateur.
* **guid** : L'identifiant unique provenant de `params.json`.
* **ipfs** : Le CID IPFS du fichier descripteur `info.yaml` obtenu à l'étape 3.
* **content\_type** : Une chaîne `bytes32`, typiquement `post` pour un nouveau contenu ou `post-edit` pour des mises à jour.

### Exemple d'appel au contrat

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

Une fois la transaction minée avec succès, la publication est officielle et apparaîtra dans les flux de contenu.