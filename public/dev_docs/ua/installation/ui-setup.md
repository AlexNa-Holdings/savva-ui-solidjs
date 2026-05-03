# Налаштування UI вебсайту

Цей посібник охоплює встановлення та розгортання фронтенда SAVVA UI.

## Огляд

SAVVA UI — це односторінковий додаток на основі SolidJS, який забезпечує:
- Інтерфейс створення та перегляду контенту
- Інтеграцію з Web3-гаманцями
- Завантаження файлів в IPFS
- Взаємодію зі смарт-контрактами
- Підтримку декількох мов

## 1. Клонування репозиторію

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Встановлення залежностей

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Конфігурація

### Створення файлу середовища

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Змінні середовища

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

### Додаткова конфігурація

UI автоматично отримує адреси смарт-контрактів з бекенду через endpoint `/info`, який читає з контракту Config.

У конфігурації UI немає потреби жорстко вбудовувати адреси контрактів.

## 4. Збірка UI

### Розробницька збірка

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Продакшн-збірка

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Збірка з розгортанням

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

## 5. Розгортання в продакшн

### Варіант A: Хостинг статичних файлів

Зібрана папка `dist/` містить статичні файли, які можна обслуговувати будь-яким вебсервером.

#### Використання Nginx (рекомендовано)

SAVVA потребує комплексної конфігурації Nginx, яка обробляє:
- Подачу статичних файлів UI
- Проксі бекенду API на `/api`
- Пререндеринг для SEO ботів і discovery (`/robots.txt`, `/sitemap*.xml`)
- Динамічний endpoint конфігурації
- Підтримку WebSocket

**Завантажте повний шаблон конфігурації Nginx:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Переглянути повний приклад**: [nginx.conf.example](nginx.conf.example)

