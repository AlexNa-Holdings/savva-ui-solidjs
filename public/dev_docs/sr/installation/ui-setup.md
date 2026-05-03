# Podešavanje UI veb sajta

Ovo uputstvo pokriva instalaciju i deployment SAVVA UI frontend-a.

## Pregled

SAVVA UI je single-page aplikacija zasnovana na SolidJS-u koja omogućava:
- Interfejs za kreiranje i pregled sadržaja
- Integraciju Web3 novčanika
- Upload fajlova na IPFS
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

### Kreiranje environment fajla

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

UI automatski dohvaća adrese smart kontrakata iz backend `/info` endpoint-a, koji čita iz Config kontrakta.

Nije potrebno imati hardkodirane adrese kontrakata u UI konfiguraciji.

## 4. Build UI-a

### Development build

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Production build

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Build sa deployment-om

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

## 5. Deploy na produkciju

### Opcija A: Hosting statičkih fajlova

Sastavljen `dist/` folder sadrži statičke fajlove koji se mogu servirati kroz bilo koji web server.

#### Korišćenje Nginx-a (preporučeno)

SAVVA zahteva sveobuhvatnu Nginx konfiguraciju koja pokriva:
- Serviranje statičkih fajlova UI-a
- Proxy za backend API na `/api`
- Prerendering i otkrivanje za SEO botove (`/robots.txt`, `/sitemap*.xml`)
- Endpoint za dinamičku konfiguraciju
- Podršku za WebSocket

**Preuzmite kompletnu Nginx konfiguraciju:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/_shared/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/_shared/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Pogledajte celokupan primer**: [nginx.conf.example](/dev_docs/_shared/installation/nginx.conf.example)

