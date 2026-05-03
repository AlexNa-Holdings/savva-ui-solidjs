# Configuration du site UI

Ce guide couvre l'installation et le déploiement du frontend SAVVA UI.

## Aperçu

Le SAVVA UI est une application monopage (SPA) basée sur SolidJS qui fournit :
- Interface de création et de navigation de contenu
- Intégration de portefeuilles Web3
- Téléversements de fichiers sur IPFS
- Interactions avec des contrats intelligents
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

### Configuration additionnelle

L'UI récupère automatiquement les adresses des contrats blockchain depuis le point de terminaison backend `/info`, qui lit depuis le contrat Config.

Aucune adresse de contrat codée en dur n'est nécessaire dans la configuration de l'UI.

## 4. Compiler l'UI

### Version de développement

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Version de production

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Compilation avec déploiement

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

Le dossier `dist/` généré contient des fichiers statiques qui peuvent être servis par n'importe quel serveur web.

#### Utilisation de Nginx (recommandé)

SAVVA nécessite une configuration Nginx complète qui gère :
- Service des fichiers statiques de l'UI
- Proxy de l'API backend sur `/api`
- Prerendering pour les bots SEO et découverte (`/robots.txt`, `/sitemap*.xml`)
- Point de configuration dynamique
- Prise en charge de WebSocket

**Téléchargez le modèle complet de configuration Nginx :**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/_shared/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/_shared/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

Voir l'exemple complet : [nginx.conf.example](/dev_docs/_shared/installation/nginx.conf.example)

