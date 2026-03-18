# Podešavanje UI veb-sajta

Ovaj vodič pokriva instalaciju i postavljanje (deploy) frontenda SAVVA UI.

## Pregled

SAVVA UI je jednostranična aplikacija zasnovana na SolidJS-u koja obezbeđuje:
- Interfejs za kreiranje i pregled sadržaja
- Integraciju Web3 novčanika
- Upload fajlova na IPFS
- Interakcije sa smart kontraktima
- Podršku za više jezika

## 1. Klonirajte repozitorijum

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Instalirajte zavisnosti

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Konfiguracija

### Kreirajte fajl za okruženje

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Environment promenljive

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

UI automatski preuzima adrese smart kontrakata sa backend `/info` endpoint-a, koji čita vrednosti iz Config kontrakta.

Nije potrebno hardkodirati adrese kontrakata u UI konfiguraciji.

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

### Izgradnja sa deploy-om

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

### Opcija A: Hosting statičkih fajlova

Izgrađeni `dist/` direktorijum sadrži statičke fajlove koje svaki web server može servirati.

#### Korišćenje Nginx-a (preporučeno)

SAVVA zahteva kompletnu Nginx konfiguraciju koja obuhvata:
- Serviranje statičkih fajlova UI-a
- Proxy za backend API na `/api`
- Prerendering za SEO botove
- Endpoint za dinamičku konfiguraciju
- Podršku za WebSocket

**Preuzmite kompletan Nginx konfiguracioni šablon:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Pogledajte kompletan primer**: [nginx.conf.example](nginx.conf.example)

**Ključne funkcije koje su uključene:**
1. Preusmeravanje sa HTTP na HTTPS
2. SSL/TLS podešavanje (Cloudflare Origin sertifikati ili Let's Encrypt)
3. `/default_connect.json` endpoint - **obavezna** dinamička konfiguracija za UI (`.yaml` je podržan kao fallback)
4. Prerendering za botove - SEO-prijateljsko renderovanje na serverskoj strani za pretraživače i društvene mreže
5. `/api` proxy - prosleđuje API zahteve na backend na portu 7000
6. Podrška za WebSocket - za real-time funkcionalnosti
7. Serviranje statičkih fajlova sa SPA rutiranjem
8. Pametno keširanje - index.html se nikada ne kešira, asseti se keširaju 1 godinu

### Razumevanje default_connect.json

UI zahteva endpoint `/default_connect.json` koji mu kaže gde da pronađe backend i IPFS gateway (takođe podržava `/default_connect.yaml` kao fallback). Ovo se konfiguriše direktno u Nginx-u koristeći varijable:

```nginx
# Define your deployment settings
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

# Serve dynamic configuration to the UI
location = /default_connect.json {
    default_type application/json;
    return 200 '{"domain":"$default_domain","backendLink":"$default_backend","default_ipfs_link":"$default_ipfs"}';
}
```

Ovaj endpoint vraća JSON odgovor poput:
```json
{
  "domain": "yourdomain.com",
  "backendLink": "https://yourdomain.com/api/",
  "default_ipfs_link": "https://gateway.pinata.cloud/ipfs/"
}
```

UI preuzima ovu konfiguraciju pri pokretanju da bi znao gde da se poveže.

**Prilagodite konfiguraciju:**

Izmenite ove ključne varijable u preuzetom fajlu:

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

**Postavite fajlove i omogućite sajt:**

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

### Opcija B: Automatizovani deployment skript

Napravite deployment skript:

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
- Proverite konzolu pregledača za eventualne greške

## 7. Konfiguracija posle deploy-a

### Ažurirajte CORS na backend-u

Osigurajte da backend dozvoljava vašu UI domenu:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Konfigurišite CDN (opciono)

Za bolje performanse razmotrite korišćenje CDN-a:

- **Cloudflare**: Dodajte sajt u Cloudflare, ažurirajte DNS
- **AWS CloudFront**: Kreirajte distribuciju koja pokazuje na origin
- **Ostali CDN-ovi**: Pratite dokumentaciju provajdera

### Podesite monitoring

Dodajte monitoring za dostupnost i greške:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## Otklanjanje problema

### Build ne uspeva

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Problemi sa povezivanjem na backend

- Proverite `VITE_BACKEND_URL` u `.env`
- Potvrdite CORS podešavanja na backend-u
- Proverite konzolu pregledača za greške
- Testirajte zdravlje backend-a: `curl https://api.yourdomain.com/api/info`

### Prazna stranica / beli ekran

- Proverite konzolu pregledača za JavaScript greške
- Potvrdite da su svi asseti učitani ispravno
- Proverite Nginx konfiguraciju za SPA rutiranje
- Osigurajte da je `try_files` direktiva pravilno podešena

### Web3 novčanik se ne povezuje

- Proverite da li je HTTPS omogućen (zahtevano za Web3)
- Potvrdite da je blockchain RPC URL dostupan
- Proverite da li je ekstenzija novčanika instalirana u pregledaču
- Pregledajte Content Security Policy zaglavlja