**Ključne funkcije koje su uključene:**
1. Preusmeravanje HTTP na HTTPS
2. SSL/TLS podešavanje (Cloudflare Origin Certificates ili Let's Encrypt)
3. `/default_connect.json` endpoint - **neophodna** dinamička konfiguracija za UI (`.yaml` je podržan kao fallback)
4. Bot prerendering - server-side renderovani HTML za pretraživače, AI crawler-e i link unfurlere (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple; GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot, ...; Telegram, X, Facebook, Discord, Slack, WhatsApp, iMessage, LinkedIn, Reddit, Pinterest)
5. SEO discovery rute - `/robots.txt`, `/sitemap.xml`, i `/sitemap-*.xml` prosleđene backend-u po domenima
6. `/api` proxy - prosleđuje API zahteve backend-u na portu 7000
7. Podrška za WebSocket - za real-time funkcionalnosti
8. Serviranje statičkih fajlova sa SPA routing-om
9. Pametno keširanje - `index.html` se nikada ne kešira, asset-i se keširaju 1 godinu

#### Šta vam SEO površina donosi

Sa ovom konfiguracijom, backend servira crawler-ima potpuno renderovanu HTML verziju svake stranice (telo posta, autor, vreme objave/izmena, tagovi, strukturirani podaci, Open Graph tagovi sa ispravnim dimenzijama slike), dok ljudi i dalje dobijaju brzi SolidJS SPA. Per-domain sitemap-ovi i `robots.txt` generišu se na backend-u, pa svaki domen na vašem čvoru dobija sopstvenu površinu za otkrivanje, politiku za AI-crawlere i kanonske URL-ove.

Da bi ovo radilo, tri stvari moraju biti ispunjene:

1. Backend (`savva-backend`) mora biti na verziji koja sadrži `/api/render`, `/api/robots.txt`, i `/api/sitemap*.xml` endpoint-e.
2. Vaš domen mora imati unos pod `domains:` u `/etc/savva.yml`, i njegov ključ mora tačno odgovarati vrednosti `set $default_domain "..."` u ovoj Nginx konfiguraciji.
3. Nginx rutiranje prikazano ispod mora biti na mestu. (Podrazumevana konfiguracija iz starijih deployment-a ima regex za botove iz 2018. koji propušta sve AI crawlere, nema rewrite-ove za `/robots.txt` ili `/sitemap.xml`, i ima zastareli `/api/render/$scheme://$host$uri` rewrite pattern koji backend više ne prihvata. Ako nadograđujete iz starijeg config-a, zamenite ta tri dela.)

### Razumevanje default_connect.json

UI zahteva `/default_connect.json` endpoint koji mu govori gde da pronađe backend, koje chain-ove pokriva i IPFS gateway (takođe podržava `/default_connect.yaml` kao fallback). Ovo se konfiguriše direktno u Nginx-u.

UI prihvata dva šema — izaberite onaj koji odgovara vašem deployment-u. Novi `chains` format se preporučuje za nove i multi-chain sajtove; legacy `backendLink` format i dalje radi.

**Novi format (multi-chain):**

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

**Legacy format (jedan backend):**

```nginx
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

location = /default_connect.json {
    default_type application/json;
    return 200 '{"domain":"$default_domain","backendLink":"$default_backend","default_ipfs_link":"$default_ipfs"}';
}
```

UI učitava ovu konfiguraciju pri pokretanju. Vrednost `domain` mora odgovarati ključu pod `domains:` u vašem `/etc/savva.yml`, i to je takođe vrednost koju SEO rewrite-ovi prosleđuju backend-u kao `?domain=` kako bi mogao da reši koju domensku konfiguraciju da renderuje.

**Prilagodite konfiguraciju:**

Izmenite sledeće ključne promenljive u preuzetom fajlu:

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

Zatim ažurirajte `chainId` / `rpc` (ili legacy `set $default_backend` / `set $default_ipfs`) unutar `/default_connect.json` bloka da odgovaraju vašem chain-u.

**Deploy fajlova i omogućavanje sajta:**

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

## 6. Verifikacija instalacije

Testirajte UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

### Smoke testovi za SEO površinu

Nakon što je Nginx reload-ovan, proverite da li botovi, crawler-i i discovery fajlovi stižu ispravno do backend-a. Zamenite `yourdomain.com` stvarnim hostom.

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

Ako bilo koji od ovih testova vrati SPA shell kada ne bi trebalo (ili obrnuto), najčešći razlozi su:

- Backend još nije na verziji koja sadrži `/api/render`, `/api/robots.txt`, i `/api/sitemap*.xml`.
- Vrednost `set $default_domain "..."` u vašoj Nginx konfiguraciji ne odgovara ključu pod `domains:` u `/etc/savva.yml`.
- Vaš `/api` upstream nije dostupan sa Nginx hosta (`curl -s http://localhost:7000/api/info` sa Nginx hosta bi trebalo da vrati JSON).

Otvorite u pretraživaču:
- Idite na `https://yourdomain.com`
- UI bi trebalo da se učita i poveže na backend
- Proverite konzolu u pretraživaču za eventualne greške

## 7. Post-deployment konfiguracija

### Ažurirajte CORS na backend-u

Osigurajte da backend dozvoljava vaš UI domen:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Konfigurisanje CDN-a (opciono)

Za bolju performansu, razmotrite upotrebu CDN-a:

- **Cloudflare**: Dodajte sajt na Cloudflare, ažurirajte DNS
- **AWS CloudFront**: Kreirajte distribuciju koja pokazuje na origin
- **Drugi CDN-ovi**: Pratite dokumentaciju provajdera

### Podesite monitoring

Dodajte monitoring za uptime i greške:

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

### Problemi sa konekcijom na backend

- Proverite `VITE_BACKEND_URL` u `.env`
- Verifikujte CORS podešavanja backend-a
- Proverite konzolu u pretraživaču za greške
- Testirajte health backend-a: `curl https://api.yourdomain.com/api/info`

### Prazna stranica / beli ekran

- Proverite konzolu u pretraživaču za JavaScript greške
- Verifikujte da su svi asset-i učitani ispravno
- Proverite Nginx konfiguraciju za SPA routing
- Osigurajte da je `try_files` direktiva ispravno podešena

### Web3 novčanik se ne povezuje

- Proverite da li je HTTPS omogućen (potrebno za Web3)
- Verifikujte da je blockchain RPC URL dostupan
- Proverite da li je ekstenzija novčanika instalirana u pretraživaču
- Pregledajte Content Security Policy zaglavlja