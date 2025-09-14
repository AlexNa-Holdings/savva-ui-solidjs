<!-- public/dev_docs/fr/core-concepts/connection-orchestration.md -->

# Orchestration de Connexion, Stockage `/info` & Configuration de Domaine

Cette page explique exactement comment l'application démarre, se connecte à un backend, choisit un domaine, et comment elle stocke/utilise la réponse `/info` du backend et la configuration de domaine. Elle est écrite pour des ingénieurs professionnels qui ont besoin d'étendre ou de déboguer le flux.

> **TL;DR** — Il y a un seul orchestrateur (`useAppOrchestrator`) qui :
>
> * lit `/default_connect.yaml` (+ optionnellement un remplacement local),
> * configure les points de terminaison HTTP/WS,
> * récupère `/info`,
> * finalise le domaine,
> * choisit la base d'actifs (prod/test), charge le pack de domaine,
> * reconnecte le WebSocket, et
> * (sur changement explicite) navigue vers `/`.

---

## Termes & Primitives

* **Backend** — le nœud SAVVA (API HTTP + WebSocket).
* **Domaine** — quel réseau (branding, onglets, actifs) rendre.
* **Pack de Domaine** — dossier `\<assetsBase\>/\<domain\>/` avec `config.yaml`, `domain.css`, i18n, images, modules, etc. L'application peut charger des packs depuis **prod** (`assets_url`) ou **test** (`temp_assets_url`).
* **Remplacement** — un petit instantané `{ backendLink, domain }` persistant dans `localStorage` sous la clé `connect_override`.

---

## Carte des Fichiers (où se trouvent les choses)

* **Orchestrateur (source de vérité) :** `src/context/useAppOrchestrator.js` — logique de démarrage et de changement, `/info`, environnement des actifs, pack de domaine, reconnexion WS. Expose `initializeOrSwitch()`, `setDomain()`, `clearConnectOverride()`, et des signaux pour `config`, `info`, `assetsEnv`, `domainAssets*`.
* **Enveloppe du contexte de l'application :** `src/context/AppContext.jsx` — consomme l'orchestrateur et dérive `supportedDomains`, `selectedDomain`, chaîne/réseau, passerelles IPFS, et `assetUrl()` ; impose également la cohérence d'authentification lors des changements de domaine.
* **Points de terminaison HTTP/WS :** `src/net/endpoints.js` — calcule `httpBase()` et `wsUrl()` à partir de `{ backendLink, domain }`, déclenche un événement de changement lors de la reconfiguration, et fournit des helpers.
* **Runtime WebSocket :** prend en compte les changements de point de terminaison et se reconnecte en conséquence.
* **UI de Changement :** `src/x/modals/SwitchConnectModal.jsx` — récupère `<backend>/info`, normalise une liste de domaines, et applique les changements via l'API de l'application.
* **Shell principal :** applique dynamiquement `domain.css`, favicons/meta, GA, et lie le connecteur WS.
* **Remarque sur l'héritage.** Vous pouvez voir un ancien hook `useAppConnection` ; continuez à utiliser l'**orchestrateur** (design actuel) comme la seule source de vérité.

---

## 1) Séquence de Démarrage — Étape par Étape

L'orchestrateur s'exécute une fois au montage :

1. **Charger les valeurs par défaut du site**
   `GET /default_connect.yaml`, analyser `backendLink`, `domain`, et (optionnellement) `gear`. Ces valeurs sont combinées avec un **remplacement** persistant (si présent).

2. **Normaliser & pré-configurer les points de terminaison (pré-info)**
   Avant `/info`, nous définissons les points de terminaison en utilisant le domaine **demandé** tel quel :
   `configureEndpoints({ backendLink, domain }, "orch:pre-info")`. Cela calcule `httpBase()` et `wsUrl()` et émet un événement de changement afin que le runtime puisse pointer vers le bon serveur.

3. **Récupérer `/info`**
   `GET <backendLink>/info` (sans cache). Le JSON est stocké dans `orchestrator.info`.

4. **Résoudre le domaine final**
   Si l'utilisateur a explicitement demandé un domaine, il est **honoré** ; sinon, nous prenons le **premier** domaine de `/info.domains` (s'il y en a). Le `{ backendLink, domain }` résolu devient `config`. Si cela était un changement, nous **persistons** le remplacement.

