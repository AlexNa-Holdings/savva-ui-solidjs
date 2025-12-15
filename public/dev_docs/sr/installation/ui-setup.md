# Podešavanje UI veb-sajta

Ovaj vodič obuhvata instalaciju i postavljanje (deploy) frontend dela SAVVA UI.

## Pregled

SAVVA UI je single-page aplikacija bazirana na SolidJS koja pruža:
- Interfejs za kreiranje i pregled sadržaja
- Integraciju Web3 novčanika
- Otpremanje fajlova na IPFS
- Interakcije sa smart kontraktima
- Podršku za više jezika

## 1. Kloniranje repozitorijuma

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Instalacija zavisnosti

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Konfiguracija

### Kreiranje fajla za okruženje

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Promenljive okruženja

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

### Dodatna konfiguracija

UI automatski preuzima adrese blockchain ugovora iz backend `/info` endpoint-a, koji čita iz Config ugovora.

Nema potrebe za hardkodovanim adresama ugovora u UI konfiguraciji.

## 4. Izgradnja UI

### Razvojna izgradnja

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Produkcijska izgradnja

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Izgradnja sa automatskim postavljanjem

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

## 5. Postavljanje u produkciju

### Opcija A: Hostovanje statičkih fajlova

Kompajlirana fascikla `dist/` sadrži statičke fajlove koje može da poslužuje bilo koji veb server.

#### Korišćenje Nginx-a (preporučeno)

SAVVA zahteva sveobuhvatnu Nginx konfiguraciju koja obuhvata:
- Serviranje statičkih fajlova UI-a
- Proxy za backend API na `/api`
- Prerenderovanje za SEO botove
- Dinamički endpoint za konfiguraciju
- Podršku za WebSocket

Preuzmite kompletan Nginx konfiguracioni šablon:

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

Pogledajte kompletan primer: [nginx.conf.example](nginx.conf.example)

Ključne funkcije koje su uključene:
1. Preusmeravanje sa HTTP na HTTPS
2. Podešavanje SSL/TLS (Cloudflare Origin Certificates ili Let's Encrypt)
3. `/default_connect.yaml` endpoint - obezbeđuje URL-ove backend-a i IPFS gateway-a za UI
4. Prerenderovanje za botove - SEO-prijazno server-side renderovanje za pretraživače i društvene mreže
5. `/api` proxy - prosleđuje API zahteve backend-u na port 7000
6. Podrška za WebSocket - za real-time funkcionalnosti
7. Serviranje statičkih fajlova sa SPA routing-om
8. Pametno keširanje - index.html se nikada ne kešira, asset-i se keširaju 1 godinu

Prilagodite konfiguraciju:

Izmenite sledeće ključne promenljive u preuzetom fajlu:

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

Postavite fajlove i omogućite sajt:

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

#### Korišćenje Apache-a

Kreirajte Apache konfiguraciju:

```bash
sudo nano /etc/apache2/sites-available/savva-ui.conf
```

Apache konfiguracija:

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

Omogućite sajt:

```bash
sudo a2enmod ssl rewrite headers deflate
sudo a2ensite savva-ui
sudo systemctl reload apache2
```

### Opcija B: Automatizovani skript za deployment

Kreirajte deployment skript:

```bash
nano deploy.sh
chmod +x deploy.sh
```

Sadržaj skripta:

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

Pokrenite deployment:

```bash
./deploy.sh
```

### Opcija C: Deployment putem Docker-a

Kreirajte Dockerfile:

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

Build i pokretanje:

```bash
# Build image
docker build -t savva-ui .

# Run container
docker run -d -p 80:80 --name savva-ui savva-ui
```

## 6. Proverite instalaciju

Testirajte UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Otvorite u pregledaču:
- Idite na `https://yourdomain.com`
- UI bi trebalo da se učita i poveže sa backend-om
- Proverite konzolu pregledača zbog grešaka

## 7. Podešavanja nakon postavljanja

### Ažurirajte CORS na backendu

Osigurajte da backend dozvoljava vašu UI domenu:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Konfigurišite CDN (opciono)

Za bolje performanse, razmotrite korišćenje CDN-a:

- **Cloudflare**: Dodajte sajt na Cloudflare, ažurirajte DNS
- **AWS CloudFront**: Kreirajte distribuciju koja pokazuje na origin
- **Other CDNs**: Pratite dokumentaciju provajdera

### Postavite monitoring

Dodajte nadzor za dostupnost i greške:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## 8. Kontinuirana isporuka

### GitHub Actions

Kreirajte `.github/workflows/deploy.yml`:

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

## Otklanjanje problema

### Greška pri izgradnji

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Problemi sa povezivanjem na backend

- Proverite `VITE_BACKEND_URL` u `.env`
- Proverite CORS podešavanja backend-a
- Proverite konzolu pregledača za greške
- Testirajte zdravlje backend-a: `curl https://api.yourdomain.com/health`

### Prazna stranica / beli ekran

- Proverite konzolu pregledača zbog JavaScript grešaka
- Proverite da li su svi asset-i ispravno učitani
- Proverite Nginx/Apache konfiguraciju za SPA routing
- Uverite se da su `try_files` ili `FallbackResource` konfigurirani

### Web3 novčanik se ne povezuje

- Proverite da li je HTTPS omogućen (zahtevano za Web3)
- Proverite da li je blockchain RPC URL dostupan
- Proverite da li je ekstenzija novčanika u pregledaču instalirana
- Proverite Content Security Policy (CSP) zaglavlja