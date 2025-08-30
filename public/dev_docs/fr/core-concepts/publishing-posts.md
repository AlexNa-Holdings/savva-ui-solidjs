# Publication d'un Post

La publication de contenu sur la plateforme SAVVA est un processus en trois étapes qui garantit l'intégrité des données, la décentralisation et la vérification sur la chaîne. Le flux implique la préparation des données du post localement, le téléchargement du contenu et de son descripteur sur IPFS, et enfin l'enregistrement du post sur la blockchain via un appel de contrat intelligent.

L'éditeur frontend automatise ce processus à travers un assistant, mais comprendre les étapes sous-jacentes est crucial pour les développeurs.

---

## Étape 1 : Préparer les Données du Post

Avant qu'un téléchargement ou une transaction n'ait lieu, l'éditeur organise le post dans une structure de répertoire standardisée. Cette structure est gérée localement à l'aide de l'API File System.

Les principaux composants sont :

* Un fichier de paramètres (`params.json`) pour les paramètres spécifiques à l'éditeur.
* Un fichier de descripteur (`info.yaml`) qui définit la structure et les métadonnées du post pour IPFS.
* Des fichiers Markdown pour le contenu de chaque langue.
* Un répertoire `uploads/` pour tous les fichiers multimédias associés (images, vidéos, etc.).

### Exemple de `params.json`

Ce fichier contient les paramètres utilisés par l'interface utilisateur de l'éditeur et n'est pas publié sur la chaîne.

```json
{
  "guid": "c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a",
  "nsfw": false,
  "fundraiser": 0,
  "publishAsNewPost": true,
  "locales": {
    "en": {
      "tags": ["décentralisation", "social"],
      "categories": ["Technologie"],
      "chapters": [
        { "title": "Qu'est-ce qu'une Blockchain ?" },
        { "title": "IPFS et l'Adressage de Contenu" }
      ]
    }
  },
  "thumbnail": "uploads/thumbnail.png"
}
```

### Exemple de `info.yaml` (Le Descripteur du Post)

Ce fichier est la définition canonique du post et est téléchargé sur IPFS. Il relie tous les éléments de contenu ensemble.

```yaml
savva_spec_version: "2.0"
data_cid: bafybeih...
gateways:
  - https://ipfs.io/
locales:
  en:
    title: "Comprendre les Systèmes Décentralisés"
    text_preview: "Une plongée approfondie dans les concepts fondamentaux de la décentralisation..."
    data_path: "en/data.md"
    chapters:
      - data_path: "en/chapters/1.md"
      - data_path: "en/chapters/2.md"
```

* **data\_cid** : Le CID IPFS du répertoire contenant tout le contenu Markdown et les fichiers téléchargés.
* **locales** : Contient des métadonnées spécifiques à la langue. Le titre et le text\_preview de l'éditeur y sont stockés.
* **data\_path / chapters.data\_path** : Chemins relatifs vers les fichiers de contenu dans le répertoire `data_cid`.

---

## Étape 2 : Télécharger sur IPFS

Le processus de téléchargement se déroule en deux phases distinctes, gérées par l'API de stockage du backend.

1. **Télécharger le Répertoire de Contenu** : Tous les fichiers de contenu (par exemple, `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) sont téléchargés en tant que répertoire unique sur IPFS. Le backend renvoie un seul CID IPFS pour ce répertoire, qui devient le `data_cid`.
2. **Télécharger le Descripteur** : Le fichier `info.yaml` est généré avec le `data_cid` de l'étape précédente. Ce fichier YAML est ensuite téléchargé sur IPFS en tant que fichier autonome. Le CID de ce fichier `info.yaml` est le pointeur IPFS final pour le post.

---

## Étape 3 : Enregistrer sur la Blockchain

La dernière étape consiste à enregistrer le post sur la blockchain en appelant la fonction `reg` sur le contrat intelligent `ContentRegistry`.

Le frontend exécute cette transaction avec les paramètres suivants :

* **domain** : Le nom de domaine actuel (par exemple, `savva.app`).
* **author** : L'adresse du portefeuille de l'utilisateur.
* **guid** : L'identifiant unique du fichier `params.json`.
* **ipfs** : Le CID IPFS du fichier descripteur `info.yaml` de l'Étape 2.
* **content\_type** : Une chaîne `bytes32`, généralement `post` pour un nouveau contenu ou `post-edit` pour des mises à jour.

### Exemple d'Appel de Contrat

```javascript
// From: src/components/editor/wizard_steps/StepPublish.jsx

const contract = await getSavvaContract(app, "ContentRegistry", { write: true });

const hash = await contract.write.reg([
  domain,           // "savva.app"
  user.address,     // "0x123..."
  guid,             // "c4a7f6b9-..."
  descriptorCid,    // "bafybeif..."
  toHexBytes32("post")
]);

// L'interface utilisateur attend ensuite que la transaction soit confirmée
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

Une fois la transaction minée avec succès, le post est officiellement publié et apparaîtra dans les flux de contenu.