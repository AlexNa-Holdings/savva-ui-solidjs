# Initialisation de l'application & connexion au backend

## Qu'est‑ce que le backend SAVVA (nœud SAVVA) ?
Un backend SAVVA est un composant serveur qui **indexe/mets en cache les données issues de l'activité blockchain** et expose des API et méthodes WebSocket rapides et adaptées à l'interface utilisateur. Un seul backend peut desservir **plusieurs domaines SAVVA** — pensez à un « domaine » comme un réseau social SAVVA distinct (branding, onglets, assets, valeurs par défaut), tous pris en charge par un même nœud.

## Ce dont l'application a besoin au démarrage
Au démarrage, l'application web a besoin de deux entrées :

1. **URL du backend** – l'URL de base du backend SAVVA.
2. **Nom de domaine** – quel domaine SAVVA (réseau social) afficher par défaut.

Les valeurs par défaut proviennent d'un petit fichier JSON à la racine web (YAML est aussi pris en charge en cas de besoin) :

### `/default_connect.json`
```json
{
  "domain": "savva.app",
  "backendLink": "https://ui.savva.app/api/",
  "gear": true,
  "default_ipfs_link": "ipfs://bafy.../something.json"
}
```

* `backendLink` — point de terminaison HTTP de base du backend SAVVA (l'application le normalise).
* `domain` — domaine initial à afficher ; peut être changé plus tard dans l'interface.
* `gear` — active les outils développeur dans l'interface (optionnel).
* `default_ipfs_link` — valeur par défaut pratique optionnelle utilisée dans certains flux.

> **Remarque sur le format**
> L'application tente d'abord `/default_connect.json`. Si cette requête échoue, elle retombe sur `/default_connect.yaml` pour compatibilité ascendante. Les nouvelles déploiements devraient utiliser JSON.

> **Remarque pour la production**
> En production, ce fichier est généralement servi par votre serveur HTTP (par ex. Nginx) et **détermine quel domaine** une application web déployée affiche par défaut. Une pratique courante consiste à servir un fichier spécifique depuis le disque :
>
> ```nginx
> # example: serve a static default_connect.json
> location = /default_connect.json {
>   default_type application/json;
>   alias /etc/savva/default_connect.json;
> }
> ```
>
> Adaptez à votre infrastructure ; l'essentiel est que l'application puisse effectuer un `GET /default_connect.json`.

---

## Séquence de démarrage

1. **Charger la config du site (`/default_connect.json` ou `.yaml`)**
   L'application tente de récupérer `/default_connect.json` en premier ; si indisponible, elle retombe sur `/default_connect.yaml`. Elle valide `backendLink`, stocke `domain` et **configure immédiatement les endpoints** (base HTTP + URL WS) en utilisant ces valeurs. &#x20;

2. **Configurer les endpoints**

   * `httpBase` est une version normalisée de `backendLink` (slash final garanti).
   * L'URL `ws` est dérivée de la même base, pointant vers `.../ws` (protocole changé en `ws:` ou `wss:`) et inclut `?domain=...` dans la query.
     Cela garantit **une source de vérité unique** pour HTTP et WS.&#x20;

3. **Récupérer `/info`**
   Une fois les endpoints configurés, l'application appelle `GET <httpBase>info` et stocke le JSON. À partir de ce moment, **/info pilote le comportement à l'exécution** (domaines, chaîne, IPFS, assets).&#x20;

4. **Dériver l'état d'exécution depuis `/info`**
   Les champs suivants sont utilisés (voir l'exemple ci‑dessous) :

   * **`domains`** → liste de domaines disponibles. L'interface privilégie le `domain` explicite provenant du YAML/override ; s'il n'est pas présent dans `/info`, elle l'utilise quand même.&#x20;
   * **`blockchain_id`** → ID de chaîne EVM cible. L'helper de portefeuille peut basculer/ajouter ce réseau.&#x20;
   * **`ipfs_gateways`** → passerelles IPFS distantes à essayer dans l'ordre (sauf si un override IPFS local est activé).&#x20;
   * **`assets_url`** et **`temp_assets_url`** → la **base des assets** (prod vs test). L'application calcule le **préfixe des assets actif pour le domaine** comme
     `(<assets base> + <domain> + "/")` avec une **solution de repli** sur `/domain_default/` si le `config.yaml` distant est manquant. &#x20;

5. **Charger les assets & la config du domaine**
   L'application tente `(<active prefix>/config.yaml)` avec un court timeout ; en cas d'échec, elle revient au pack par défaut `/domain_default/config.yaml`. La configuration parsée résultante (logos, onglets, locales, etc.) est stockée et l'interface s'affiche en conséquence.&#x20;

6. **Exécution WebSocket**
   Le client WS utilise l'URL `ws` calculée à partir des endpoints ; lorsque le backend/le domaine change, les endpoints sont recalculés et la couche WS en tient compte.&#x20;

---

## Exemple de `/info` (illustratif)

```json
{
  "domains": [
    "savva.app",
    {"name": "art.savva"},
    "dev.savva"
  ],
  "blockchain_id": 369,
  "ipfs_gateways": [
    "https://cloudflare-ipfs.com/ipfs/",
    "https://ipfs.io/ipfs/"
  ],
  "assets_url": "https://cdn.savva.network/assets/",
  "temp_assets_url": "https://cdn.savva.network/assets-test/"
}
```

### Champ par champ (ce que l'application en fait)

* **domains** — liste de domaines sélectionnables. La boîte de dialogue **Switch backend / domain** se remplit à partir de `/info`, mais le domaine configuré reste prioritaire si `/info` est en retard. &#x20;
* **blockchain\_id** — ID numérique de la chaîne EVM ; utilisé pour construire les métadonnées `switch/add chain` et pour s'assurer que le portefeuille est sur le **réseau requis**. &#x20;
* **ipfs\_gateways** — liste ordonnée de passerelles distantes ; combinée avec un override **IPFS local** optionnel (lorsqu'activé dans les paramètres) pour former l'ordre de passerelles **actif**.&#x20;
* **assets\_url / temp\_assets\_url** — l'application maintient un **environnement d'assets** (`prod`/`test`) et choisit la base correspondante. Elle calcule ensuite `/<base>/<domain>/` et charge `config.yaml`. Si le pack distant est manquant ou lent, elle utilise le **par défaut** `/domain_default/`.&#x20;

---

## Où cela se trouve dans le code (pour référence rapide)

* Chargement du démarrage et de la config du site (`/default_connect.json` avec fallback `.yaml`), puis `/info` : **`src/context/AppContext.jsx`** et **`src/hooks/useConnect.js`**. Le loader partagé se trouve dans **`src/utils/loadSiteConfig.js`**. &#x20;
* Source de vérité des endpoints (HTTP base + URL WS) : **`src/net/endpoints.js`**.&#x20;
* Résolution de la liste de domaines, ID de chaîne, passerelles IPFS, env d'assets & chargement des assets par domaine : **`src/context/AppContext.jsx`**.  &#x20;
* Dialogue de changement qui récupère `/info` et normalise `domains` : **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Suivant :** dans le chapitre suivant, nous décomposerons la **configuration de domaine** (`config.yaml`) et comment elle contrôle les logos, les onglets, les locales et d'autres comportements d'interface par domaine.