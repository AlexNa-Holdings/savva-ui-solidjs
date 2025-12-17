# Configuration du site UI

Ce guide couvre l'installation et le déploiement du frontend SAVVA UI.

## Aperçu

L'UI SAVVA est une application mono-page (SPA) basée sur SolidJS qui fournit :
- Interface de création et de navigation de contenu
- Intégration de portefeuilles Web3
- Téléversements de fichiers vers IPFS
- Interactions avec des smart contracts
- Support multilingue

## 1. Cloner le dépôt

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Installer les dépendances

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Configuration

### Créer le fichier d'environnement

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Variables d'environnement

```bash
# .env - SAVVA UI Configuration

# ============================================================================
# Application Configuration
# ============================================================================

# Backend API URL
VITE_BACKEND_URL=https://api.yourdomain.com

# Main website URL
VITE_WEBSITE_URL=https://yourdomain.com

# IPFS Gateway URL
VITE_IPFS_GATEWAY=https://ipfs.io
# Or use your own gateway:
# VITE_IPFS_GATEWAY=https://ipfs.yourdomain.com

# ============================================================================
# Build Configuration (Optional)
# ============================================================================

# Git branches for deployment
GIT_MAIN_BRANCH=main
PROD_BRANCH=prod

# ============================================================================
# Deployment via SSH (Optional)
# ============================================================================

# Server details for automated deployment
DEPLOY_HOST=yourdomain.com
DEPLOY_USER=deploy
DEPLOY_PATH=/var/www/savva-ui
DEPLOY_PORT=22
```

### Configuration supplémentaire

L'UI récupère automatiquement les adresses des contrats blockchain depuis le point de terminaison backend `/info`, qui lit depuis le contrat Config.

Aucune adresse de contrat codée en dur n'est nécessaire dans la configuration de l'UI.

## 4. Construire l'UI

### Build de développement

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Build de production

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Build avec déploiement

```bash
# Automated build + deploy (if DEPLOY_* vars configured)
npm run release

# This will:
# 1. Increment version
# 2. Run i18n scripts
# 3. Build production bundle
# 4. Commit and tag in git
# 5. Create GitHub release
# 6. Deploy via SCP (if configured)
```

## 5. Déployer en production

### Option A : Hébergement de fichiers statiques

Le dossier construit `dist/` contient des fichiers statiques pouvant être servis par n'importe quel serveur web.

#### Utiliser Nginx (recommandé)

SAVVA nécessite une configuration Nginx complète qui gère :
- Service des fichiers statiques de l'UI
- Proxy de l'API backend sur `/api`
- Prérendu pour les bots SEO
- Point de terminaison de configuration dynamique
- Support WebSocket

**Téléchargez le modèle complet de configuration Nginx :**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Voir l'exemple complet** : [nginx.conf.example](nginx.conf.example)

