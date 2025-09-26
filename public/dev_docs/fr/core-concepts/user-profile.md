# Contrat de Profil Utilisateur

Le contrat `UserProfile` stocke l'état on-chain qui alimente les pages d'auteurs, les noms et les métadonnées de profil à travers les domaines SAVVA. Il combine un registre global de noms lisibles par l'humain avec un stockage clé/valeur par domaine et des helpers légers pour les avatars et les données de contact. Cette page résume comment la dApp interagit avec le contrat et les objets JSON de profil qui vivent à ses côtés sur IPFS.

## Obtenir une instance du contrat

L'adresse du contrat est fournie par la charge utile backend `/info` sous `savva_contracts.UserProfile`. Le code front-end la résout via le helper partagé :

```js
const userProfile = await getSavvaContract(app, "UserProfile");
```

Chaque lecture/écriture montrée ci-dessous utilise ce helper avec les utilitaires de routage d'acteur (voir `ProfileEditPage.jsx` et `userProfileStore.js`).

## Noms enregistrés

Les noms sont des identifiants globalement uniques, en minuscules, enregistrés directement contre des adresses de portefeuille.

- `names(address) → string` retourne le nom actuel pour une adresse.
- `owners(string) → address` résout un nom vers son propriétaire. Les deux helpers sont utilisés lors du chargement d'un profil arbitraire (voir `fetchProfileForEdit`).

Mutations :

- `setName(string name)` enregistre ou met à jour le pseudonyme de l'appelant. L'interface appelle ceci dans `executeSetName()` lors de la sauvegarde des modifications du profil.
- `removeName()` supprime l'entrée.
- `transferName(address to)` transfère la réservation à une autre adresse.

Parce que les noms sont globaux, l'interface permet à l'utilisateur de choisir une seule valeur enregistrée puis dérive des noms d'affichage spécifiques à la langue à partir du JSON de profil hors chaîne (décrit ci-dessous).

## Avatars et autres champs principaux

Deux helpers autonomes conservent les champs les plus importants on-chain :

- `setAvatar(string cid)` / `avatars(address) → string` stockent et lisent le CID IPFS de l'avatar d'un utilisateur. L'éditeur télécharge une image vers le point de stockage backend puis appelle `setAvatar` avec le CID retourné.
- `setPubKey(string modifier, string pubKey)` enregistre optionnellement une paire de clés encryptables pour les fonctionnalités de messagerie directe.

Il existe aussi une commodité `setAll(string name, string avatar, bytes32 domain, string profile)` qui regroupe une mise à jour de nom + avatar avec une charge utile de profil pour un domaine donné.

## Stockage clé/valeur à l'échelle du domaine

La plupart des métadonnées sont stockées en utilisant les primitives `setString` et `setUInt`. Les deux acceptent un identifiant de domaine et une clé, encodés en `bytes32`.

```js
await userProfile.write.setString([
  toHexBytes32(app.selectedDomainName()),
  toHexBytes32("profile_cid"),
  newProfileCid,
]);
```

L'exemple ci-dessus reflète ce que fait `ProfileEditPage.jsx` après avoir téléchargé le profil JSON sur IPFS – le CID est écrit sous le domaine courant et la clé `profile_cid`. Les lectures utilisent `getString`/`getUInt` avec les mêmes paramètres. Le contrat expose aussi les mappings publics bruts (`profileString`, `profileUInt`) si vous avez besoin d'un accès direct sans recalculer les clés.

### Clés communes

| Clé | Type | But |
| --- | --- | --- |
| `profile_cid` | string | Pointe vers le fichier JSON canonique du profil sur IPFS pour le domaine sélectionné. |
| Clés personnalisées | string / uint | Les intégrateurs peuvent introduire des métadonnées supplémentaires pour leur domaine en choisissant de nouvelles clés – il suffit de les garder sous 32 octets avant encodage. |

Parce que les données sont indexées par `(utilisateur, domaine, clé)`, différents domaines SAVVA peuvent maintenir des documents de profil indépendants tout en partageant le même registre global de noms.

## Schéma JSON du profil

Le blob JSON stocké à `profile_cid` alimente l'interface riche du profil dans `ProfilePage.jsx`. Lorsque l'éditeur de profil sauvegarde des modifications, il émet un document similaire au suivant :

