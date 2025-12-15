# Prérequis

Avant d'installer SAVVA, assurez-vous que votre environnement respecte les exigences suivantes.

## Exigences du serveur

### Matériel

- **Processeur (CPU)** : 2 cœurs ou plus recommandés
- **RAM** : 4 Go minimum, 8 Go recommandés
- **Stockage** : SSD de 50 Go ou plus (augmente avec le contenu)
- **Réseau** : connexion Internet stable avec adresse IP publique

### Système d'exploitation

- **Linux** : Ubuntu 20.04 LTS ou version ultérieure (recommandé)
- **Alternative** : Debian 10+, CentOS 8+, ou toute distribution Linux moderne
- **macOS/Windows** : possible pour le développement, non recommandé en production

## Exigences logicielles

### 1. Base de données PostgreSQL

**Version requise** : PostgreSQL 14 ou ultérieure

Vous avez deux options :

**Option A : Service de base de données géré** (Recommandé pour la production)

Nous recommandons **DigitalOcean Managed Databases** pour les déploiements en production :

- **Avantages** :
  - Sauvegardes automatisées et restauration temporelle
  - Mises à jour et correctifs de sécurité automatiques
  - Haute disponibilité et basculement
  - Surveillance et alertes
  - Aucun overhead d'administration de base de données

- **Configuration** :
  1. Créez un compte DigitalOcean sur https://digitalocean.com
  2. Allez dans Databases → Create Database
  3. Choisissez PostgreSQL 14 ou ultérieur
  4. Sélectionnez votre plan (débute à 15 $/mois)
  5. Choisissez la région du datacenter (proche de votre serveur)
  6. Notez les informations de connexion (host, port, username, password, database name)

**Option B : Auto-hébergé** (Pour le développement ou configurations personnalisées)

Installez PostgreSQL sur votre propre serveur :

```bash
# Required version check
psql --version  # Should output: psql (PostgreSQL) 14.x or higher
```

Installation sur Ubuntu :
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Stockage IPFS

SAVVA nécessite **à la fois** un nœud IPFS local ET un service de pinning externe pour un stockage de contenu fiable.

**A. Nœud IPFS local** (Requis)

Installez et lancez un nœud IPFS local pour la gestion du contenu :

```bash
# Install IPFS Kubo
wget https://dist.ipfs.tech/kubo/v0.24.0/kubo_v0.24.0_linux-amd64.tar.gz
tar -xvzf kubo_v0.24.0_linux-amd64.tar.gz
cd kubo
sudo bash install.sh

# Initialize IPFS
ipfs init

# Configure IPFS (optional: increase connection limits)
ipfs config Datastore.StorageMax 50GB

# Start IPFS daemon
ipfs daemon
```

Pour la production, configurez IPFS en tant que service système :
```bash
sudo nano /etc/systemd/system/ipfs.service
```

```ini
[Unit]
Description=IPFS Daemon
After=network.target

[Service]
Type=simple
User=youruser
ExecStart=/usr/local/bin/ipfs daemon
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable ipfs
sudo systemctl start ipfs
```

**B. Service de pinning externe** (Requis)

Pour garantir la permanence et la disponibilité du contenu, vous **devez** vous abonner à au moins un service de pinning IPFS :

**Services recommandés :**