**Fonctionnalités clés incluses :**
1. Redirection HTTP vers HTTPS
2. Configuration SSL/TLS (certificats Cloudflare Origin ou Let's Encrypt)
3. **/default_connect.yaml** - point de terminaison **requis** pour la configuration dynamique de l'UI
4. Prérendu pour bots - rendu côté serveur adapté au SEO et aux réseaux sociaux
5. Proxy `/api` - redirige les requêtes API vers le backend sur le port 7000
6. Support WebSocket - pour les fonctionnalités en temps réel
7. Service de fichiers statiques avec routage SPA
8. Caching intelligent - `index.html` jamais mis en cache, actifs mis en cache pendant 1 an

### Comprendre default_connect.yaml

L'UI requiert un point de terminaison `/default_connect.yaml` qui lui indique où trouver le backend et la passerelle IPFS. Ceci est configuré directement dans Nginx à l'aide de variables :

```nginx
# Define your deployment settings
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

# Serve dynamic configuration to the UI
location = /default_connect.yaml {
    add_header Content-Type text/plain;
    return 200 'domain: $default_domain
backendLink: $default_backend
default_ipfs_link: $default_ipfs';
}
```

Ce point de terminaison renvoie une réponse YAML comme :
```yaml
domain: yourdomain.com
backendLink: https://yourdomain.com/api/
default_ipfs_link: https://gateway.pinata.cloud/ipfs/
```

L'UI récupère cette configuration au démarrage pour savoir où se connecter.

**Personnaliser la configuration :**

Modifiez ces variables clés dans le fichier téléchargé :

```nginx
# Your domain
server_name yourdomain.com;

# Dynamic configuration variables
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";  # Or Filebase, etc.

# Path to UI build files
root /var/www/savva-ui;

# SSL certificates (Cloudflare or Let's Encrypt)
ssl_certificate     /etc/ssl/cloudflare/yourdomain.com.crt;
ssl_certificate_key /etc/ssl/cloudflare/yourdomain.com.key;
```

**Déployer les fichiers et activer le site :**

```bash
# Create web directory
sudo mkdir -p /var/www/savva-ui

# Copy built files
sudo cp -r dist/* /var/www/savva-ui/

# Set permissions
sudo chown -R www-data:www-data /var/www/savva-ui

# Install Nginx config
sudo cp nginx.conf.example /etc/nginx/sites-available/yourdomain.com

# Enable site
sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Option B : Script de déploiement automatisé

Créer le script de déploiement :

```bash
nano deploy.sh
chmod +x deploy.sh
```

Contenu du script :

```bash
#!/bin/bash
# deploy.sh - SAVVA UI Deployment Script

set -e  # Exit on error

SERVER="deploy@yourdomain.com"
REMOTE_PATH="/var/www/savva-ui"
BUILD_DIR="dist"

echo "Building UI..."
npm run build

echo "Deploying to server..."
rsync -avz --delete "${BUILD_DIR}/" "${SERVER}:${REMOTE_PATH}/"

echo "Setting permissions..."
ssh "${SERVER}" "sudo chown -R www-data:www-data ${REMOTE_PATH}"

echo "Deployment complete!"
echo "Visit https://yourdomain.com"
```

Lancer le déploiement :

```bash
./deploy.sh
```

## 6. Vérifier l'installation

Tester l'UI :

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Ouvrir dans le navigateur :
- Rendez-vous sur `https://yourdomain.com`
- L'UI doit se charger et se connecter au backend
- Vérifiez la console du navigateur pour d'éventuelles erreurs

## 7. Configuration post-déploiement

### Mettre à jour le CORS du backend

Assurez-vous que le backend autorise votre domaine UI :

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Configurer un CDN (optionnel)

Pour de meilleures performances, envisagez d'utiliser un CDN :

- **Cloudflare** : Ajoutez le site à Cloudflare, mettez à jour les DNS
- **AWS CloudFront** : Créez une distribution pointant vers l'origine
- **Autres CDN** : Suivez la documentation du fournisseur

### Mettre en place la surveillance

Ajoutez une surveillance pour la disponibilité et les erreurs :

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## Dépannage

### Échec de la compilation

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Problèmes de connexion au backend

- Vérifiez `VITE_BACKEND_URL` dans `.env`
- Vérifiez la configuration CORS du backend
- Consultez la console du navigateur pour les erreurs
- Testez la santé du backend : `curl https://api.yourdomain.com/api/info`

### Page blanche / écran blanc

- Vérifiez la console du navigateur pour les erreurs JavaScript
- Vérifiez que tous les assets sont chargés correctement
- Vérifiez la configuration Nginx pour le routage SPA
- Assurez-vous que la directive `try_files` est configurée correctement

### Le portefeuille Web3 ne se connecte pas

- Vérifiez si HTTPS est activé (requis pour Web3)
- Vérifiez que l'URL RPC blockchain est accessible
- Assurez-vous que l'extension de portefeuille du navigateur est installée
- Vérifiez les en-têtes de Content Security Policy