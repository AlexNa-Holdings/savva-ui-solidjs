# Publication d’un post

La publication de contenu sur la plateforme SAVVA est un processus en trois étapes qui garantit l'intégrité des données, la décentralisation et la vérification sur la blockchain. Le flux implique la préparation des données du post en local, le téléchargement du contenu et de son descripteur sur IPFS, puis l'enregistrement final du post sur la blockchain via un appel à un contrat intelligent.

L'éditeur côté client automatise ce processus via un assistant, mais comprendre les étapes sous-jacentes est crucial pour les développeurs.

---

## Étape 1 : Préparer les données du post

Avant tout téléchargement ou transaction, l'éditeur organise le post dans une structure de répertoires standardisée. Cette structure est gérée localement en utilisant l'API File System.

Les composants principaux sont :

* Un fichier de paramètres (`params.json`) pour les réglages spécifiques à l’éditeur.
* Un fichier descripteur (`info.yaml`) qui définit la structure et les métadonnées du post pour IPFS.
* Des fichiers Markdown pour le contenu de chaque langue.
* Un répertoire `uploads/` pour tout média associé (images, vidéos, etc.).

### Exemple `params.json`

Ce fichier contient les réglages utilisés par l'interface de l'éditeur et n'est pas publié sur la blockchain.

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

### Exemple `info.yaml` (Le descripteur du post)

Ce fichier est la définition canonique du post et est téléchargé sur IPFS. Il relie toutes les pièces de contenu entre elles.

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

* **data\_cid** : Le CID IPFS du répertoire contenant tous les contenus Markdown et les fichiers téléchargés.
* **locales** : Contient les métadonnées spécifiques à chaque langue. Le `title` et le `text_preview` de l'éditeur y sont stockés.
* **data\_path / chapters.data\_path** : Chemins relatifs vers les fichiers de contenu à l'intérieur du répertoire `data_cid`.

---

## Étape 2 : Télécharger sur IPFS

Le processus de téléchargement se déroule en deux phases distinctes, gérées par l'API de stockage du backend.

1. **Télécharger le répertoire de contenu** : Tous les fichiers de contenu (par ex. `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) sont téléchargés comme un seul répertoire sur IPFS. Le backend renvoie un seul CID IPFS pour ce répertoire, qui devient le `data_cid`.
2. **Télécharger le descripteur** : Le fichier `info.yaml` est généré avec le `data_cid` obtenu à l'étape précédente. Ce fichier YAML est ensuite téléchargé sur IPFS en tant que fichier autonome. Le CID de ce fichier `info.yaml` est le pointeur IPFS final pour le post.

---

## Étape 3 : Enregistrer sur la blockchain

L'étape finale consiste à enregistrer le post sur la blockchain en appelant la fonction `reg` du contrat intelligent `ContentRegistry`.

Le frontend exécute cette transaction avec les paramètres suivants :

* **domain** : Le nom de domaine actuel (par ex. `savva.app`).
* **author** : L'adresse du portefeuille de l'utilisateur.
* **guid** : L'identifiant unique issu de `params.json`.
* **ipfs** : Le CID IPFS du fichier descripteur `info.yaml` obtenu à l'Étape 2.
* **content\_type** : Une chaîne `bytes32`, typiquement `post` pour un nouveau contenu ou `post-edit` pour des mises à jour.

### Exemple d'appel de contrat

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

Une fois la transaction minée avec succès, le post est officiellement publié et apparaîtra dans les flux de contenu.