# Configuration du site UI

Ce guide couvre l'installation et le déploiement du frontend SAVVA UI.

## Vue d'ensemble

Le SAVVA UI est une application monopage (SPA) basée sur SolidJS qui fournit :
- Interface de création et de navigation de contenu
- Intégration de portefeuilles Web3
- Téléversements de fichiers vers IPFS
- Interactions avec les contrats intelligents
- Prise en charge multilingue

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

L'UI récupère automatiquement les adresses des contrats blockchain depuis l'endpoint `/info` du backend, qui lit à partir du contrat Config.

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

Le dossier buildé `dist/` contient des fichiers statiques qui peuvent être servis par n'importe quel serveur web.

#### Utilisation de Nginx (recommandé)

SAVVA nécessite une configuration Nginx complète qui gère :
- La distribution des fichiers statiques de l'UI
- Le proxy de l'API backend sur `/api`
- Le prérendu pour les bots (SEO)
- Un endpoint de configuration dynamique
- Le support WebSocket

**Télécharger le template complet de configuration Nginx :**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Voir l'exemple complet** : [nginx.conf.example](nginx.conf.example)

**Principales fonctionnalités incluses :**
1. Redirection HTTP vers HTTPS
2. Configuration SSL/TLS (certificats Cloudflare Origin ou Let's Encrypt)
3. Endpoint `/default_connect.yaml` - fournit les URLs du backend et de la passerelle IPFS à l'UI
4. Prérendu pour les bots - rendu côté serveur optimisé pour le SEO et les réseaux sociaux
5. Proxy `/api` - relaie les requêtes API vers le backend sur le port 7000
6. Support WebSocket - pour les fonctionnalités en temps réel
7. Distribution des fichiers statiques avec routage SPA
8. Mise en cache intelligente - `index.html` jamais mis en cache, les assets mis en cache pendant 1 an

**Personnaliser la configuration :**

Modifiez ces variables clés dans le fichier téléchargé :

```nginx
# Your domain
server_name yourdomain.com;

# IPFS gateway (Pinata, Filebase, or custom)
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

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

#### Utilisation d'Apache

Créer la configuration Apache :

```bash
sudo nano /etc/apache2/sites-available/savva-ui.conf
```

Configuration Apache :

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com

    # Redirect to HTTPS
    Redirect permanent / https://yourdomain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com

    DocumentRoot /var/www/savva-ui

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/yourdomain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/yourdomain.com/privkey.pem

    # SPA routing
    <Directory /var/www/savva-ui>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # Fallback to index.html for SPA routing
        FallbackResource /index.html
    </Directory>

    # Security headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"

    # Compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css application/javascript application/json
    </IfModule>
</VirtualHost>
```

Activer le site :

```bash
sudo a2enmod ssl rewrite headers deflate
sudo a2ensite savva-ui
sudo systemctl reload apache2
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

Exécuter le déploiement :

```bash
./deploy.sh
```

### Option C : Déploiement avec Docker

Créer le Dockerfile :

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Builder et exécuter :

```bash
# Build image
docker build -t savva-ui .

# Run container
docker run -d -p 80:80 --name savva-ui savva-ui
```

## 6. Vérifier l'installation

Tester l'UI :

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Ouvrir dans le navigateur :
- Accédez à `https://yourdomain.com`
- L'UI doit se charger et se connecter au backend
- Vérifiez la console du navigateur pour d'éventuelles erreurs

## 7. Configuration après déploiement

### Mettre à jour le CORS du backend

Assurez-vous que le backend autorise le domaine de votre UI :

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

## 8. Déploiement continu

### GitHub Actions

Créer `.github/workflows/deploy.yml` :

```yaml
name: Deploy UI

on:
  push:
    branches: [ prod ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm ci

    - name: Build
      run: npm run build

    - name: Deploy via SCP
      uses: appleboy/scp-action@master
      with:
        host: ${{ secrets.DEPLOY_HOST }}
        username: ${{ secrets.DEPLOY_USER }}
        key: ${{ secrets.DEPLOY_SSH_KEY }}
        source: "dist/*"
        target: "/var/www/savva-ui"
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
- Consultez la console du navigateur pour des erreurs
- Testez la santé du backend : `curl https://api.yourdomain.com/api/info`

### Page blanche / écran blanc

- Vérifiez la console du navigateur pour les erreurs JavaScript
- Vérifiez que tous les assets sont correctement chargés
- Contrôlez la configuration Nginx/Apache pour le routage SPA
- Assurez-vous que `try_files` ou `FallbackResource` est configuré

### Le portefeuille Web3 ne se connecte pas

- Vérifiez si HTTPS est activé (requis pour Web3)
- Vérifiez que l'URL RPC blockchain est accessible
- Vérifiez que l'extension de portefeuille du navigateur est installée
- Passez en revue les en-têtes de Content Security Policy