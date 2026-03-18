<!-- public/dev_docs/en/core-concepts/connection-orchestration.md -->

# Orchestration de la connexion, stockage de `/info` et configuration de domaine

Cette page explique précisément comment l’application démarre, se connecte à un backend, choisit un domaine, et comment elle stocke/utilise la réponse `/info` du backend ainsi que la configuration du domaine. Elle est rédigée pour des ingénieurs professionnels qui doivent étendre ou déboguer le flux.

> **TL;DR** — Il existe un seul orchestrateur (`useAppOrchestrator`) qui :
>
> * lit `/default_connect.json` (avec repli sur `.yaml`) + un override local optionnel,
> * configure les endpoints HTTP/WS,
> * récupère `/info`,
> * finalise le domaine,
> * choisit la base des assets (prod/test), charge le domain pack,
> * reconnecte le WebSocket, et
> * (sur switch explicite) navigue vers `/`.

---

## Termes & primitives

* **Backend** — le nœud SAVVA (API HTTP + WebSocket).
* **Domaine** — quel réseau (branding, onglets, assets) afficher.
* **Domain Pack** — dossier `\<assetsBase\>/\<domain\>/` contenant `config.yaml`, `domain.css`, i18n, images, modules, etc. L’app peut charger des packs depuis **prod** (`assets_url`) ou **test** (`temp_assets_url`).
* **Override** — un petit instantané `{ backendLink, domain }` persisté dans `localStorage` sous la clé `connect_override`.

---

## Arborescence des fichiers (où se trouvent les choses)

* **Orchestrator (source de vérité) :** `src/context/useAppOrchestrator.js` — logique de boot & switch, `/info`, env des assets, domain pack, reconnexion WS. Expose `initializeOrSwitch()`, `setDomain()`, `clearConnectOverride()`, et des signaux pour `config`, `info`, `assetsEnv`, `domainAssets*`.
* **Wrapper du contexte App :** `src/context/AppContext.jsx` — consomme l’orchestrateur et dérive `supportedDomains`, `selectedDomain`, chaîne/réseau, gateways IPFS, et `assetUrl()` ; fait aussi respecter la consistance d’auth lors des changements de domaine.
* **Endpoints HTTP/WS :** `src/net/endpoints.js` — calcule `httpBase()` et `wsUrl()` à partir de `{ backendLink, domain }`, émet un événement de changement lors de la reconfiguration, et fournit des helpers.
* **Runtime WebSocket :** reprend les changements d’endpoints et se reconnecte en conséquence.
* **UI de switch :** `src/x/modals/SwitchConnectModal.jsx` — récupère `<backend>/info`, normalise la liste des domaines, et applique les changements via l’API de l’app.
* **Shell principal :** applique dynamiquement `domain.css`, favicons/meta, GA, et lie le connecteur WS.
* **Note legacy.** Vous pouvez voir un hook plus ancien `useAppConnection` ; continuez d’utiliser l’**orchestrateur** (design actuel) comme source unique de vérité.

---

## 1) Séquence de démarrage — étape par étape

L’orchestrateur s’exécute une fois au montage :

1. **Charger les valeurs par défaut du site**
   Tenter `GET /default_connect.json` d’abord ; si absent, retomber sur `GET /default_connect.yaml`. Parser `backendLink`, `domain`, et (optionnellement) `gear`. Ces valeurs sont combinées avec un **override** persisté (si présent).

2. **Normaliser & pré‑configurer les endpoints (avant `/info`)**
   Avant `/info`, on définit les endpoints en utilisant le domaine **demandé** tel quel :
   `configureEndpoints({ backendLink, domain }, "orch:pre-info")`. Cela calcule `httpBase()` et `wsUrl()` et émet un événement de changement afin que le runtime pointe vers le bon serveur.

3. **Récupérer `/info`**
   `GET <backendLink>/info` (no-cache). Le JSON est stocké dans `orchestrator.info`.

4. **Résoudre le domaine final**
   Si l’utilisateur a explicitement demandé un domaine, il est **respecté** ; sinon on prend le **premier** domaine de `/info.domains` (s’il existe). Le `{ backendLink, domain }` résolu devient `config`. Si c’était un switch, on **persiste** l’override.

5. **Finaliser les endpoints (après `/info`)**
   Relancer `configureEndpoints` avec le domaine **final**. Tous les appels HTTP doivent utiliser `httpBase()`, et l’**URL WS inclut** `?domain=...`.

6. **Env des assets → charger le domain pack**
   Choisir la base depuis `/info` : `assets_url` (prod) ou `temp_assets_url` (test). Tenter `\<assetsBase\>/\<domain\>/config.yaml`, sinon retomber sur `/domain_default/config.yaml`. Stocker `domainAssetsPrefix`, `domainAssetsConfig`, et la source (`domain` vs `default`).

7. **Forcer la reconnexion WS**
   Mettre à jour l’URL du client ws, reconnecter, attendre l’ouverture (jusqu’à ~8s). Cela garantit que le runtime est en phase avec le nouveau domaine et backend.

