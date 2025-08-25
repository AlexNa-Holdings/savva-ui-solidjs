# Affichage des Publications

Afficher un post SAVVA est un processus en deux étapes. Tout d'abord, vous récupérez une liste d'objets de métadonnées de post depuis le backend SAVVA. Ensuite, vous utilisez les informations IPFS de ces métadonnées pour récupérer le contenu réel (comme le titre, le texte et les images) depuis le réseau décentralisé.

---

## Étape 1 : Récupérer les Métadonnées des Posts depuis le Backend

Le moyen principal d'obtenir une liste de posts est via la méthode WebSocket `content-list`. C'est un point de terminaison flexible qui prend en charge la pagination, le tri et le filtrage.

### Appel de `content-list`

Vous appelez la méthode avec des paramètres spécifiant quel contenu vous avez besoin. Voici un exemple typique :

```javascript
// Exemple d'appel utilisant l'assistant wsMethod de l'application
const posts = await app.wsMethod("content-list")({
  domain: "savva.app",      // Le domaine pour récupérer les posts
  limit: 12,                // Nombre d'éléments par page
  offset: 0,                // Commencer au premier élément (pour la pagination)
  lang: "en",               // Langue préférée pour toute métadonnée retournée
  order_by: "fund_amount",  // Trier par le montant total des fonds reçus
  content_type: "post",     // Nous voulons uniquement des posts
  category: "en:SAVVA Talk" // Optionnel : filtrer par une catégorie spécifique
});
```

### La Structure de l'Objet Post

La méthode `content-list` retourne un tableau d'objets de post. Chaque objet contient toutes les métadonnées on-chain et les pointeurs nécessaires pour récupérer le contenu complet.

Voici un exemple d'un seul objet post retourné par le backend :

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
  "data_cid": "bafybeig...",
  "reactions": [10, 2, 0, 1],
  "savva_cid": "0x01701...cfa2",
  "short_cid": "aBcDeF1",
  "tags": ["décentralisation", "social"],
  "savva_content": {
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

* **author** : Informations de profil de l'auteur du post, y compris son montant misé.
* **savva\_cid / short\_cid** : Identifiants uniques pour le post. Le `savva_cid` est l'ID complet on-chain, tandis que le `short_cid` est une alternative conviviale. Utilisez-les pour construire des URLs (par exemple, `/post/<short_cid>`).
* **ipfs & data\_cid** : Pointeurs cruciaux vers le contenu sur IPFS. Consultez la section suivante pour savoir comment les utiliser.
* **savva\_content** : Objet de métadonnées directement du cache backend. Il contient un objet `locales` avec des titres et des aperçus pré-récupérés, ce qui est parfait pour rendre des cartes de post dans un fil sans avoir besoin de récupérer d'abord depuis IPFS.
* **fund** : Informations sur le pool de financement du post.
* **reactions** : Un tableau représentant les comptes pour différents types de réactions (j'aime, super, etc.).

---

## Étape 2 : Résoudre le Contenu Complet depuis IPFS

Bien que `savva_content` soit utile pour les aperçus, vous devez récupérer depuis IPFS pour obtenir le corps complet du post, les chapitres et d'autres actifs.

### Trouver le Descripteur et le Dossier de Données

Les champs `ipfs` et `data_cid` fonctionnent ensemble pour vous indiquer où tout se trouve. Il y a deux scénarios :

1. **`data_cid` est présent** :

   * `ipfs` est le chemin direct vers le fichier descripteur (par exemple, `bafy.../info.yaml`).
   * `data_cid` est le CID du dossier contenant tous les actifs du post (images, fichiers markdown, etc.). C'est votre base de contenu.

2. **`data_cid` n'est PAS présent (format hérité)** :

   * `ipfs` est le CID du dossier contenant tous les actifs du post.
   * Le fichier descripteur est supposé être à un chemin standard : `<ipfs>/info.yaml`.

La logique de l'application doit déterminer le chemin du descripteur et le CID de la base de contenu en fonction de ces règles.

### Le Descripteur de Post (`info.yaml`)

Le descripteur est un fichier YAML qui définit la structure complète du post, y compris toutes ses variations linguistiques et chapitres.

#### Exemple `info.yaml`

```yaml
# Exemple info.yaml pour un post multilingue et multi-chapitre

thumbnail: assets/post_thumbnail.png

locales:
  en:
    title: "Comprendre les Systèmes Décentralisés"
    text_preview: "Une plongée approfondie dans les concepts fondamentaux de la décentralisation..."
    tags: ["blockchain", "systèmes", "web3"]
    categories: ["Technologie"]
    # Le contenu principal, peut être en ligne ou un chemin
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

* **thumbnail** : Chemin relatif vers l'image principale du post, résolu par rapport au CID de la base de contenu.
* **locales** : Objet où chaque clé est un code de langue (par exemple, `en`, `ru`).
* **title / text\_preview / tags / categories** : Métadonnées spécifiques à la langue.
* **data\_path** : Chemin relatif vers le contenu principal en Markdown pour cette langue.
* **chapters** : Tableau d'objets de chapitre, chacun avec son propre titre et `data_path`.

Pour obtenir le contenu complet d'un chapitre, vous combinez le CID de la base de contenu avec le `data_path` du descripteur. Par exemple, pour récupérer la version anglaise du Chapitre 1, vous demanderiez :

```
<content_base_cid>/content/en/chapter1.md
```

depuis une passerelle IPFS.