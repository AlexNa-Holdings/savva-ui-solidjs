# Configuration du serveur backend

Ce guide couvre l'installation et la configuration du serveur backend SAVVA.

## Aperçu

Le backend SAVVA est un serveur API écrit en Go qui gère :
- Authentification des utilisateurs et sessions
- Stockage et récupération des posts (PostgreSQL)
- Intégration IPFS pour le stockage de contenu
- Connexions WebSocket pour les mises à jour en temps réel
- Interaction et surveillance de la blockchain

## 1. Téléchargement du logiciel Backend

Le dernier logiciel backend SAVVA est disponible à :

**https://savva.app/public_files/**

**Remarques importantes** :
- Le backend est actuellement en développement actif - vérifiez régulièrement les nouvelles versions
- Le backend n'est pas encore open source. Nous prévoyons de le rendre open source à l'avenir
- Téléchargez la dernière version adaptée à votre plateforme (généralement `savva-backend-linux-amd64`)

```bash
# Download latest backend
cd /opt
sudo wget https://savva.app/public_files/savva-backend-linux-amd64

# Make executable
sudo chmod +x savva-backend-linux-amd64
sudo mv savva-backend-linux-amd64 savva-backend
```

## 2. Configuration de la base de données

### Option A : Restaurer depuis le dernier instantané (recommandé)

Pour réduire le temps de synchronisation, vous pouvez restaurer depuis le dernier instantané de la base de données. L'instantané inclut :
- Toute la structure de base de données nécessaire
- Toutes les informations de contenu provenant du réseau SAVVA
- **Aucune information personnelle des utilisateurs** (respect de la vie privée)

La base de données est sauvegardée automatiquement chaque jour et est disponible à :

**https://savva.app/public_files/**

Recherchez des fichiers comme `savva-db-backup-YYYY-MM-DD.sql.gz`

```bash
# Download latest database backup
wget https://savva.app/public_files/savva-db-backup-latest.sql.gz

# Create database and user
sudo -u postgres psql << 'EOF'
CREATE DATABASE savva;
CREATE USER savva_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE savva TO savva_user;
\q
EOF

# Restore from backup
gunzip -c savva-db-backup-latest.sql.gz | sudo -u postgres psql savva

# Grant permissions to your user
sudo -u postgres psql savva << 'EOF'
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO savva_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO savva_user;
\q
EOF
```

### Option B : Base de données vierge (pour le développement)

Si vous préférez repartir de zéro :

```bash
# Create database and user
sudo -u postgres psql << 'EOF'
CREATE DATABASE savva;
CREATE USER savva_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE savva TO savva_user;
\q
EOF
```

Remarque : Le backend créera automatiquement les tables nécessaires au premier lancement.

## 3. Configuration

Créez le fichier de configuration du backend SAVVA à `/etc/savva.yml`.

### Télécharger le modèle de configuration

Un exemple complet de configuration est disponible :

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/savva.yml.example

# Or view it locally at:
# public/dev_docs/en/installation/savva.yml.example

# Copy to system location
sudo cp savva.yml.example /etc/savva.yml
sudo chmod 600 /etc/savva.yml  # Protect configuration file
```

**Voir l'exemple complet** : [savva.yml.example](savva.yml.example)

### Paramètres de configuration

#### Paramètres de la blockchain

```yaml
blockchain-rpc: wss://your-rpc-endpoint.com:8546/your-api-key
initial-block: 20110428  # Starting block number for sync
```

- **blockchain-rpc** : point de terminaison RPC WebSocket (WSS recommandé pour les événements en temps réel)
  - Obtenez-le auprès de AllNodes, Infura, ou votre propre nœud
  - Format : `wss://hostname:port/api-key`