8. **Navigation**
   Lors d’un switch explicite, naviguer vers `/` (garde l’état du routing cohérent après un changement de contexte majeur).

> L’orchestrateur expose la même API pour relancer cette séquence à tout moment ; `setDomain()` utilise le même chemin en interne.

---

## 2) Calcul des endpoints (HTTP & WS)

`src/net/endpoints.js` est le **seul** endroit qui connaît la base active et l’URL ws :

### `configureEndpoints({ backendLink, domain }, reason)`

* Normalise la base (assure `https://…/`).
* Stocke le **domain** (string).
* Dérive l’URL WebSocket (`ws:`/`wss:`) avec `?domain=<name>&space=public`.
* Émet un événement `ENDPOINTS_CHANGED`.

Tout le reste du code appelle des getters (`httpBase()`, `wsUrl()`, `wsQuery()`) et/ou s’abonne aux changements.

### Le runtime WS réagit aux changements

Le runtime écoute l’événement de changement des endpoints et peut se reconnecter. L’orchestrateur définit aussi explicitement l’URL et appelle `reconnect`.

### Appels HTTP

Pour les endpoints qui requièrent `domain` dans la query (auth, vérifs admin, etc.), les appelants l’ajoutent via `URLSearchParams` sur `httpBase()`. (Voir les exemples dans `auth.js`.)

---

## 3) `/info` — Ce que nous stockons et comment nous l’utilisons

Le JSON brut de `/info` est stocké comme un **signal** : `orchestrator.info()`.

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

* **Domains** — `AppContext` dérive `supportedDomains` (normalisés, dé‑dupliqués) et le `selectedDomain`. Si `config.domain` est défini, il est préféré ; sinon le premier domaine supporté est utilisé.
* **Chaîne/réseau** — `desiredChainId = info.blockchain_id` → `desiredChain()` dérive les métadonnées complètes ; `ensureWalletOnDesiredChain()` peut être appelé avant les flows de tx.
* **Gateways IPFS** — `remoteIpfsGateways` vient de `info.ipfs_gateways`, et `activeIpfsGateways` préfixe éventuellement une gateway **locale** si activée dans les settings.
* **Base des assets** — L’orchestrateur choisit `assets_url` (prod) ou `temp_assets_url` (test), calcule `\<assetsBase\>/\<domain\>/`, puis charge le domain pack. Le préfixe actif + la config parsée sont publiés via `domainAssetsPrefix()` / `domainAssetsConfig()`.
* **Fonctionnalités de l’app utilisant `/info`** — p.ex., le mapping des prix des tokens consulte `/info.savva_contracts.SavvaToken.address` pour placer le token SAVVA de base dans le tableau des prix.

---

## 4) Configuration du domaine — stockage & consommation

Après l’étape (6) du flow de boot, l’app dispose de :

* `assetsEnv()` — `"prod"` ou `"test"` (toggle dans Settings, utilisé par les admins).
* `assetsBaseUrl()` — calculé depuis `/info` + env.
* `domainAssetsPrefix()` — soit `\<assetsBase\>/\<domain\>/` soit `/domain_default/`.
* `domainAssetsConfig()` — `config.yaml` parsé.

### Qui lit la config du domaine ?

* **CSS & branding**

  * `DomainCssLoader` charge `assetUrl("domain.css")`, avec un cache‑bust via une révision `(env|domain|assets_cid)`.
  * `FaviconLoader` lit la section `favicon` (tailles d’icônes, manifest, mask icon, meta) et met à jour `<link rel="icon">` etc. ; les URLs sont résolues via `assetUrl(relPath)` et cache‑bustées.

* **Internationalisation (langues par domaine)**

  * À chaque chargement de config, l’app publie les codes de langue du domaine vers le système i18n et ajuste le `<title>` du document selon le `title` localisé du locale courant. Elle **valide** aussi la langue courante contre le nouveau domaine et bascule vers une langue supportée si nécessaire.

* **Modules / Onglets**

  * La barre de navigation principale (`TabsBar`) lit `config.modules.tabs` (par défaut `modules/tabs.yaml`) et charge le YAML via le **asset loader** en utilisant `assetUrl()`. Les onglets sont localisés via des clés i18n et/ou des méta‑données par onglet.

* **Blocs HTML & autres assets**

  * Les widgets (p.ex. `HtmlBlock`) appellent `loadAssetResource(app, relPath)` qui résout les chemins relatifs via `assetUrl()` et récupère le texte/YAML en conséquence.

> L’`assetUrl(relPath)` actif est **simplement** `domainAssetsPrefix()` + `relPath` (sans `/` initial) ; cela garde tous les consommateurs cohérents.

### Settings → Assets (diagnostic)

Les admins peuvent basculer **prod/test**, voir le **préfixe/source actif**, et lancer des diagnostics qui confirment la présence des champs clés (logos, locales, tabs, favicon). Cette vue lit *uniquement* les signaux publiés par l’orchestrateur.

---

## 5) Comment fonctionne le switch (backend/domaine)

