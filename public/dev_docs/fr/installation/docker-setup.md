# Installation d'un nœud Docker

Cette page décrit la manière recommandée d'exécuter un nœud backend SAVVA : une image Docker publique avec une seule pile Compose. Si vous avez Docker (24+) et le plugin Compose installés, un nœud fonctionnel demande environ une heure de configuration — vous n'avez pas besoin d'accès au code source ni d'une chaîne d'outils Go.

## Pourquoi Docker

SAVVA est une plateforme multi-domaines. Le même protocole et le même registre de contenu on-chain peuvent être servis depuis n'importe quel nombre de domaines indépendants, chacun avec sa propre marque, communauté et politique de modération. N'importe qui peut déployer un domaine.

Jusqu'à la sortie de l'image Docker, cela nécessitait en pratique de compiler le backend depuis les sources et d'écrire un long fichier YAML depuis zéro. Le bundle Docker remplace cela par une image, un fichier `.env` et un seul `docker compose up -d`. Le protocole a toujours été sans permission ; l'image aligne l'implémentation sur cela.

## Ce dont vous aurez besoin

Cinq choses, aucune spécifique à SAVVA :

1. **Un serveur Linux ou un Mac** avec Docker (24+) et le plugin Compose. Un petit VPS suffit. Vous aurez besoin d'espace disque pour le magasin de données IPFS inclus — voir [À propos du stockage IPFS](#about-ipfs-storage).
2. **Une base de données PostgreSQL** (14 ou plus) accessible par le backend. Elle peut tourner sur la même machine, sur un service managé (DigitalOcean, RDS, Supabase, Neon, etc.) ou ailleurs.
3. **Une URL RPC blockchain.** SAVVA fonctionne sur Monad. Le RPC public mainnet `https://rpc.monad.xyz` fonctionne immédiatement sans inscription. Les RPC publics sont soumis à des limites de débit et partagés, donc pour un nœud que vous comptez maintenir sous trafic réel, prévoyez soit d'exécuter votre propre nœud Monad soit de louer un endpoint privé (QuickNode, Alchemy, Ankr, etc.). Vous pouvez commencer avec le RPC public et changer plus tard en modifiant une ligne dans `.env`.
4. **Une adresse de portefeuille admin.** L'identité portefeuille autorisée à administrer le domaine. Un portefeuille **processor** séparé (utilisé par le backend pour signer les transactions payantes / contenu chiffré) est optionnel — vous pouvez démarrer un nœud sans et l'ajouter plus tard.
5. **Un ou idéalement deux comptes de service de pinning IPFS.** Le nœud IPFS inclus conserve le contenu localement, mais un seul nœud est un point de défaillance unique. Un service de pin réplique le contenu épinglé vers un stockage externe durable et expose une passerelle publique afin que n'importe qui puisse récupérer votre contenu même lorsque votre propre nœud est hors ligne.

   Nous recommandons **[Pinata](https://www.pinata.cloud/)** comme service principal. La plupart des services de pin ne récupèrent un CID depuis le réseau IPFS public *qu'après* sa publication, ce qui peut signifier des minutes d'indisponibilité pour un fichier fraîchement publié. L'API de Pinata expose un endpoint d'upload direct, donc le backend envoie le fichier directement à Pinata en même temps qu'il l'ajoute localement — le contenu devient épinglé de manière durable et accessible via la passerelle immédiatement.

   Le plan gratuit de Pinata utilise la `gateway.pinata.cloud` partagée (limite de débit, correcte pour des nœuds personnels à faible trafic, risquée pour du public). Une **passerelle dédiée** sur un sous-domaine que vous contrôlez (`yourname.mypinata.cloud`) nécessite un plan payant. D'autres services — [web3.storage](https://web3.storage/), [Filebase](https://filebase.com/), [4everland](https://www.4everland.org/) — ont des découpages de paliers similaires partagé/dédié.

   Ajoutez un second service en plus de Pinata. Deux fournisseurs indépendants éliminent efficacement le risque qu'une panne, un litige de facturation ou un changement de politique d'une seule entreprise rende votre contenu indisponible. Le bundle prend en charge jusqu'à dix services de pin (`PIN_SERVICE_2_*`, `PIN_SERVICE_3_*`, ...). Un appariement courant est Pinata comme primaire rapide/durable et `web3.storage` ou `Filebase` comme filet de sécurité moins coûteux.

   Pour chaque service, vous aurez besoin de trois chaînes : l'**URL du endpoint API**, une **clé API** (généralement un JWT), et l'**URL de la passerelle publique** du service.

Le bundle fournit son propre nœud IPFS — vous n'avez pas besoin d'en fournir un séparément. Si vous exécutez déjà un nœud IPFS et voulez le pointer, voyez la note de substitution à la fin de [À propos du stockage IPFS](#about-ipfs-storage).

Il n'y a pas d'enregistrement côté SAVVA et pas de clés API autres que celles du service de pin.

## L'installation en cinq minutes

### 1. Créez le répertoire de déploiement et les deux fichiers

```sh
mkdir savva && cd savva
```

Créez **`docker-compose.yml`**:

```yaml
services:
  ipfs:
    image: ipfs/kubo:latest
    container_name: savva-ipfs
    restart: unless-stopped
    environment:
      - IPFS_PROFILE=server
    volumes:
      # Override IPFS_DATA_PATH in .env to put the datastore on a
      # different disk. Default is ./ipfs-data alongside this file.
      - ${IPFS_DATA_PATH:-./ipfs-data}:/data/ipfs
    ports:
      # Swarm port — must be reachable from the public internet (or
      # at least NAT-traversable) for the node to participate in pin
      # replication. Bind both TCP and UDP.
      - "4001:4001"
      - "4001:4001/udp"
    healthcheck:
      test: ["CMD-SHELL", "ipfs --api=/ip4/127.0.0.1/tcp/5001 id >/dev/null 2>&1 || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 5s

  savva-backend:
    image: ghcr.io/alexna-holdings/savva-backend:${SAVVA_VERSION:-latest}
    container_name: savva-backend
    restart: unless-stopped
    env_file: .env
    depends_on:
      ipfs:
        condition: service_healthy
    ports:
      - "${PORT:-8080}:8080"
    volumes:
      - ./data:/data
      # Optional: mount a private key file and set PROCESSOR_KEY_FILE
      # in .env to point at this path inside the container.
      - ./secrets:/run/secrets:ro
```

Créez **`.env`** (vous remplirez les valeurs à l'étape 2) :

```sh
# ----------------------------------------------------------------------
# REQUIRED — fill these in before `docker compose up`.
# ----------------------------------------------------------------------

# Public hostname this instance serves (no scheme, no path).
DOMAIN=mysavva.example.com

# Wallet address(es) that administer the domain (EIP-55 checksummed).
# To list multiple admins, separate with commas: 0xAaa...,0xBbb...
ADMIN_ADDRESS=0xYourAdminWalletAddress

# Postgres connection string. The DB must already exist; see step 3.
DB_CONNECTION_STRING=postgres://savva:savva@db.example.com:5432/savva?sslmode=disable

# IPFS API endpoint. By default this points at the `ipfs` service
# bundled in docker-compose.yml above. Override only if you want to
# point at an IPFS node you run elsewhere.
# IPFS_URL=http://ipfs:5001

# Blockchain RPC URL. The Monad public mainnet RPC works out of the box;
# swap for a private endpoint if you need higher throughput / reliability.
BLOCKCHAIN_RPC=https://rpc.monad.xyz

# Primary IPFS pin service. Required — see step 5 in the prereqs.
# PIN_SERVICE_URL: the IPFS Pinning Service API endpoint
# PIN_SERVICE_API_KEY: the JWT / bearer token from your account
# PIN_SERVICE_GATEWAY: the service's public gateway URL
PIN_SERVICE_URL=https://api.pinata.cloud/psa
PIN_SERVICE_API_KEY=
PIN_SERVICE_GATEWAY=https://gateway.pinata.cloud/ipfs/

# Strongly recommended: a SECOND pin service for redundancy. The
# bundle supports up to ten (PIN_SERVICE_2_*, PIN_SERVICE_3_*, ...).
# PIN_SERVICE_2_URL=https://api.web3.storage/pins
# PIN_SERVICE_2_API_KEY=
# PIN_SERVICE_2_GATEWAY=https://w3s.link/ipfs/

# Processor signing key. OPTIONAL — leave empty to boot a node without
# processor capability. Set later when you want to handle paid /
# encrypted content. EITHER paste the raw hex key here, OR mount a
# file at ./secrets/processor.key and set PROCESSOR_KEY_FILE below.
PROCESSOR_KEY=
# PROCESSOR_KEY_FILE=/run/secrets/processor.key

# ----------------------------------------------------------------------
# OPTIONAL — sensible defaults are baked in. Uncomment to override.
# ----------------------------------------------------------------------

# On-chain Config contract. Default is Monad mainnet; change for other chains.
# CONFIG_CONTRACT=0xEeDf3fd85b8C955160CBee10FB45e02add055e39

# Where the bundled IPFS node stores its data on the host. Defaults to
# ./ipfs-data alongside this file. Point at a different disk for
# production deployments — the datastore grows with pinned content.
# IPFS_DATA_PATH=./ipfs-data

# Telegram bot for the domain (optional). Set both TOKEN and NAME to
# enable; leave either blank to disable. TOKEN comes from BotFather,
# NAME is the bot's @-username without the @. The bot ID is auto-
# derived from the token's "<id>:<secret>" prefix.
# TELEGRAM_BOT_TOKEN=123456789:ABCdef-the-rest-of-your-token
# TELEGRAM_BOT_NAME=YourSavvaBot

# Image version to pull (matches a release tag).
# SAVVA_VERSION=latest

# Host port exposed by docker compose. The container always listens
# on 8080 internally; this only changes the port your host binds to.
# PORT=8080

# Verbosity: trace, debug, info, warn, error.
# VERBOSITY=info

# Block to start indexing from on a fresh DB.
# INITIAL_BLOCK=0

# Size limits.
# MAX_FILE_SIZE=50MB
# MAX_POST_SIZE=10MB
# MAX_USER_DISK_SPACE=1GB

# Public website URL for the domain (defaults to https://${DOMAIN}).
# DOMAIN_WEBSITE=https://mysavva.example.com
```

C'est tout le bundle d'installation : deux fichiers dans un même répertoire.

### 2. Remplissez `.env`

Ouvrez `.env` et remplacez les valeurs de remplissage. Sept champs sont requis :

- `DOMAIN`, `ADMIN_ADDRESS`, `DB_CONNECTION_STRING`, `BLOCKCHAIN_RPC`
- `PIN_SERVICE_URL`, `PIN_SERVICE_API_KEY`, `PIN_SERVICE_GATEWAY` (provenant de votre compte de service de pin)

`PROCESSOR_KEY` est optionnel et peut être ajouté plus tard. `IPFS_URL` pointe par défaut vers le service IPFS inclus. Tout ce qui se trouve sous la section `OPTIONAL` a une valeur par défaut sensée et peut rester commenté.

À propos du port. Le conteneur écoute toujours sur `8080` en interne — c'est codé en dur dans l'image. Le mapping Compose `${PORT:-8080}:8080` l'expose sur le port `8080` de l'hôte par défaut, donc `curl http://localhost:8080/info` fonctionne immédiatement. Définissez `PORT=` dans `.env` seulement si vous voulez un port *hôte* différent (par exemple `PORT=9000` si 8080 est déjà pris). Votre reverse proxy dialogue avec le `8080` du conteneur dans tous les cas.

Si vous préférez ne pas coller une clé privée dans un fichier, montez-la comme secret à la place :

```sh
mkdir -p secrets
echo "0xYourProcessorPrivateKey" > secrets/processor.key
chmod 600 secrets/processor.key
```

…et dans `.env` :

```sh
PROCESSOR_KEY=
PROCESSOR_KEY_FILE=/run/secrets/processor.key
```

Le dossier `secrets/` est monté en lecture seule dans le conteneur par le `docker-compose.yml` par défaut. Le conteneur lit la clé depuis le disque au démarrage ; la valeur n'apparaît jamais dans `docker inspect` ni dans la liste des processus.

### 3. Bootstrap de la base de données

Il y a deux façons de remplir la base de données. **La restauration depuis un snapshot est fortement recommandée.**

#### Option A (recommandée) — restaurer depuis un snapshot public

SAVVA publie des snapshots PostgreSQL quotidiens sur [savva.app/public_files/](https://savva.app/public_files/), un par chaîne, nommés comme :

```
savva-db-backup-monad-2026-05-03.sql.gz
savva-db-backup-pls-2026-05-03.sql.gz
```

Choisissez la chaîne que vous indexez (`monad` est la valeur par défaut dans ce guide) et la date la plus récente. Le dump est un SQL gzippé plain — restaurez-le avec `psql` :

```sh
# Pick the latest snapshot for your chain.
SNAP=https://savva.app/public_files/savva-db-backup-monad-2026-05-03.sql.gz

# Empty target database must already exist and match $DB_CONNECTION_STRING.
curl -L "$SNAP" | gunzip -c | psql "$DB_CONNECTION_STRING"
```

Lorsque le backend démarre, il reprend exactement là où le snapshot s'était arrêté — généralement quelques heures derrière le tip — et termine la synchronisation en quelques minutes plutôt qu'en heures.

#### Option B — initialiser un schéma vide et resynchroniser depuis le genesis

Utile si vous exécutez sur une chaîne personnalisée, souhaitez une vérification indépendante, ou voulez simplement voir l'indexeur en action :

```sh
docker compose run --rm savva-backend -initdb
```

Cela crée toutes les tables nécessaires et définit la version du schéma. Le premier `docker compose up -d` ensuite démarre l'indexation depuis le `INITIAL_BLOCK` configuré — attendez-vous à une longue synchronisation initiale.

### 4. Démarrez-le

```sh
docker compose up -d
```

Le conteneur télécharge (≈100 Mo), lit `.env`, génère son propre fichier YAML de config et commence à indexer la blockchain. Surveillez les logs :

```sh
docker compose logs -f savva-backend
```

Un démarrage sain ressemble à ceci :

```
INF Config: Blockchain RPC configured
INF Config: Processor key configured
INF Connected to DB
INF SAVVA Backend. v:1.0.25
```

…suivi de lignes indiquant que l'écouteur blockchain rattrape son retard. Si vous voyez des erreurs à la place, voyez [Dépannage](#troubleshooting).

### 5. Vérifiez

Le backend écoute sur le port `8080`. Depuis la même machine :

```sh
curl http://localhost:8080/info
```

Vous devriez obtenir une réponse JSON décrivant le système : adresses de contrats, votre domaine, la version, les passerelles IPFS, etc. C'est un nœud SAVVA fonctionnel.

## Le mettre sur Internet public

L'image ne termine pas le TLS — c'est volontaire. Les opérateurs veulent des choses différentes (Cloudflare, Caddy, nginx, Traefik, Tailscale Funnel) et le bundle ne choisit pas pour vous. Le minimum est quelque chose qui :

- Écoute sur `:443`, termine le TLS, et fait un proxy vers le `:8080` du conteneur.
- Transfère l'upgrade WebSocket pour l'endpoint `/ws`.
- Route `/api/*` et les URLs de découverte SEO (`/robots.txt`, `/sitemap*.xml`) vers le backend.

Caddy avec `reverse_proxy 127.0.0.1:8080` est un choix raisonnable en deux lignes si vous n'avez pas de préférence. Pour une configuration nginx de niveau production complète, voyez l'exemple dans [`_shared/installation/nginx.conf.example`](/dev_docs/_shared/installation/nginx.conf.example) — c'est la même config utilisée pour tout site sur la plateforme SAVVA.

## Configuration des assets de votre domaine (le bundle UI)

Un backend SAVVA seul ne fournit pas d'interface — il sert l'API et attend que le reverse proxy serve le client web SolidJS depuis un bundle hébergé sur IPFS. Une fois le backend en cours d'exécution :

1. Construisez (ou forkez) le projet [savva-ui-solidjs](https://github.com/AlexNa-Holdings/savva-ui-solidjs), épinglez la sortie de build sur IPFS et récupérez le CID résultant.
2. Depuis un client SAVVA signé par votre portefeuille admin, appelez la commande admin `setDomainAssetsCID` avec le CID. Le backend télécharge le bundle, le stocke sous `data/domain_assets/` et le sert depuis là.

Le CID ne fait **pas** partie du fichier YAML de config — il est défini à l'exécution et persiste dans la base de données. Vous pouvez changer d'UI sans redémarrer le backend.

## Mise à jour vers une nouvelle version

Les releases sont publiées comme images Docker taggées :

```sh
# Pin a specific version (recommended for production):
echo "SAVVA_VERSION=1.0.26" >> .env
docker compose pull
docker compose up -d

# Or just track latest:
docker compose pull && docker compose up -d
```

Les migrations de schéma sont appliquées automatiquement au démarrage. Surveillez les notes de version pour toute version qui modifie le schéma au cas où une étape manuelle serait nécessaire.

## Dépannage

**`ERROR: required env var X is not set`** — un champ requis est manquant dans `.env`. L'erreur indique la variable.

**`dial tcp: connection refused` sur la DB** — le conteneur ne peut pas atteindre Postgres. Si votre BD tourne sur le même hôte que Docker, utilisez `host.docker.internal` (Mac/Windows) ou l'IP LAN de votre machine, pas `localhost`. `localhost` à l'intérieur du conteneur désigne le conteneur lui-même.

**`http: server gave HTTP response to HTTPS client`** pour l'URL IPFS — le schéma est incorrect : `http://` pour un endpoint HTTPS ou l'inverse. Vérifiez l'URL.

**Les logs indiquent `RPC error` de manière répétée** — l'URL RPC est incorrecte, rate-limitée, ou l'ID de chaîne ne correspond pas. Le `CONFIG_CONTRACT` par défaut est pour Monad ; si vous vous connectez à une chaîne différente, définissez `CONFIG_CONTRACT` dans `.env` à l'adresse correcte pour cette chaîne.

**Le conteneur démarre mais rien ne se passe pendant longtemps** — c'est normal si vous avez utilisé l'Option B à l'étape 3 (schéma vide). Le backend synchronise l'historique de la blockchain depuis `INITIAL_BLOCK`, ce qui peut prendre des heures sur une chaîne avec une longue histoire. Surveillez `docker compose logs -f` ; vous verrez les numéros de blocs augmenter. Si vous ne voulez pas attendre, arrêtez le conteneur, videz la base de données et restaurez depuis un snapshot public (Option A).

Si vous rencontrez quelque chose qui n'est pas couvert ici, contactez le support SAVVA avec la sortie de vos `docker compose logs` et votre `.env` assaini (masquez la clé du processor).

## À propos du stockage IPFS

Il y a deux couches de pinning dans une installation SAVVA :

1. **Le nœud Kubo inclus** (le service `ipfs:` dans Compose) conserve chaque fichier téléchargé localement. Il est rapide, gratuit, et immédiatement accessible — mais c'est un point de défaillance unique. Si ce disque meurt, la copie locale disparaît avec lui.
2. **Votre service de pin externe** (configuré via `PIN_SERVICE_*` dans `.env`) prend aussi une copie. Le backend demande au service de pin d'épingler chaque nouveau CID juste après l'avoir ajouté au nœud local, ainsi le contenu de votre communauté est répliqué durablement et reste accessible via la passerelle publique du service même lorsque votre propre nœud est hors ligne.

La combinaison « local rapide + externe durable » explique pourquoi les deux existent. **Ne sautez pas le service de pin externe** à moins que vous ne déployiez un nœud de test jetable — la perte d'un pin est irréversible.

Le datastore IPFS inclus mérite le même traitement que tout autre répertoire d'état en croissance. Contrairement à une base Postgres (schéma fixe qui ne croît que lorsque vous ajoutez des domaines), **le datastore IPFS croît proportionnellement au contenu de votre communauté.** Le bundle inclut `process-all-domains: true` dans la config rendue, donc votre nœud indexe et épingle les posts de **tous les domaines du réseau**, pas seulement le vôtre. C'est volontaire — cela maintient le contenu disponible même quand des opérateurs de domaine individuels sont hors ligne — mais cela signifie aussi que la croissance du datastore suit l'ensemble de la plateforme, pas seulement votre communauté. Planifiez-le comme vous le feriez pour toute autre charge de stockage de pins :

- **Placez le datastore sur le disque que vous êtes prêt à faire croître.** `IPFS_DATA_PATH=` dans `.env` contrôle le chemin hôte. Par défaut c'est `./ipfs-data` à côté du fichier Compose ; pour la production, pointez-le vers un disque ou volume dédié (`/mnt/data1/ipfs`, un volume EBS attaché, etc.).
- **Surveillez l'utilisation du disque.** Il n'y a pas d'alerte automatique si le disque se remplit. Surveillez `du -sh ipfs-data/` (ou là où vous l'avez pointé) et mettez en place une alerte générique d'utilisation disque.
- **Sauvegardez-le comme n'importe quel autre répertoire d'état.** Arrêter le service `ipfs` et rsync le dossier de données est la voie la plus simple.
- **Ouvrez le port 4001 (TCP et UDP).** C'est le port swarm d'IPFS. S'il est bloqué par un pare-feu, le contenu s'épinglera toujours localement mais ne se répliquera pas sur le réseau IPFS plus large. La plupart des fournisseurs cloud exigent que vous ouvriez explicitement ceci dans le groupe de sécurité / pare-feu VPC.
- **Kubo n'impose pas de MaxStorage par défaut.** Si vous voulez un plafond strict avec GC automatique, modifiez `ipfs-data/config` après le premier démarrage et définissez `Datastore.StorageMax` sur une taille comme `"100GB"`.

Si vous exploitez déjà un nœud IPFS et préférez l'utiliser, définissez `IPFS_URL=` dans `.env` pour le pointer et supprimez le bloc de service `ipfs:` du `docker-compose.yml`. Le backend s'en moque.

## Ce qui est volontairement absent de l'image

L'image exécute uniquement le backend. La pile Compose ajoute le service IPFS, mais **PostgreSQL**, **le TLS**, et **le client web** restent de votre responsabilité :

- **PostgreSQL** — les opérateurs ont des opinions bien arrêtées sur les sauvegardes, les réplicas, et managé vs auto-hébergé. L'inclure compliquerait tout cela.
- **TLS** — le choix du reverse proxy vous appartient.
- **Le client web** — distribué via IPFS et épinglé par l'admin, pas intégré à l'image backend.

Une installation « tout-en-un » incluant aussi Postgres, Caddy et l'UI pourra être publiée plus tard comme un fichier Compose séparé pour un usage casual / hobby. Le bundle actuel cible des personnes qui vont exécuter quelque chose qu'elles comptent maintenir.