5. **Finaliser les points de terminaison (post-info)**
   Relancer `configureEndpoints` avec le domaine **final**. Tous les appels HTTP doivent utiliser `httpBase()`, et l'**URL WS inclut** `?domain=...`.

6. **Environnement des actifs → charger le pack de domaine**
   Choisir la base à partir de `/info` : `assets_url` (prod) ou `temp_assets_url` (test). Essayer `\<assetsBase\>/\<domain\>/config.yaml`, sinon revenir à `/domain_default/config.yaml`. Stocker `domainAssetsPrefix`, `domainAssetsConfig`, et la source (`domain` vs `default`).

7. **Forcer la reconnexion WS**
   Mettre à jour l'URL du client ws, se reconnecter, attendre l'ouverture (jusqu'à ~8s). Cela garantit que le runtime est synchronisé avec le nouveau domaine et backend.

8. **Navigation**
   Sur un changement explicite, naviguer vers `/` (maintient l'état de routage sain après un changement de contexte majeur).

> L'orchestrateur expose la même API pour relancer cette séquence à tout moment ; `setDomain()` utilise le même chemin en interne.

---

## 2) Calcul des Points de Terminaison (HTTP & WS)

`src/net/endpoints.js` est le **seul** endroit qui connaît la base active et l'URL ws :

### `configureEndpoints({ backendLink, domain }, reason)`

* Normalise la base (assure `https://…/`).
* Stocke le **domaine** (chaîne).
* Dérive l'URL WebSocket (`ws:`/`wss:`) avec `?domain=<name>&space=public`.
* Émet un événement `ENDPOINTS_CHANGED`.

Tout autre code appelle des getters (`httpBase()`, `wsUrl()`, `wsQuery()`) et/ou s'abonne aux changements.

### Le runtime WS réagit aux changements

Le runtime écoute le changement de points de terminaison et peut se reconnecter. L'orchestrateur définit également explicitement l'URL et appelle `reconnect`.

### Appels HTTP

Pour les points de terminaison qui nécessitent `domain` dans la requête (auth, vérifications administratives, etc.), les appelants l'attachent via `URLSearchParams` contre `httpBase()`. (Voir les exemples dans `auth.js`.)

---

## 3) `/info` — Ce que Nous Stockons et Comment Nous l'Utilisons

Le JSON brut `/info` est stocké comme un **signal** : `orchestrator.info()`.

**Forme typique (abrégée) :**

```json
{
  "domains": ["savva.app", {"name":"art.savva"}],
  "blockchain_id": 369,
  "ipfs_gateways": ["https://cloudflare-ipfs.com/ipfs/"],
  "assets_url": "https://cdn…/assets/",
  "temp_assets_url": "https://cdn…/assets-test/"
}
```

**Où il est utilisé :**

* **Domaines** — `AppContext` dérive `supportedDomains` (normalisé, dé-duplicaté) et le `selectedDomain`. Si `config.domain` est défini, il est préféré ; sinon, le premier domaine supporté est utilisé.
* **Chaîne/réseau** — `desiredChainId = info.blockchain_id` → `desiredChain()` dérive les métadonnées complètes ; `ensureWalletOnDesiredChain()` peut être appelé avant les flux de tx.
* **Passerelles IPFS** — `remoteIpfsGateways` provient de `info.ipfs_gateways`, et `activeIpfsGateways` préfixe éventuellement une passerelle **locale** si activée dans les paramètres.
* **Base des actifs** — L'orchestrateur choisit `assets_url` (prod) ou `temp_assets_url` (test), calcule `\<assetsBase\>/\<domain\>/`, puis charge le pack de domaine. Le préfixe actif + la configuration analysée sont publiés via `domainAssetsPrefix()` / `domainAssetsConfig()`.
* **Fonctionnalités de l'application utilisant `/info`** — par exemple, la cartographie des prix des tokens recherche `/info.savva_contracts.SavvaToken.address` pour placer le token SAVVA de base dans le tableau des prix.

---

## 4) Configuration de Domaine — Stockage & Consommation

Après l'étape (6) dans le flux de démarrage, l'application a :

* `assetsEnv()` — `"prod"` ou `"test"` (toggle dans les paramètres, utilisé par les administrateurs).
* `assetsBaseUrl()` — calculé à partir de `/info` + env.
* `domainAssetsPrefix()` — soit `\<assetsBase\>/\<domain\>/` ou `/domain_default/`.
* `domainAssetsConfig()` — `config.yaml` analysé.

### Qui lit la configuration du domaine ?

* **CSS & branding**

  * `DomainCssLoader` charge `assetUrl("domain.css")`, avec un cache busté par une révision de `(env|domain|assets_cid)`.
  * `FaviconLoader` lit la section `favicon` (tailles d'icône, manifeste, icône de masque, méta) et met à jour `<link rel="icon">` et autres ; les URL sont résolues via `assetUrl(relPath)` et cache busté.

* **Internationalisation (langues par domaine)**

  * À chaque chargement de configuration, l'application publie les codes de langue du domaine dans le système i18n et ajuste le `<title>` du document au `title` de la locale actuelle. Elle **valide** également la langue actuelle par rapport au nouveau domaine et passe à une langue supportée si nécessaire.

* **Modules / Onglets**

  * La barre de navigation principale (`TabsBar`) lit `config.modules.tabs` (par défaut `modules/tabs.yaml`) et charge le YAML via le **chargeur d'actifs** en utilisant `assetUrl()`. Les onglets sont localisés via des clés i18n et/ou des métadonnées par onglet.

* **Blocs HTML & autres actifs**

  * Les widgets (par exemple, `HtmlBlock`) appellent `loadAssetResource(app, relPath)` qui résout les chemins relatifs via `assetUrl()` et récupère le texte/YAML en conséquence.

> L'URL active `assetUrl(relPath)` est **juste** `domainAssetsPrefix()` + `relPath` (sans `/` au début) ; cela garde tous les consommateurs cohérents.

### Paramètres → Actifs (diagnostics)

Les administrateurs peuvent basculer **prod/test**, voir le **préfixe/source actif**, et exécuter des diagnostics qui confirment la présence de champs clés (logos, locales, onglets, favicon). Cette vue lit *uniquement* les signaux publiés par l'orchestrateur.

---

## 5) Comment Fonctionne le Changement (backend/domaine)

### Flux UI

1. La boîte de dialogue **Changer backend / domaine** accepte une URL de backend.
2. Appelle `<backend>/info` pour peupler une liste de domaines normalisée (`[{name, …}]`).
3. Applique une sélection en appelant l'API de l'application.

### Flux de l'Orchestrateur

* Si le **backend** a changé, nous **déconnectons** d'abord pour éviter un état de cookie croisé entre les backends.
* Pré-configurer les points de terminaison (domaine demandé), récupérer `/info`, résoudre le domaine final.
* Persister le remplacement, définir `config`, **finaliser les points de terminaison**, charger le pack de domaine, **reconnecter WS**, naviguer vers la maison.

### Cohérence d'authentification

Si un utilisateur est connecté et que le **domaine** dans `config` change, l'application se déconnecte proactivement pour éviter d'agir dans un contexte non apparié. Un toast explique pourquoi.

---

## 6) `AppContext` — Sur Quoi Votre Code Peut Compter

`useApp()` expose une surface stable, soutenue par l'orchestrateur :

* **État de connexion :** `loading()`, `error()`, `config()`, `info()` (brut `/info`).
* **Domaines :** `supportedDomains()`, `selectedDomain()`, `selectedDomainName()`.
* **Réseau :** `desiredChainId()`, `desiredChain()`, `ensureWalletOnDesiredChain()`.
* **IPFS :** `remoteIpfsGateways()`, `activeIpfsGateways()`.
* **Actifs :** `assetsEnv()`, `assetsBaseUrl()`, `domainAssetsPrefix()`, `domainAssetsConfig()`, et `assetUrl(relPath)`.
* **API de Changement :** `initializeOrSwitch(newSettings)`, `setDomain(name)`, `clearConnectOverride()`.
* **Helpers i18n :** `t(key, vars?)`, `lang()`, `setLang(code)`.

### Exemple : chargement d'un extrait YAML depuis le pack de domaine

```js
// (pas un composant, juste un croquis)
// Toutes les chaînes visibles doivent être localisées ; ici, aucune n'est montrée à l'utilisateur.
import { useApp } from "../context/AppContext.jsx";
import { loadAssetResource } from "../utils/assetLoader.js";

async function loadDomainTabs() {
  const app = useApp();
  const rel = app.domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml";
  const data = await loadAssetResource(app, rel, { type: "yaml" });
  return Array.isArray(data?.tabs) ? data.tabs : [];
}
```

### Exemple : construction d'un appel authentifié qui nécessite un domaine

```js
// Toutes les chaînes visibles par l'utilisateur doivent être localisées via t():
import { useApp } from "../context/AppContext.jsx";

async function fetchAdminFlag(address) {
  const { t } = useApp();
  const url = new URL(`${httpBase()}is-admin`);
  url.searchParams.set("address", address);
  url.searchParams.set("domain", useApp().selectedDomainName());
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(t("error.connection.message"));
  return (await res.json())?.admin === true;
}
```

---

## 7) Gestion des Erreurs & États Vides

Lorsque la connexion échoue au démarrage (par exemple, YAML mal formé, `/info` hors service), `AppContext` expose `error()` et le shell rend une carte d'erreur centrée avec des chaînes i18n et un bouton **Réessayer**.

---

## 8) Remarques sur l'i18n & Invariants UX

* **Chaque** chaîne visible par l'utilisateur dans le code UI doit être `t("…")` de `useApp()` (navigation, paramètres, toasts, etc.).
* `document.title` est dérivé du `title` localisé de la configuration du domaine. Changer le **domaine** ou l'**env** met à jour le branding immédiatement sans reconstruction.

---

## 9) Extraits de Référence

* Pré-configurer avant info → `/info` → configuration finale — cœur de l'orchestrateur.
* Base des actifs & fallback du pack de domaine — orchestrateur.
* Points de terminaison & URL WS (`?domain=...`) — source unique.
* Runtime WS + reconnexion sur changement de point de terminaison — détails du runtime.
* Boîte de dialogue de changement `/info` fetch & normalisation de domaine — détail UI.

---

## 10) Liste de Contrôle Opérationnelle

* Pour changer les valeurs par défaut dans un déploiement, mettez à jour **`/default_connect.yaml`** sur le serveur web d'hébergement.
* Pour changer à l'exécution, utilisez la **boîte de dialogue de changement** (le gear doit être activé par le YAML du site).
* Pour prévisualiser un pack de domaine, basculez **Paramètres → Actifs → Environnement : Test**. L'application chargera depuis `temp_assets_url`.
* Si vous changez de **backend**, l'application **se déconnecte** d'abord pour éviter les cookies croisés entre backends.

---

## Annexe : Modèle de Données en Un Coup d'Œil

```ts
// Modèle conceptuel simplifié

type AppConfig = {
  backendLink: string;   // normalisé avec une barre oblique finale
  domain: string;        // nom de domaine choisi
  gear: boolean;         // gear UI activé (depuis le YAML du site)
};

type Info = {
  domains: Array<string | { name: string; website?: string }>;
  blockchain_id?: number;
  ipfs_gateways?: string[];
  assets_url?: string;
  temp_assets_url?: string;
  // ...autres champs (par exemple, savva_contracts)
};

type Orchestrator = {
  config(): AppConfig | null;
  info(): Info | null;
  loading(): boolean;
  error(): Error | null;

  // orchestration
  initializeOrSwitch(newSettings?: Partial<AppConfig>): Promise<void>;
  setDomain(name: string): Promise<void>;
  clearConnectOverride(): void;

  // assets
  assetsEnv(): "prod" | "test";
  setAssetsEnv(next: "prod" | "test"): void;
  assetsBaseUrl(): string;
  domainAssetsPrefix(): string;           // '/domain_default/' ou '<assetsBase>/<domain>/'
  domainAssetsConfig(): any | null;       // config.yaml analysé
};
```

---

Voilà le tableau complet. Avec ces primitives, vous pouvez étendre l'UI en toute sécurité, en étant sûr que les points de terminaison, `/info`, et les ressources de domaine restent **cohérents** et **réactifs** à travers l'application.