Principales fonctionnalités incluses :
1. Redirection HTTP vers HTTPS
2. Configuration SSL/TLS (certificats Cloudflare Origin ou Let's Encrypt)
3. Point de terminaison `/default_connect.json` - configuration dynamique **requise** pour l'UI (`.yaml` également pris en charge en secours)
4. Prerendering pour bots - HTML rendu côté serveur pour les moteurs de recherche, crawlers IA et générateurs d'aperçus de liens (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple; GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot, ...; Telegram, X, Facebook, Discord, Slack, WhatsApp, iMessage, LinkedIn, Reddit, Pinterest)
5. Routes de découverte SEO - `/robots.txt`, `/sitemap.xml` et `/sitemap-*.xml` proxyfiées vers le backend par domaine
6. Proxy `/api` - redirige les requêtes API vers le backend sur le port 7000
7. Prise en charge des WebSockets - pour les fonctionnalités en temps réel
8. Service de fichiers statiques avec routage SPA
9. Cache intelligent - `index.html` jamais mis en cache, assets mis en cache pendant 1 an

#### Ce que la surface SEO vous apporte

Avec cette configuration en place, le backend fournit aux crawlers une version HTML entièrement rendue de chaque page (corps de l'article, auteur, dates de publication/mise à jour, tags, données structurées, balises Open Graph avec dimensions d'image correctes) tandis que les utilisateurs obtiennent toujours la SPA rapide sous SolidJS. Les sitemaps et `robots.txt` par domaine sont générés par le backend, ainsi chaque domaine de votre nœud obtient sa propre surface de découverte, sa politique pour les crawlers IA et ses URLs canoniques.

Pour que cela fonctionne, trois conditions doivent être remplies :

1. Le backend (`savva-backend`) doit être sur une version qui fournit les endpoints `/api/render`, `/api/robots.txt` et `/api/sitemap*.xml`.
2. Votre domaine doit avoir une entrée sous `domains:` dans `/etc/savva.yml`, et sa clé doit correspondre exactement à la valeur `set $default_domain "..."` dans cette configuration Nginx.
3. Le routage Nginx ci-dessous doit être en place. (La configuration par défaut utilisée par de nombreuses anciennes installations contient une regex pour bots datant de 2018 qui manque tous les crawlers IA, aucun rewrite pour `/robots.txt` ou `/sitemap.xml`, et un pattern de rewrite obsolète `/api/render/$scheme://$host$uri` que le backend n'accepte plus. Si vous mettez à jour depuis une ancienne config, remplacez ces trois éléments.)

### Comprendre default_connect.json

L'UI requiert un point de terminaison `/default_connect.json` qui lui indique où trouver le backend, quelles chaînes il prend en charge et la passerelle IPFS (il prend aussi en charge `/default_connect.yaml` en tant que secours). Cela se configure directement dans Nginx.

L'UI accepte deux schémas — choisissez celui qui correspond à votre déploiement. Le nouveau format `chains` est préféré pour les sites multi-chaînes ou nouveaux ; l'ancien format `backendLink` fonctionne toujours.

Nouveau format (multi-chaîne) :

```nginx
set $default_domain "yourdomain.com";

location = /default_connect.json {
    default_type application/json;
    return 200 '{
        "domain": "$default_domain",
        "chains": [
            {"chainId": 369, "rpc": "https://yourdomain.com/api/"}
        ],
        "default_ipfs_link": "https://gateway.pinata.cloud/ipfs/"
    }';
}
```

Format legacy (backend unique) :

```nginx
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

location = /default_connect.json {
    default_type application/json;
    return 200 '{"domain":"$default_domain","backendLink":"$default_backend","default_ipfs_link":"$default_ipfs"}';
}
```

L'UI récupère cette configuration au démarrage. La valeur `domain` doit correspondre à une clé sous `domains:` dans votre `/etc/savva.yml`, et c'est également ce que les réécritures SEO transmettent au backend en tant que `?domain=` afin qu'il sache quelle configuration de domaine rendre.

Personnalisez la configuration :

Éditez ces variables clés dans le fichier téléchargé :

```nginx
# Your domain
server_name www.yourdomain.com yourdomain.com;

# MUST match a key under `domains:` in /etc/savva.yml. Used by the SEO
# rewrites as ?domain= and embedded into /default_connect.json.
set $default_domain "yourdomain.com";

# Path to UI build files
root /var/www/savva-ui;

# SSL certificates (Cloudflare or Let's Encrypt)
ssl_certificate     /etc/ssl/cloudflare/yourdomain.com.crt;
ssl_certificate_key /etc/ssl/cloudflare/yourdomain.com.key;
```

Mettez ensuite à jour le `chainId` / `rpc` (ou les variables legacy `set $default_backend` / `set $default_ipfs`) à l'intérieur du bloc `/default_connect.json` pour correspondre à votre chaîne.

Déployez les fichiers et activez le site :

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

### Tests de fumée de la surface SEO

Après le rechargement de Nginx, vérifiez que les bots, crawlers et fichiers de découverte atteignent correctement le backend. Remplacez `yourdomain.com` par votre nom d'hôte réel.

```bash
# 1. Bot path returns rendered HTML (post body, title, OG tags), NOT the SPA shell.
curl -sA "Googlebot" https://yourdomain.com/ | head -10
# Expect: <!DOCTYPE html><html lang="en"><head>...<title>...</title>

# 2. robots.txt comes from the backend (per-domain), not nginx's default 404.
curl -s https://yourdomain.com/robots.txt
# Expect: User-agent: * / Disallow: /api/ ... / Sitemap: https://...

# 3. Sitemap index.
curl -s https://yourdomain.com/sitemap.xml | head -5
# Expect: <?xml version="1.0"...?><sitemapindex...

# 4. Modern AI crawler is also rendered (proves the new UA regex works).
curl -sA "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" \
  https://yourdomain.com/ | grep -E "og:title|<title>" | head -3

# 5. Human path STILL gets the SPA shell (regression check).
curl -sA "Mozilla/5.0 Chrome/120" https://yourdomain.com/ | head -5
# Expect: SPA shell (small index.html), NOT bot-rendered HTML.
```

Si l'un de ces tests retourne la SPA shell alors qu'il ne devrait pas (ou inversement), les causes les plus fréquentes sont :

- Le backend n'exécute pas encore une version qui fournit `/api/render`, `/api/robots.txt` et `/api/sitemap*.xml`.
- La valeur `set $default_domain "..."` dans votre configuration Nginx ne correspond pas à une clé sous `domains:` dans `/etc/savva.yml`.
- Votre upstream `/api` n'est pas accessible depuis l'hôte Nginx (`curl -s http://localhost:7000/api/info` depuis l'hôte Nginx devrait renvoyer du JSON).

Ouvrir dans le navigateur :
- Allez sur `https://yourdomain.com`
- L'UI devrait se charger et se connecter au backend
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

### Configurer la surveillance

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
- Vérifiez les paramètres CORS du backend
- Consultez la console du navigateur pour des erreurs
- Testez la santé du backend : `curl https://api.yourdomain.com/api/info`

### Page blanche / écran blanc

- Vérifiez la console du navigateur pour des erreurs JavaScript
- Vérifiez que tous les assets se chargent correctement
- Vérifiez la configuration Nginx pour le routage SPA
- Assurez-vous que la directive `try_files` est correctement configurée

### Le portefeuille Web3 ne se connecte pas

- Vérifiez si HTTPS est activé (requis pour Web3)
- Vérifiez que l'URL RPC blockchain est accessible
- Vérifiez que l'extension de portefeuille du navigateur est installée
- Examinez les en-têtes de Content Security Policy (CSP)