### Flux UI

1. Le dialogue **Switch backend / domain** accepte une URL de backend.
2. Appelle `<backend>/info` pour peupler une liste normalisée de domaines (`[{name, …}]`).
3. Applique une sélection en appelant l’API de l’app.

### Flux de l’orchestrateur

* Si le **backend** a changé, on **déconnecte** d’abord l’utilisateur pour éviter l’état de cookie cross‑backend.
* Pré‑configurer les endpoints (domaine demandé), fetch `/info`, résoudre le domaine final.
* Persister l’override, définir `config`, **finaliser les endpoints**, charger le domain pack, **reconnecter WS**, naviguer vers l’accueil.

### Consistance d’auth

Si un utilisateur est connecté et que le **domaine** dans `config` change, l’app déconnecte proactivement pour éviter d’agir dans un contexte non‑correspondant. Un toast explique la raison.

---

## 6) `AppContext` — Sur quoi votre code peut se reposer

`useApp()` expose une surface stable, soutenue par l’orchestrateur :

* **État de connexion :** `loading()`, `error()`, `config()`, `info()` (le `/info` brut).
* **Domaines :** `supportedDomains()`, `selectedDomain()`, `selectedDomainName()`.
* **Réseau :** `desiredChainId()`, `desiredChain()`, `ensureWalletOnDesiredChain()`.
* **IPFS :** `remoteIpfsGateways()`, `activeIpfsGateways()`.
* **Assets :** `assetsEnv()`, `assetsBaseUrl()`, `domainAssetsPrefix()`, `domainAssetsConfig()`, et `assetUrl(relPath)`.
* **API de switch :** `initializeOrSwitch(newSettings)`, `setDomain(name)`, `clearConnectOverride()`.
* **Helpers i18n :** `t(key, vars?)`, `lang()`, `setLang(code)`.

### Exemple : charger un snippet YAML depuis le domain pack

```js
// (not a component, just a sketch)
// All visible strings MUST be localized; here none are shown to the user.
import { useApp } from "../context/AppContext.jsx";
import { loadAssetResource } from "../utils/assetLoader.js";

async function loadDomainTabs() {
  const app = useApp();
  const rel = app.domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml";
  const data = await loadAssetResource(app, rel, { type: "yaml" });
  return Array.isArray(data?.tabs) ? data.tabs : [];
}
```

### Exemple : construire un appel authentifié qui nécessite un domain

```js
// All user-visible strings must be localized via t():
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

## 7) Gestion des erreurs & états vides

Quand la connexion échoue au démarrage (p.ex., config malformée, `/info` indisponible), `AppContext` expose `error()` et le shell affiche une carte d’erreur centrée avec des chaînes i18n et un bouton **Retry**.

---

## 8) Notes sur l’i18n & invariants UX

* **Chaque** chaîne visible par l’utilisateur dans le code UI doit provenir de `t("…")` via `useApp()` (navigation, settings, toasts, etc.).
* `document.title` est dérivé du `title` localisé de la config du domaine. Changer le **domaine** ou l’**env** met à jour le branding immédiatement sans rebuild.

---

## 9) Extraits de référence

* Pré‑info configure → `/info` → configure final — cœur de l’orchestrateur.
* Base des assets & fallback du domain pack — orchestrateur.
* Endpoints & URL WS (`?domain=...`) — source unique.
* Runtime WS + reconnexion sur changement d’endpoints — détails runtime.
* Dialogue de switch fetch `/info` & normalisation des domaines — détail UI.

---

## 10) Checklist opérationnelle

* Pour changer les valeurs par défaut dans un déploiement, mettre à jour **`/default_connect.json`** (ou `/default_connect.yaml`) sur le serveur d’hébergement.
* Pour switcher à runtime, utiliser le **Switch dialog** (l’engrenage doit être activé par la config du site).
* Pour prévisualiser un domain pack, basculer **Settings → Assets → Environment: Test**. L’app chargera depuis `temp_assets_url`.
* Si vous changez de **backend**, l’app **déconnecte** d’abord pour éviter les cookies cross‑backend.

---

## Annexe : Modèle de données en un coup d’œil

```ts
// Simplified conceptual model

type AppConfig = {
  backendLink: string;   // normalized with trailing slash
  domain: string;        // chosen domain name
  gear: boolean;         // UI gear enabled (from site YAML)
};

type Info = {
  domains: Array<string | { name: string; website?: string }>;
  blockchain_id?: number;
  ipfs_gateways?: string[];
  assets_url?: string;
  temp_assets_url?: string;
  // ...other fields (e.g., savva_contracts)
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
  domainAssetsPrefix(): string;           // '/domain_default/' or '<assetsBase>/<domain>/'
  domainAssetsConfig(): any | null;       // parsed config.yaml
};
```

---

Voilà le panorama complet. Avec ces primitives vous pouvez étendre l’UI en toute sécurité, en ayant l’assurance que les endpoints, `/info` et les ressources de domaine restent **cohérents** et **réactifs** dans toute l’application.