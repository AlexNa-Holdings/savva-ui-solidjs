# Initialisation de l'application et connexion au backend

## Qu'est‑ce que le backend SAVVA (nœud SAVVA) ?
Un backend SAVVA est un composant serveur qui **indexe/mise en cache les données provenant de l'activité blockchain** et expose des APIs et méthodes WebSocket rapides et adaptées à l'interface utilisateur. Un seul backend peut desservir **plusieurs domaines SAVVA** — pensez à un « domaine » comme un réseau social SAVVA distinct (branding, onglets, ressources, valeurs par défaut), tous gérés par un même nœud.

## Ce dont l'application a besoin au démarrage
Au démarrage, l'application web a besoin de deux entrées :

1. **URL du backend** – l'URL de base du backend SAVVA.
2. **Nom de domaine** – quel domaine SAVVA (réseau social) afficher par défaut.

Les valeurs par défaut proviennent d'un petit fichier YAML à la racine web :

### `/default_connect.yaml`
```yaml
# /default_connect.yaml
domain: savva.app
backendLink: https://ui.savva.app/api/
gear: true
# optional:
# default_ipfs_link: ipfs://bafy.../something.json
````

* `backendLink` — point de terminaison HTTP de base du backend SAVVA (l'application le normalise).
* `domain` — domaine initial à afficher ; il peut être modifié plus tard dans l'interface.
* `gear` — active les outils développeur dans l'UI (optionnel).
* `default_ipfs_link` — valeur par défaut optionnelle utilisée dans certains flux.

> **Remarque production**
> En production, ce fichier est généralement servi par votre serveur HTTP (par ex. Nginx) et **détermine quel domaine** une application web déployée affiche par défaut. Un schéma courant consiste à servir un fichier spécifique depuis le disque :
>
> ```nginx
> # example: serve a static default_connect.yaml
> location = /default_connect.yaml {
>   default_type text/yaml;
>   alias /etc/savva/default_connect.yaml;
> }
> ```
>
> Adaptez cela à votre infra ; l'important est que l'application puisse faire un `GET /default_connect.yaml`.

---

## Séquence de démarrage

1. **Charger `/default_connect.yaml`**
   L'application récupère le fichier YAML, valide `backendLink` et stocke `domain`. Elle **configure immédiatement les endpoints** (base HTTP + URL WS) en utilisant ces valeurs. &#x20;

2. **Configurer les endpoints**

   * `httpBase` est une version normalisée de `backendLink` (slash final garanti).
   * L'URL `ws` est dérivée de la même base, pointant vers `.../ws` (protocole converti en `ws:` ou `wss:`) et inclut `?domain=...` dans la query.
     Cela maintient une **source unique de vérité** pour HTTP et WS.&#x20;

3. **Appeler `/info`**
   Avec les endpoints configurés, l'app exécute `GET <httpBase>info` et stocke le JSON. Dès cet instant, **/info pilote le comportement à l'exécution** (domaines, chaîne, IPFS, assets).&#x20;

4. **Dériver l'état d'exécution depuis `/info`**
   Les champs suivants sont utilisés (voir l'exemple ci‑dessous) :

   * **`domains`** → liste des domaines disponibles. L'UI privilégie le `domain` explicite du YAML/override ; s'il n'est pas présent dans `/info`, il l'utilise quand même.&#x20;
   * **`blockchain_id`** → ID de chaîne EVM cible. l'aide‑wallet peut switcher/ajouter ce réseau.&#x20;
   * **`ipfs_gateways`** → passerelles IPFS distantes à tester dans l'ordre (sauf si un override IPFS local est activé).&#x20;
   * **`assets_url`** et **`temp_assets_url`** → la **base des assets** (prod vs test). L'application calcule le **préfixe des assets du domaine actif** comme
     `(<assets base> + <domain> + "/")` avec un **fallback** vers `/domain_default/` si le `config.yaml` distant est absent. &#x20;

5. **Charger les assets & config du domaine**
   L'application tente `(<active prefix>/config.yaml)` avec un court timeout ; en cas d'échec elle retombe sur le pack par défaut à `/domain_default/config.yaml`. La configuration parsée résultante (logos, onglets, locales, etc.) est stockée et l'UI se rend en conséquence.&#x20;

6. **WebSocket à l'exécution**
   Le client WS utilise l'URL `ws` calculée depuis les endpoints ; lorsque le backend/domaine change, les endpoints se recalculent et la couche WS en tient compte.&#x20;

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

### Champ par champ (ce que l'app en fait)

* **domains** — liste de domaines sélectionnables. la boîte de dialogue **Switch backend / domain** se peuple depuis `/info`, mais le domaine configuré garde la priorité si `/info` est en retard. &#x20;
* **blockchain\_id** — ID numérique de la chaîne EVM ; utilisé pour construire les métadonnées `switch/add chain` et pour s'assurer que le wallet est sur le **réseau requis**. &#x20;
* **ipfs\_gateways** — liste ordonnée de passerelles distantes ; combinée avec un override **Local IPFS** optionnel (lorsqu'activé dans les réglages) pour former l'ordre des passerelles **actives**.&#x20;
* **assets\_url / temp\_assets\_url** — l'app maintient un **environnement assets** (`prod`/`test`) et choisit la base correspondante. Elle calcule ensuite `/<base>/<domain>/` et charge `config.yaml`. Si le pack distant est manquant ou lent, elle utilise le **default** `/domain_default/`.&#x20;

---

## Où cela se trouve dans le code (référence rapide)

* Boot & chargement de `/default_connect.yaml`, puis `/info` : **`src/context/AppContext.jsx`** et **`src/hooks/useConnect.js`**. &#x20;
* Source de vérité des endpoints (base HTTP + URL WS) : **`src/net/endpoints.js`**.&#x20;
* Résolution de la liste de domaines, ID de chaîne, passerelles IPFS, env des assets & chargement des assets du domaine : **`src/context/AppContext.jsx`**.  &#x20;
* Dialogue de switch qui récupère `/info` et normalise `domains` : **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Suivant :** dans le chapitre suivant nous détaillerons la **configuration par domaine** (`config.yaml`) et comment elle contrôle les logos, les onglets, les locales et d'autres comportements UI spécifiques au domaine.