- **initial-block** : numéro de bloc à partir duquel commencer la synchronisation (pour éviter l'historique ancien)

#### Contrats

```yaml
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8
```

Utilisez l'adresse officielle du contrat Config de SAVVA depuis [Official Contract Addresses](../licenses/official-contracts.md).

#### Configuration de la base de données

```yaml
db:
  type: postgres
  connection-string: postgresql://username:password@host:port/database?sslmode=require
```

- **Pour DigitalOcean Managed Database** : copiez la chaîne de connexion depuis le tableau de bord DigitalOcean
- **Pour une installation auto-hébergée** : `postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable`

#### Paramètres du serveur

```yaml
server:
  port: 7000
  url-prefix: "/api"
  rpm-limit: 600  # Requests per minute limit
  cors-allowed-origins:
    - yourdomain.com
    - www.yourdomain.com
```

- **port** : port de l'API backend (par défaut : 7000)
- **url-prefix** : préfixe du chemin API (généralement "/api")
- **rpm-limit** : limitation de débit (requêtes par minute par IP)
- **cors-allowed-origins** : liste des domaines autorisés pour CORS

#### Configuration IPFS

```yaml
ipfs:
  url: http://localhost:5001
  max-file-size: 100 MB
  timeout: 2m
  pin-services:
    - name: pinata
      url: https://api.pinata.cloud/pinning
      api-key: YOUR_PINATA_JWT_TOKEN
    - name: filebase
      url: https://api.filebase.io/v1/ipfs
      api-key: YOUR_FILEBASE_API_KEY
  gateways:
    - https://gateway.pinata.cloud/ipfs/
    - https://ipfs.filebase.io/ipfs/
```

- **url** : point de terminaison de l'API IPFS locale
- **pin-services** : configurez vos services de pinning avec les clés API
- **gateways** : gateways IPFS publiques pour la récupération du contenu

#### Contenu et stockage

```yaml
content-retry-delay: 5m
max-content-retries: 3
temp-folder: /tmp/savva
data-folder: /var/lib/savva
max-user-disk-space: 50 MB
max-post-size: 50 MB
```

- **data-folder** : stockage permanent pour les actifs du domaine
- **temp-folder** : stockage temporaire des fichiers
- **max-post-size** : taille maximale pour un seul post

#### Mise en cache

```yaml
user-cache-ttl: 6h
post-cache-ttl: 6h
```

Durée de vie (TTL) des données en cache.

#### Recherche en texte intégral

```yaml
full-text-search:
  enabled: true
  languages: [english, russian, french]
```

Activez la recherche en texte intégral de PostgreSQL avec les langues souhaitées.

#### Journalisation

```yaml
verbosity: info  # Options: trace, debug, info, warn, error
log-prefix: SAVVA
```

#### Configuration de domaine

```yaml
process-all-domains: true
domains:
  yourdomain.com:
    website: https://yourdomain.com
    admins:
      0xYourAdminAddress:
        alerts: all
    telegram-bot:
      enabled: false
```

- **process-all-domains** : définissez sur `true` pour traiter tous les domaines du réseau SAVVA
- **domains** : configurez les paramètres spécifiques aux domaines (optionnel)

### Exemple complet de configuration

```yaml
# /etc/savva.yml - SAVVA Backend Configuration

# Blockchain
blockchain-rpc: wss://pls-rpc.example.com:8546/your-api-key
initial-block: 20110428

# Contracts (use official addresses)
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8

# Database
db:
  type: postgres
  connection-string: postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable

# Server
server:
  port: 7000
  url-prefix: "/api"
  rpm-limit: 600
  cors-allowed-origins:
    - yourdomain.com
    - www.yourdomain.com

# IPFS
ipfs:
  url: http://localhost:5001
  max-file-size: 100 MB
  timeout: 2m
  pin-services:
    - name: pinata
      url: https://api.pinata.cloud/pinning
      api-key: YOUR_PINATA_JWT_TOKEN
  gateways:
    - https://gateway.pinata.cloud/ipfs/

# Content & Storage
content-retry-delay: 5m
max-content-retries: 3
temp-folder: /tmp/savva
data-folder: /var/lib/savva
max-user-disk-space: 50 MB
max-post-size: 50 MB

# Caching
user-cache-ttl: 6h
post-cache-ttl: 6h

# Full-Text Search
full-text-search:
  enabled: true
  languages: [english]

# Logging
verbosity: info
log-prefix: SAVVA

# Domain Processing
process-all-domains: true
```

### Créer les répertoires de stockage

```bash
sudo mkdir -p /var/lib/savva
sudo mkdir -p /tmp/savva
sudo chown -R your-user:your-user /var/lib/savva /tmp/savva
```

## 4. Exécuter le backend

### Tester la configuration

```bash
# Test run to verify configuration
cd /opt
./savva-backend --config /etc/savva.yml
```

Appuyez sur Ctrl+C pour arrêter s'il démarre correctement.

### Configurer le service systemd

Créez le fichier de service systemd :

```bash
sudo nano /etc/systemd/system/savva-backend.service
```

```ini
[Unit]
Description=SAVVA Backend API Server
After=network.target postgresql.service ipfs.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/opt
ExecStart=/opt/savva-backend --config /etc/savva.yml
Restart=always
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Activer et démarrer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable savva-backend
sudo systemctl start savva-backend
sudo systemctl status savva-backend

# View logs
sudo journalctl -u savva-backend -f
```

## 5. Vérifier l'installation

```bash
# Test backend health (local)
curl http://localhost:7000/api/health

# Should return: {"status":"ok"}
```

Vous devriez voir une réponse JSON indiquant que le backend est en cours d'exécution. Les journaux du backend peuvent être consultés avec :

```bash
# View real-time logs
sudo journalctl -u savva-backend -f

# View recent logs
sudo journalctl -u savva-backend -n 100
```