1. **Pinata** (https://pinata.cloud)
   - Forfait gratuit : 1 Go de stockage
   - Forfaits payants disponibles
   - Intégration API facile
   - **Passerelle publique** : `https://gateway.pinata.cloud/ipfs/`

2. **Web3.Storage** (https://web3.storage)
   - Forfait gratuit disponible
   - Basé sur Filecoin
   - API simple
   - **Passerelle publique** : `https://w3s.link/ipfs/`

3. **Filebase** (https://filebase.com)
   - API compatible S3
   - Pinning IPFS inclus
   - Stockage géo-redondant
   - **Passerelle publique** : `https://ipfs.filebase.io/ipfs/`

4. **NFT.Storage** (https://nft.storage)
   - Gratuit pour le contenu NFT
   - Limité aux cas d'utilisation NFT
   - **Passerelle publique** : `https://nftstorage.link/ipfs/`

**Important** : Choisissez un service qui fournit une URL de **passerelle IPFS publique**. Cette passerelle permet aux utilisateurs d'accéder au contenu même s'ils n'ont pas IPFS installé.

**Étapes de configuration :**

1. Créez un compte chez le service de pinning choisi
2. Générez une clé API
3. Notez l'URL de la passerelle publique
4. Configurez le backend avec :
   - Les identifiants API du service de pinning
   - L'URL de la passerelle publique pour la récupération du contenu
5. Testez la connexion avant la mise en production

**Pourquoi les deux sont nécessaires :**

- **Nœud IPFS local** : téléchargement/téléversement de contenu rapide, cache local, participation au réseau
- **Service de pinning** : garantit la permanence du contenu, la redondance et une haute disponibilité même lorsque votre serveur est hors ligne

### 3. Serveur web (Production)

Pour le déploiement en production :

**Nginx** (recommandé) :
```bash
sudo apt install nginx
```

**Apache** (alternative) :
```bash
sudo apt install apache2
```

### 4. Certificat SSL

Pour HTTPS (requis en production) :

**Utilisation de Let's Encrypt** (gratuit) :
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Exigences blockchain

### Fournisseur Web3

Vous avez besoin d'accès à un réseau blockchain compatible Ethereum. SAVVA prend en charge les connexions HTTP(S) et WebSocket (WSS).

**Types de connexion :**

- **HTTPS RPC** : `https://rpc.example.com` - Connexion HTTP standard
- **WSS RPC** : `wss://rpc.example.com` - **Recommandé** pour un traitement d'événements plus rapide et des mises à jour en temps réel

**Recommandation : utilisez WSS** pour les déploiements en production afin de bénéficier de :
- Surveillance d'événements blockchain en temps réel
- Confirmations de transactions plus rapides
- Latence réduite pour les interactions utilisateur

**Option A : Fournisseurs de nœuds (recommandé)**

Nous recommandons d'utiliser **AllNodes** ou des fournisseurs de nœuds gérés similaires :

1. **AllNodes** (https://www.allnodes.com)
   - Prend en charge PulseChain, Ethereum et d'autres chaînes EVM
   - Points de terminaison HTTPS et WSS
   - Haute disponibilité et redondance
   - Forfaits à partir d'environ 20 $/mois

2. **Alternatives** :
   - **Infura** (https://infura.io) - Ethereum, Polygon, Arbitrum
   - **Alchemy** (https://alchemy.com) - Plusieurs chaînes
   - **QuickNode** (https://quicknode.com) - Large support de chaînes
   - **GetBlock** (https://getblock.io) - Protocoles multiples

**Étapes de configuration** :
1. Créez un compte chez le fournisseur choisi
2. Créez un nouveau nœud/point de terminaison pour votre chaîne (par ex., PulseChain)
3. Récupérez les URLs des points de terminaison HTTPS et WSS
4. Configurez le backend pour utiliser le point de terminaison WSS pour des performances optimales

**Option B : Nœud auto-hébergé**

Exécutez votre propre nœud blockchain pour un contrôle maximal :

- **Avantages** : Contrôle total, pas de dépendance à un tiers, pas de limites de taux
- **Inconvénients** : Nécessite des ressources importantes, maintenance continue
- **Stockage** : SSD de 500 Go ou plus (augmente avec le temps)
- **Temps de synchronisation** : plusieurs heures à plusieurs jours selon la chaîne

Pour PulseChain :
```bash
# Example: Running a PulseChain node with go-pulse
# See official PulseChain documentation for detailed setup
```

**Exigences réseau** :
- URL du point de terminaison RPC (HTTPS ou WSS)
- **Recommandé** : point de terminaison WSS pour un traitement d'événements plus rapide
- Clé privée pour le déploiement des contrats (si vous déployez sur un réseau neuf)
- Tokens natifs pour les frais de gaz (PLS pour PulseChain, ETH pour Ethereum, etc.)

**Remarque** : Tous les contrats intelligents nécessaires à SAVVA sont déjà déployés sur PulseChain. Voir [Official Contract Addresses](../licenses/official-contracts.md) pour la liste complète.

## Configuration réseau

### Ports du pare-feu

Ouvrez les ports suivants :

- **80** : HTTP (redirection vers HTTPS)
- **443** : HTTPS (interface utilisateur)
- **8080** : API backend (peut être interne uniquement)
- **4001** : IPFS Swarm (si vous exécutez IPFS localement)
- **5001** : API IPFS (localhost uniquement)
- **8545** : RPC Ethereum (si vous exécutez un nœud local)

Exemple avec `ufw` :
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8080/tcp  # Or keep internal
sudo ufw enable
```

### Configuration DNS

Pointez votre domaine vers votre serveur :
- **Enregistrement A** : `yourdomain.com` → IP du serveur
- **Enregistrement A** : `www.yourdomain.com` → IP du serveur (optionnel)

**Remarque** : L'API backend est servie depuis le même domaine sur le chemin `/api` (par ex., `https://yourdomain.com/api`), donc aucun sous-domaine séparé n'est nécessaire.

## Liste de vérification de validation

Avant de continuer, vérifiez tous les prérequis :

- Serveur avec ressources adéquates (2+ cœurs CPU, 4 Go+ RAM, 50 Go+ SSD)
- PostgreSQL 14+ installé et en cours d'exécution (ou base de données gérée configurée)
- Nœud IPFS exécuté en tant que service systemd
- Service de pinning IPFS configuré avec passerelle publique
- Serveur web Nginx ou Apache installé
- Nom de domaine avec DNS configuré
- Certificat SSL obtenu
- Accès RPC blockchain configuré (de préférence WSS)
- Ports du pare-feu ouverts