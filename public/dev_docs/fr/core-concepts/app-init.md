# Initialisation de l'application et connexion au backend

## Qu'est-ce que le backend SAVVA (nœud SAVVA) ?
Un backend SAVVA est un composant serveur qui **indexe/cache les données provenant de l'activité de la blockchain** et expose des API et des méthodes WebSocket rapides et conviviales pour l'interface utilisateur. Un seul backend peut servir **plusieurs domaines SAVVA**—pensez à un « domaine » comme un réseau social SAVVA distinct (branding, onglets, actifs, valeurs par défaut), tous soutenus par un seul nœud.

## Ce dont l'application a besoin au démarrage
Au démarrage, l'application web a besoin de deux entrées :

1. **URL du backend** – l'URL de base du backend SAVVA.
2. **Nom de domaine** – quel domaine SAVVA (réseau social) rendre par défaut.

Les valeurs par défaut proviennent d'un petit fichier YAML à la racine du web :

### `/default_connect.yaml`
```yaml
# /default_connect.yaml
domain: savva.app
backendLink: https://ui.savva.app/api/
gear: true
# optionnel :
# default_ipfs_link: ipfs://bafy.../something.json
```

* `backendLink` — point de terminaison HTTP de base du backend SAVVA (l'application le normalise).
* `domain` — domaine initial à rendre ; peut être changé plus tard dans l'interface utilisateur.
* `gear` — active les outils de développement dans l'interface utilisateur (optionnel).
* `default_ipfs_link` — valeur par défaut optionnelle utilisée dans certains flux.

> **Remarque de production**
> En production, ce fichier est généralement servi par votre serveur HTTP (par exemple, Nginx) et choisit effectivement **quel domaine** une application web déployée affiche par défaut. Un modèle courant consiste à servir un fichier spécifique depuis le disque :
>
> ```nginx
> # exemple : servir un fichier statique default_connect.yaml
> location = /default_connect.yaml {
>   default_type text/yaml;
>   alias /etc/savva/default_connect.yaml;
> }
> ```
>
> Ajustez selon votre infrastructure ; l'essentiel est que l'application puisse `GET /default_connect.yaml`.

---

## Séquence de démarrage

1. **Charger `/default_connect.yaml`**
   L'application récupère le fichier YAML, valide `backendLink`, et stocke `domain`. Elle **configure immédiatement les points de terminaison** (base HTTP + URL WS) en utilisant ces valeurs. &#x20;

2. **Configurer les points de terminaison**

   * `httpBase` est une version normalisée de `backendLink` (garantie avec un slash final).
   * L'URL `ws` est dérivée de la même base, pointant vers `.../ws` (protocole changé en `ws:` ou `wss:`) et inclut `?domain=...` dans la requête.
     Cela maintient **une source de vérité** pour HTTP et WS.&#x20;

3. **Récupérer `/info`**
   Avec les points de terminaison définis, l'application appelle `GET <httpBase>info` et stocke le JSON. À partir de ce moment, **/info guide le comportement d'exécution** (domaines, chaîne, IPFS, actifs).&#x20;

4. **Dériver l'état d'exécution à partir de `/info`**
   Les champs suivants sont utilisés (voir l'exemple ci-dessous) :

   * **`domains`** → Liste des domaines disponibles. L'interface utilisateur préfère le `domain` explicite du YAML/surcharge ; s'il n'est pas présent dans `/info`, il l'utilise quand même.&#x20;
   * **`blockchain_id`** → ID de chaîne EVM cible. L'outil de portefeuille peut changer/ajouter ce réseau.&#x20;
   * **`ipfs_gateways`** → Passerelles IPFS distantes à essayer dans l'ordre (sauf si une surcharge IPFS locale est activée).&#x20;
   * **`assets_url`** et **`temp_assets_url`** → La **base des actifs** (prod vs test). L'application calcule le **préfixe des actifs du domaine actif** comme
     `(<base des actifs> + <domaine> + "/")` avec un **repli** sur `/domain_default/` si le `config.yaml` distant est manquant. &#x20;

5. **Charger les actifs et la configuration du domaine**
   L'application essaie `(<préfixe actif>/config.yaml)` avec un court délai d'attente ; en cas d'échec, elle revient au pack par défaut à `/domain_default/config.yaml`. La configuration analysée résultante (logos, onglets, locales, etc.) est stockée et l'interface utilisateur se rend en conséquence.&#x20;

6. **Exécution WebSocket**
   Le client WS utilise l'URL `ws` calculée à partir des points de terminaison ; lorsque le backend/le domaine changent, les points de terminaison se recalculent et la couche WS le prend en compte.&#x20;

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

* **domains** — liste des domaines sélectionnables. La boîte de dialogue **Changer de backend / domaine** se remplit à partir de `/info`, mais le domaine configuré prend toujours la priorité si `/info` est en retard. &#x20;
* **blockchain\_id** — ID numérique de la chaîne EVM ; utilisé pour construire les métadonnées `changer/ajouter une chaîne` et pour s'assurer que le portefeuille est sur le **réseau requis**. &#x20;
* **ipfs\_gateways** — liste ordonnée de passerelles distantes ; combinée avec une éventuelle **surcharge IPFS locale** (lorsqu'elle est activée dans les paramètres) pour former l'ordre de passerelle **actif**.&#x20;
* **assets\_url / temp\_assets\_url** — l'application maintient un **environnement d'actifs** (`prod`/`test`) et choisit la base correspondante. Elle calcule ensuite `/<base>/<domaine>/` et charge `config.yaml`. Si le pack distant est manquant ou lent, elle utilise le **par défaut** `/domain_default/`.&#x20;

---

## Où cela se trouve dans le code (pour référence rapide)

* Démarrage et chargement de `/default_connect.yaml`, puis `/info` : **`src/context/AppContext.jsx`** et **`src/hooks/useConnect.js`**. &#x20;
* Source de vérité des points de terminaison (base HTTP + URL WS) : **`src/net/endpoints.js`**.&#x20;
* Résolution de la liste des domaines, ID de chaîne, passerelles IPFS, environnement d'actifs et chargement des actifs du domaine : **`src/context/AppContext.jsx`**.  &#x20;
* Boîte de dialogue de changement qui récupère `/info` et normalise `domains` : **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Suivant :** dans le chapitre suivant, nous allons décomposer **la configuration du domaine** (`config.yaml`) et comment elle contrôle les logos, les onglets, les locales et d'autres comportements de l'interface utilisateur par domaine.