**Ключові можливості, що включені:**
1. Перенаправлення з HTTP на HTTPS
2. Налаштування SSL/TLS (Cloudflare Origin Certificates або Let's Encrypt)
3. Endpoint `/default_connect.json` — **потрібний** для динамічної конфігурації UI (`.yaml` також підтримується як запасний варіант)
4. Пререндеринг для ботів — серверна версія HTML для пошукових систем, AI-краулерів та unfurl-ботів (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple; GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot, ...; Telegram, X, Facebook, Discord, Slack, WhatsApp, iMessage, LinkedIn, Reddit, Pinterest)
5. Маршрути для SEO-дискавері — `/robots.txt`, `/sitemap.xml` та `/sitemap-*.xml` проксовані до бекенду для кожного домену
6. Проксі `/api` — перенаправляє API-запити до бекенду на порт 7000
7. Підтримка WebSocket — для функцій у реальному часі
8. Подача статичних файлів зі SPA-маршрутизацією
9. Розумне кешування — `index.html` ніколи не кешується, ресурси кешуються на 1 рік

#### Що дає вам SEO-поверхня

З цією конфігурацією бекенд подає краулерам повністю відрендерену HTML-версію кожної сторінки (тіло посту, автор, час публікації/оновлення, теги, структуровані дані, Open Graph теги з правильними розмірами зображень), в той час як користувачі отримують швидкий SolidJS SPA. Для кожного домену на вашому вузлі бекенд генерує власні sitemap та `robots.txt`, тому кожен домен отримує свою зону виявлення, політику для AI-краулерів та канонічні URL.

Щоб це працювало, мають виконуватися три умови:

1. Бекенд (`savva-backend`) має бути на версії, що надає endpoint'и `/api/render`, `/api/robots.txt` та `/api/sitemap*.xml`.
2. Ваш домен має бути вказаний під `domains:` у `/etc/savva.yml`, і його ключ має точно відповідати значенню `set $default_domain "..."` у цій конфігурації Nginx.
3. Нижче наведена маршрутизація Nginx має бути в місці. (Типова конфігурація, з якої багато старших розгортань починали, має regex для ботів із 2018 року, який пропускає більшість AI-краулерів, немає перезаписів для `/robots.txt` або `/sitemap.xml`, і застарілий шаблон `/api/render/$scheme://$host$uri`, який бекенд більше не підтримує. Якщо ви оновлюєтеся зі старої конфігурації, замініть ці три частини.)

### Розуміння default_connect.json

UI вимагає endpoint `/default_connect.json`, який повідомляє, де знайти бекенд, які ланцюги він обслуговує та IPFS-гейтвей (також підтримується `/default_connect.yaml` як запасний варіант). Це налаштовується безпосередньо в Nginx.

UI приймає дві схеми — оберіть ту, що відповідає вашому розгортанню. Нова форма `chains` рекомендована для нових і мульти-ланцюгових сайтів; застаріла форма `backendLink` все ще працює.

**Нова форма (мульти-ланцюг):**

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

**Застаріла форма (один бекенд):**

```nginx
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

location = /default_connect.json {
    default_type application/json;
    return 200 '{"domain":"$default_domain","backendLink":"$default_backend","default_ipfs_link":"$default_ipfs"}';
}
```

UI завантажує цю конфігурацію при старті. Значення `domain` має відповідати ключу під `domains:` у вашому `/etc/savva.yml`, і саме це значення SEO-переписування передає бекенду як `?domain=`, щоб він міг визначити, яку конфігурацію домену рендерити.

**Налаштування конфігурації:**

Відредагуйте ці ключові змінні у завантаженому файлі:

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

Потім оновіть `chainId` / `rpc` (або застарілі `set $default_backend` / `set $default_ipfs`) всередині блоку `/default_connect.json`, щоб вони відповідали вашому ланцюгу.

**Розгорніть файли та увімкніть сайт:**

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

### Варіант B: Автоматизований скрипт розгортання

Створіть скрипт розгортання:

```bash
nano deploy.sh
chmod +x deploy.sh
```

Зміст скрипта:

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

Запустіть розгортання:

```bash
./deploy.sh
```

## 6. Перевірка встановлення

Перевірте UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

### Швидкі тести SEO-поверхні

Після перезавантаження Nginx перевірте, що боти, краулери та discovery-файли досягають бекенду правильно. Замініть `yourdomain.com` на ваш фактичний хостнейм.

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

Якщо будь-який з цих тестів повертає SPA-shell там, де має бути відрендерений HTML (або навпаки), найпоширеніші причини:

- Бекенд ще не працює на версії, яка надає `/api/render`, `/api/robots.txt` та `/api/sitemap*.xml`.
- Значення `set $default_domain "..."` у вашій конфігурації Nginx не відповідає ключу під `domains:` у `/etc/savva.yml`.
- Ваш upstream `/api` недоступний з хоста Nginx (`curl -s http://localhost:7000/api/info` з хоста Nginx має повернути JSON).

Відкрийте в браузері:
- Перейдіть на `https://yourdomain.com`
- UI має завантажитись і підключитись до бекенду
- Перевірте консоль браузера на наявність помилок

## 7. Налаштування після розгортання

### Оновлення CORS у бекенді

Переконайтесь, що бекенд дозволяє ваш домен UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Налаштування CDN (опціонально)

Для кращої продуктивності розгляньте використання CDN:

- **Cloudflare**: Додайте сайт у Cloudflare, оновіть DNS
- **AWS CloudFront**: Створіть дистрибутив, вказавши origin
- **Інші CDN**: Дотримуйтесь документації провайдера

### Налаштування моніторингу

Додайте моніторинг для аптайму та помилок:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## Усунення несправностей

### Помилка збірки

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Проблеми підключення до бекенду

- Перевірте `VITE_BACKEND_URL` у `.env`
- Перевірте налаштування CORS у бекенді
- Перевірте консоль браузера на помилки
- Перевірте здоров’я бекенду: `curl https://api.yourdomain.com/api/info`

### Порожня сторінка / білий екран

- Перевірте консоль браузера на JavaScript-помилки
- Переконайтесь, що всі ресурси завантажуються коректно
- Перевірте конфігурацію Nginx для SPA-маршрутизації
- Переконайтесь, що директива `try_files` налаштована правильно

### Web3-гаманець не підключається

- Переконайтесь, що HTTPS увімкнено (потрібно для Web3)
- Перевірте доступність RPC-URL блокчейну
- Перевірте, чи встановлене розширення гаманця в браузері
- Перегляньте заголовки Content Security Policy