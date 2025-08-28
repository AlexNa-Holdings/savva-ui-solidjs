# Affichage des Publications

Afficher un post SAVVA est un processus en deux étapes.

1. Récupérer une liste d'objets de métadonnées de post depuis le backend SAVVA.
2. Utiliser les informations IPFS de ces métadonnées pour récupérer le contenu réel (titre, texte, images, etc.) depuis le réseau décentralisé.

---

## Étape 1 : Récupérer les Métadonnées des Posts depuis le Backend

La principale façon d'obtenir une liste de posts est via la méthode WebSocket **`content-list`**. Elle prend en charge la pagination, le tri et le filtrage.

### Appel de `content-list`

Vous appelez la méthode avec des paramètres spécifiant quel contenu vous avez besoin. Exemple :

```js
// Exemple d'appel utilisant l'assistant wsMethod de l'application
const posts = await app.wsMethod("content-list")({
  domain: "savva.app",      // Domaine pour récupérer les posts
  limit: 12,                // Nombre d'éléments par page
  offset: 0,                // Index de départ (pour la pagination)
  lang: "en",               // Langue préférée pour les métadonnées
  order_by: "fund_amount",  // Trier par le montant total des fonds reçus
  content_type: "post",     // Nous voulons uniquement des posts
  category: "en:SAVVA Talk" // Optionnel : filtrer par catégorie
});
```

---

## La Structure de l'Objet Post

La méthode `content-list` retourne un tableau d'**objets de post**. Chacun contient des métadonnées et des pointeurs nécessaires pour récupérer le contenu complet.

Exemple :

```json
{
  "author": {
    "address": "0x1234...",
    "avatar": "Qm...",
    "name": "alexna",
    "display_name": "Alex Na",
    "staked": "5000000000000000000000"
  },
  "category": "en:SAVVA Talk",
  "domain": "savva.app",
  "effective_time": "2025-08-20T10:30:00Z",
  "fund": {
    "amount": "125000000000000000000",
    "round_time": 1672531200,
    "total_author_share": "100000000000000000000"
  },
  "ipfs": "bafybeig.../info.yaml",
  "reactions": [10, 2, 0, 1],
  "savva_cid": "0x01701...cfa2",
  "short_cid": "aBcDeF1",
  "tags": ["décentralisation", "social"],
  "savva_content": {
    "data_cid": "bafybeig...",
    "locales": {
      "en": {
        "text_preview": "Ceci est un court aperçu du contenu du post...",
        "title": "Mon Premier Post sur SAVVA"
      },
      "ru": {
        "text_preview": "Это короткий анонс содержания поста...",
        "title": "Мой первый пост на SAVVA"
      }
    },
    "thumbnail": "thumbnail.jpg"
  }
}
```

### Explication des Champs Clés

* **author** — informations de profil de l'auteur (y compris le montant misé).
* **savva\_cid / short\_cid** — identifiants uniques. Utilisez-les pour construire des URLs (`/post/<short_cid>`).
* **ipfs / savva\_content.data\_cid** — pointeurs vers le contenu IPFS.
* **savva\_content** — métadonnées mises en cache par le backend (titres, aperçus, vignettes). Idéal pour le rendu du fil sans récupération IPFS.
* **fund** — informations sur le pool de financement du post.
* **reactions** — tableau des comptes pour chaque type de réaction.

---

## Étape 2 : Résoudre le Contenu Complet depuis IPFS

Bien que `savva_content` soit utile pour les aperçus, le contenu complet doit être récupéré depuis IPFS (corps du post, chapitres, actifs).

### Résolution des Chemins de Contenu

L'emplacement de `info.yaml` dépend du format :

* **Format moderne**

  * `savva_content.data_cid` = CID de base pour les actifs.
  * `ipfs` = chemin direct vers `info.yaml`.
* **Format hérité**

  * Pas de `data_cid`.
  * `ipfs` = CID de base. Descripteur supposé à `<ipfs>/info.yaml`.

### Fonctions Utilitaires

Utilisez les helpers de `src/ipfs/utils.js` :

```js
import {
  getPostDescriptorPath,
  getPostContentBaseCid,
  resolvePostCidPath
} from "../../ipfs/utils.js";

const post = { ... };

// 1. Chemin vers le fichier descripteur
const descriptorPath = getPostDescriptorPath(post);

// 2. CID de base pour les actifs
const contentBaseCid = getPostContentBaseCid(post);

// 3. Résoudre le chemin relatif (par exemple, vignette)
const fullThumbnailPath = resolvePostCidPath(post, post.savva_content.thumbnail);
```

---

## Priorisation des Passerelles IPFS

Ordre de récupération :

1. **Nœud local** (si activé).
2. **Passerelles spécifiques au post** (listées dans le descripteur).
3. **Passerelles système** (backend `/info`).

Cela garantit la meilleure vitesse et disponibilité.

---

## Le Descripteur de Post (`info.yaml`)

Un fichier YAML définissant la structure complète : langues, chapitres, métadonnées.

### Exemple `info.yaml`

```yaml
thumbnail: assets/post_thumbnail.png
gateways:
  - https://my-fast-pinning-service.cloud

locales:
  en:
    title: "Comprendre les Systèmes Décentralisés"
    text_preview: "Une plongée approfondie dans les concepts fondamentaux de la décentralisation..."
    tags: ["blockchain", "systèmes", "web3"]
    categories: ["Technologie"]
    data_path: content/en/main.md
    chapters:
      - title: "Qu'est-ce qu'une Blockchain ?"
        data_path: content/en/chapter1.md
      - title: "IPFS et l'Adressage de Contenu"
        data_path: content/en/chapter2.md
  
  ru:
    title: "Понимание децентрализованных систем"
    text_preview: "Глубокое погружение в основные концепции децентрализации..."
    tags: ["блокчейн", "системы", "web3"]
    categories: ["Технологии"]
    data_path: content/ru/main.md
    chapters:
      - title: "Что такое блокчейн?"
        data_path: content/ru/chapter1.md
      - title: "IPFS и контентная адресация"
        data_path: content/ru/chapter2.md
```

### Champs Clés du Descripteur

* **thumbnail** — chemin relatif vers l'image principale.
* **gateways** — passerelles IPFS recommandées optionnelles.
* **locales** — objet indexé par les codes de langue.

  * **title / text\_preview / tags / categories** — métadonnées spécifiques à la langue.
  * **data\_path** — contenu principal en Markdown pour cette langue.
  * **chapters** — tableau de chapitres, chacun avec `title` et `data_path`.

Pour récupérer le contenu complet d'un chapitre :

```txt
<content_base_cid>/content/en/chapter1.md
```