# Podešavanje UI veb-sajta

Ovaj vodič obuhvata instalaciju i postavljanje frontenda SAVVA UI.

## Pregled

SAVVA UI je jednostranična aplikacija (SPA) zasnovana na SolidJS-u koja pruža:
- Interfejs za kreiranje i pregled sadržaja
- Integraciju Web3 novčanika
- Otpremanje fajlova na IPFS
- Interakcije sa pametnim ugovorima
- Podršku za više jezika

## 1. Kloniranje repozitorijuma

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Instaliranje zavisnosti

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Konfiguracija

### Kreiranje fajla okruženja

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

UI automatski preuzima adrese blockchain ugovora sa backend `/info` endpointa, koji čita iz Config ugovora.

Nema potrebe za hardkodiranim adresama ugovora u konfiguraciji UI-ja.

## 4. Izgradnja UI-ja

### Razvojna izgradnja

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Produksiona izgradnja

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Izgradnja sa postavljanjem

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

Izgrađeni folder `dist/` sadrži statičke fajlove koje može poslužiti bilo koji web server.

#### Korišćenje Nginx-a (preporučeno)

SAVVA zahteva sveobuhvatnu Nginx konfiguraciju koja obuhvata:
- Serviranje statičkih fajlova UI-ja
- Proxy za backend API na `/api`
- Pre-renderovanje za SEO botove i otkrivanje (`/robots.txt`, `/sitemap*.xml`)
- Dinamički konfiguracioni endpoint
- Podršku za WebSocket

