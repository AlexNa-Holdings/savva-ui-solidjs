# UI Website Setup

Ovaj vodič obuhvata instalaciju i raspoređivanje SAVVA UI frontenda.

## Overview

SAVVA UI je aplikacija jedne stranice zasnovana na SolidJS-u koja pruža:
- Interfejs za kreiranje i pregled sadržaja
- Integraciju Web3 novčanika
- Otpremanje fajlova na IPFS
- Interakcije sa pametnim ugovorima
- Višejezičnu podršku

## 1. Clone the Repository

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Configuration

### Create Environment File

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Environment Variables

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

### Additional Configuration

UI automatski preuzima adrese blockchain ugovora sa backend `/info` endpoint-a, koji čita iz Config ugovora.

Nema potrebe za hardkodiranim adresama ugovora u UI konfiguraciji.

## 4. Build the UI

### Development Build

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Production Build

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Build with Deployment

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

## 5. Deploy to Production

### Option A: Static File Hosting

Sastavljeni `dist/` direktorijum sadrži statičke fajlove koji se mogu služiti preko bilo kog web servera.

#### Using Nginx (Recommended)

SAVVA zahteva sveobuhvatnu Nginx konfiguraciju koja obuhvata:
- Serviranje statičkih fajlova UI-a
- Proxy za backend API na `/api`
- Prerenderovanje za SEO botove
- Endpoint za dinamičku konfiguraciju
- Podršku za WebSocket

**Download the complete Nginx configuration template:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**View the complete example**: [nginx.conf.example](nginx.conf.example)

**Ključne uključene funkcije:**
1. Preusmeravanje HTTP -> HTTPS
2. Podešavanje SSL/TLS (Cloudflare Origin Certificates ili Let's Encrypt)
3. `/default_connect.yaml` endpoint - **obavezna** dinamička konfiguracija za UI
4. Prerenderovanje za botove - server-side render za pretraživače i društvene mreže
5. `/api` proxy - prosleđuje API zahteve na backend na port 7000
6. Podrška za WebSocket - za real-time funkcionalnosti
7. Serviranje statičkih fajlova sa SPA rutiranjem
8. Pametno keširanje - index.html se nikada ne kešira, resursi se keširaju 1 godinu

### Understanding default_connect.yaml

UI zahteva `/default_connect.yaml` endpoint koji mu govori gde da pronađe backend i IPFS gateway. Ovo se konfiguriše direktno u Nginx-u koristeći promenljive:

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

Ovaj endpoint vraća YAML odgovor poput:
```yaml
domain: yourdomain.com
backendLink: https://yourdomain.com/api/
default_ipfs_link: https://gateway.pinata.cloud/ipfs/
```

UI preuzima ovu konfiguraciju pri pokretanju da bi znao gde da se poveže.

**Customize the configuration:**

Izmenite ove ključne promenljive u preuzetom fajlu:

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

**Deploy files and enable site:**

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

### Option B: Automated Deployment Script

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

Pokrenite raspoređivanje:

```bash
./deploy.sh
```

## 6. Verify Installation

Testirajte UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Otvorite u pregledaču:
- Idite na `https://yourdomain.com`
- UI bi trebalo da se učita i poveže sa backend-om
- Proverite konzolu pregledača za eventualne greške

## 7. Post-Deployment Configuration

### Update Backend CORS

Obezbedite da backend dozvoljava vašu UI domenu:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Configure CDN (Optional)

Za bolje performanse, razmotrite korišćenje CDN-a:

- **Cloudflare**: Dodajte sajt na Cloudflare, ažurirajte DNS
- **AWS CloudFront**: Kreirajte distribuciju koja pokazuje na origin
- **Other CDNs**: Pratite dokumentaciju provajdera

### Setup Monitoring

Dodajte nadzor za dostupnost i greške:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## Troubleshooting

### Build Fails

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Backend Connection Issues

- Proverite `VITE_BACKEND_URL` u `.env`
- Verifikujte CORS podešavanja backend-a
- Pogledajte konzolu pregledača za greške
- Testirajte zdravlje backend-a: `curl https://api.yourdomain.com/api/info`

### Blank Page / White Screen

- Proverite konzolu pregledača za JavaScript greške
- Verifikujte da su svi asset-i uspešno učitani
- Proverite Nginx konfiguraciju za SPA rutiranje
- Osigurajte da je `try_files` direktiva pravilno podešena

### Web3 Wallet Not Connecting

- Proverite da li je HTTPS omogućen (neophodno za Web3)
- Verifikujte da je blockchain RPC URL dostupan
- Proverite da li je ekstenzija novčanika instalirana u pregledaču
- Pregledajte Content Security Policy zaglavlja