```json
{
  "display_names": {
    "en": "Alice Example",
    "fr": "Alice Exemple"
  },
  "about_me": {
    "en": "Writer focused on freedom of expression.",
    "es": "Escritora centrada en la libertad de expresión."
  },
  "nsfw": "h",
  "sponsor_values": [10, 25, 100],
  "links": [
    { "title": "Website", "url": "https://alice.example" },
    { "title": "Fedi", "url": "https://fedi.social/@alice" }
  ]
}
```

Champs clés :

- `display_names` — remplacements par langue pour le nom public de l’auteur. `ProfilePage` choisit la langue UI courante, retombe sur l’anglais, puis enfin sur le nom enregistré on-chain.
- `about_me` — texte biographique multilingue affiché sur la carte de profil. Les documents plus anciens peuvent utiliser une chaîne unique `about` ; l’interface retombe en conséquence.
- `nsfw` — indicateur de préférence (`h`, `s`, etc.) qui influence les publications affichées par défaut.
- `sponsor_values` — seuils entiers (en SAVVA) utilisés pour pré-remplir les niveaux d’abonnement.
- `links` — objets de lien externe arbitraires (`title` + `url`).

Vous pouvez étendre le document avec des champs supplémentaires par domaine ; le code consommateur doit ignorer les clés non reconnues.

## Lecture des profils dans la dApp

`ProfilePage.jsx` orchestre trois sources :

1. Un appel websocket (`get-user`) qui retourne des champs on-chain tels que `address`, `name`, `display_names` mis en cache par le backend, les statistiques de staking et les données d’abonnement.
2. Une récupération directe IPFS pour le CID stocké sous `profile_cid` en utilisant les helpers dans `userProfileStore.js`.
3. Des surcharges locales depuis les caches `AppContext` (`userDisplayNames`) qui permettent d’afficher immédiatement des modifications temporaires.

Le résultat combiné détermine ce qui est affiché sous la bannière de l’auteur, le nom spécifique à la langue, et tous les widgets auxiliaires comme les liens sociaux.

## Récapitulatif du flux d’édition

Lors de l’édition de leur profil (`ProfileEditPage.jsx`) :

1. L’interface résout l’adresse cible par nom (via `owners(name)`), puis charge le CID d’avatar, le nom courant et le `profile_cid`.
2. Si un CID de profil existe, le JSON est récupéré depuis IPFS et normalisé dans l’état de l’éditeur.
3. La sauvegarde télécharge un nouveau blob JSON puis émet `setString(domain, "profile_cid", cid)` via `sendAsActor`, garantissant que la transaction est signée par le compte actuellement actif.
4. Le helper `applyProfileEditResult` met à jour les caches locaux pour que les nouvelles données soient visibles sans attendre la réindexation backend.

Le chemin de téléchargement de l’avatar reflète ce processus, appelant `setAvatar` avec le CID retourné.

## Travailler avec les noms vs les noms d’affichage

- **Nom enregistré (`setName`)** — identifiant unique au niveau de la chaîne. Utilisé pour le routage via les URLs `/@handle` et stocké dans le mapping `names` du contrat.
- **Noms d’affichage (`display_names`)** — étiquettes optionnelles par langue dans le JSON de profil. Ils remplacent le nom enregistré quand ils sont présents.
- **`display_name` legacy** — les anciens JSON de profil peuvent fournir un champ unique `display_name` ; l’interface le respecte encore lorsqu’aucune valeur spécifique à la langue n’existe.

Lors de la construction d’intégrations, résolvez toujours l’adresse on-chain si vous acceptez une saisie humaine, et validez qu’un nom est libre avant d’appeler `setName`.

## Utilitaires supplémentaires

- `setUInt` / `getUInt` reflètent les helpers string pour les métadonnées numériques (par exemple, le suivi des compteurs par domaine).
- `setAll` peut initialiser le nom, l’avatar et le pointeur de profil en un seul appel – utile pour les scripts de bootstrap.
- `removeName` et `transferName` fournissent une gestion du cycle de vie si un pseudonyme doit être abandonné.

Avec ces primitives, vous pouvez introduire des fonctionnalités supplémentaires pilotées par le profil (badges, enregistrements de vérification, attestations hors chaîne) en définissant de nouvelles clés de domaine qui pointent soit vers des valeurs on-chain soit vers des documents IPFS additionnels.