Preuzmite kompletnu Nginx konfiguraciju (šablon):

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
1. Preusmeravanje HTTP na HTTPS
2. Podešavanje SSL/TLS (Cloudflare Origin sertifikati ili Let's Encrypt)
3. `/default_connect.json` endpoint — **zahtevan** dinamički konfiguracioni fajl za UI (takođe podržan `.yaml` kao rezervna opcija)
4. Pre-renderovanje za botove — server-side renderovani HTML za pretraživače, AI crawlere i link unfurlere (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple; GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot, ...; Telegram, X, Facebook, Discord, Slack, WhatsApp, iMessage, LinkedIn, Reddit, Pinterest)
5. SEO rute za otkrivanje — `/robots.txt`, `/sitemap.xml`, i `/sitemap-*.xml` prosleđene backendu po domenu
6. `/api` proxy — prosleđuje API zahteve backendu na portu 7000
7. Podrška za WebSocket — za real-time funkcije
8. Serviranje statičkih fajlova sa SPA rutiranjem
9. Pametno keširanje — `index.html` se nikad ne kešira, asseti se keširaju 1 godinu

#### Šta SEO površina omogućava

Sa ovom konfiguracijom, backend servira crawler-ima potpuno renderovanu HTML verziju svake stranice (telo posta, autor, vreme objave/izmene, tagovi, strukturirani podaci, Open Graph tagovi sa ispravnim dimenzijama slika), dok ljudi i dalje dobijaju brz SolidJS SPA. Per-domain sitemap-i i `robots.txt` generišu se na backendu, tako da svaki domen na vašem čvoru dobija sopstvenu površinu za otkrivanje, politiku za AI-crawlere i kanoničke URL-ove.

Da bi ovo funkcionisalo, tri stvari moraju biti ispunjene:

1. Backend (`savva-backend`) mora biti u verziji koja sadrži endpoint-e `/api/render`, `/api/robots.txt` i `/api/sitemap*.xml`.
2. Vaš domen treba da ima unos pod `domains:` u `/etc/savva.yml`, i njegov ključ mora tačno odgovarati vrednosti `set $default_domain "..."` u ovoj Nginx konfiguraciji.
3. Nginx rutiranje ispod mora biti na mestu. (Podrazumevana konfiguracija od koje su mnoge starije instalacije počele sadrži bot regex iz 2018. koji promašuje sve AI crawlere, nema preusmeravanja za `/robots.txt` ili `/sitemap.xml`, i zastareo `/api/render/$scheme://$host$uri` rewrite obrazac koji backend više ne prihvata. Ako nadograđujete staru konfiguraciju, zamenite ta tri dela.)

### Razumevanje default_connect.json

UI zahteva `/default_connect.json` endpoint koji mu govori gde da pronađe backend, koje chain-ove servisira i IPFS gateway (takođe podržava `/default_connect.yaml` kao fallback). Ovo se konfiguriše direktno u Nginx-u.

UI prihvata dve šeme — izaberite onu koja odgovara vašoj instalaciji. Novi `chains` format je preporučen za nove i multi-chain sajtove; nasleđeni `backendLink` format i dalje radi.

Novi format (multi-chain):

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

Stari format (jedan backend):

```nginx
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

location = /default_connect.json {
    default_type application/json;
    return 200 '{"domain":"$default_domain","backendLink":"$default_backend","default_ipfs_link":"$default_ipfs"}';
}
```

UI preuzima ovu konfiguraciju pri startu. Vrednost `domain` mora da se poklapa sa ključem pod `domains:` u vašem `/etc/savva.yml`, i takođe je ono što SEO rewrites prosleđuju backendu kao `?domain=` kako bi mogao da razreši koju konfiguraciju domena da renderuje.

Prilagodite konfiguraciju:

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

Zatim ažurirajte `chainId` / `rpc` (ili nasleđeni `set $default_backend` / `set $default_ipfs`) unutar `/default_connect.json` bloka da odgovaraju vašem chain-u.

Distribuirajte fajlove i omogućite sajt:

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

### Opcija B: Automatizovani skript za postavljanje

Kreirajte skript za postavljanje:

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

Pokrenite postavljanje:

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

### Smoke testovi SEO površine

Nakon što je Nginx reload-ovan, proverite da li botovi, crawler-i i fajlovi za otkrivanje (discovery) stižu do backenda ispravno. Zamenite `yourdomain.com` stvarnim hostname-om.

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

Ako bilo koji od ovih zahteva vraća SPA shell kada ne bi trebalo (ili obrnuto), najčešći uzroci su:

- Backend još nije pokrenut u verziji koja uključuje `/api/render`, `/api/robots.txt` i `/api/sitemap*.xml`.
- Vrednost `set $default_domain "..."` u vašoj Nginx konfiguraciji se ne poklapa sa ključem pod `domains:` u `/etc/savva.yml`.
- Vaš `/api` upstream nije dostupan sa Nginx hosta (`curl -s http://localhost:7000/api/info` sa Nginx hosta bi trebalo da vrati JSON).

Otvori u pregledaču:
- Idi na `https://yourdomain.com`
- UI bi trebalo da se učita i poveže sa backendom
- Proverite konzolu pregledača za eventualne greške

## 7. Konfiguracija nakon postavljanja

### Ažurirajte CORS backenda

Osigurajte da backend dozvoljava domenu vašeg UI-ja:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Podesite CDN (opciono)

Za bolje performanse, razmotrite korišćenje CDN-a:

- **Cloudflare**: Dodajte sajt na Cloudflare, ažurirajte DNS
- **AWS CloudFront**: Kreirajte distribuciju koja pokazuje na origin
- **Ostali CDN-ovi**: Pratite dokumentaciju provajdera

### Podesite nadzor

Dodajte nadzor za dostupnost i greške:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
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

### Problemi sa vezom prema backendu

- Proverite `VITE_BACKEND_URL` u `.env`
- Verifikujte CORS podešavanja backenda
- Proverite konzolu pregledača za greške
- Testirajte zdravlje backenda: `curl https://api.yourdomain.com/api/info`

### Prazna stranica / beli ekran

- Proverite konzolu pregledača za JavaScript greške
- Proverite da li su svi asseti učitani ispravno
- Proverite Nginx konfiguraciju za SPA rutiranje
- Osigurajte da je `try_files` direktiva pravilno konfigurisana

### Web3 novčanik se ne povezuje

- Proverite da li je HTTPS omogućen (za Web3 je neophodno)
- Verifikujte da je blockchain RPC URL dostupan
- Proverite da li je ekstenzija novčanika u pregledaču instalirana
- Pregledajte Content Security Policy (CSP) zaglavlja