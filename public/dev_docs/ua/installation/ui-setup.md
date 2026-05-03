# Налаштування вебсайту UI

Цей посібник охоплює встановлення та розгортання фронтенду SAVVA UI.

## Огляд

SAVVA UI — це односторінковий додаток на SolidJS, який забезпечує:
- Інтерфейс для створення та перегляду контенту
- Інтеграцію з Web3-гаманцями
- Завантаження файлів в IPFS
- Взаємодію зі смарт-контрактами
- Підтримку кількох мов

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

## 3. Налаштування

### Створення файлу оточення

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

### Додаткові налаштування

UI автоматично отримує адреси смарт-контрактів з бекенду через ендпоінт `/info`, який читає їх з контракту Config.

У конфігурації UI немає потреби в жорстко закодованих адресах контрактів.

## 4. Збірка UI

### Розробницька збірка

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Релізна збірка

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Збірка разом із розгортанням

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

Збудована папка `dist/` містить статичні файли, які може обслуговувати будь-який вебсервер.

#### Використання Nginx (рекомендовано)

SAVVA вимагає повної конфігурації Nginx, яка обробляє:
- Обслуговування статичних файлів UI
- Проксі бекенду на `/api`
- Пререндеринг для SEO-ботів та discovery (`/robots.txt`, `/sitemap*.xml`)
- Динамічний ендпоінт конфігурації
- Підтримку WebSocket

**Завантажте повний шаблон конфігурації Nginx:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/_shared/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/_shared/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Перегляньте повний приклад**: [nginx.conf.example](/dev_docs/_shared/installation/nginx.conf.example)

**Ключові функції, що входять:**
1. Перенаправлення HTTP на HTTPS
2. Налаштування SSL/TLS (Cloudflare Origin Certificates або Let's Encrypt)
3. Ендпоінт `/default_connect.json` — **обов'язковий** для динамічної конфігурації UI (`.yaml` також підтримується як запасний варіант)
4. Пререндеринг для ботів — серверно-рендерений HTML для пошукових систем, AI-краулерів та unfurler-ів (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple; GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot, ...; Telegram, X, Facebook, Discord, Slack, WhatsApp, iMessage, LinkedIn, Reddit, Pinterest)
5. Маршрути для SEO discovery — `/robots.txt`, `/sitemap.xml` та `/sitemap-*.xml`, які проксуються до бекенду для кожного домену
6. Проксі `/api` — пересилає запити до бекенду на порт 7000
7. Підтримка WebSocket — для реального часу
8. Обслуговування статичних файлів з SPA-роутінгом
9. Розумний кешинг — `index.html` ніколи не кешується, активи кешуються на 1 рік

#### Що дає вам SEO-поверхня

З цією конфігурацією бекенд надає краулерам повністю відрендерену HTML-версію кожної сторінки (тіло поста, автор, час публікації/оновлення, теги, структуровані дані, Open Graph теги з коректними розмірами зображень), тоді як користувачі все ще отримують швидкий SPA на SolidJS. Пер-доменні sitemap та `robots.txt` генеруються бекендом, тому кожен домен вашого вузла отримує власну discovery-поверхню, політику для AI-краулерів і канонічні URL.

Для цього мають бути виконані три умови:

1. Бекенд (`savva-backend`) повинен бути на версії, яка постачає ендпоінти `/api/render`, `/api/robots.txt` та `/api/sitemap*.xml`.
2. Ваш домен повинен мати запис під `domains:` в `/etc/savva.yml`, і його ключ повинен точно збігатися зі значенням `set $default_domain "..."` у цій конфігурації Nginx.
3. Нижче наведено маршрутизація Nginx повинна бути встановлена. (Типова конфігурація, з якої починали багато старіших розгортань, містить regex для ботів з 2018 року, який пропускає більшість AI-краулерів, немає перенаправлень для `/robots.txt` або `/sitemap.xml`, і застарілий шаблон перепису `/api/render/$scheme://$host$uri`, який бекенд більше не приймає. Якщо ви оновлюєтеся з старішої конфігурації, замініть ці три частини.)

### Розуміння default_connect.json

UI вимагає ендпоінт `/default_connect.json`, який повідомляє, де знайти бекенд, які ланцюги він обслуговує та IPFS-шлюз (також підтримується `/default_connect.yaml` як запасний варіант). Це налаштовується безпосередньо в Nginx.

UI приймає дві схеми — оберіть ту, яка відповідає вашому розгортанню. Нова форма з `chains` краща для нових і мульти-ланцюгових сайтів; застаріла форма з `backendLink` все ще працює.

**Новий формат (мульти-ланцюговий):**

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

**Застарілий формат (один бекенд):**

```nginx
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

location = /default_connect.json {
    default_type application/json;
    return 200 '{"domain":"$default_domain","backendLink":"$default_backend","default_ipfs_link":"$default_ipfs"}';
}
```

UI завантажує цю конфігурацію під час старту. Значення `domain` має збігатися з ключем під `domains:` у вашому `/etc/savva.yml`, і саме воно передається SEO-перенаписами в бекенд як `?domain=`, щоб він міг визначити, яку конфігурацію домену рендерити.

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

Потім оновіть `chainId` / `rpc` (або застарілий `set $default_backend` / `set $default_ipfs`) всередині блоку `/default_connect.json`, щоб вони відповідали вашому ланцюгу.

**Розгорнути файли та увімкнути сайт:**

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

### Варіант B: Автоматичний скрипт розгортання

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

### Швидкі перевірки SEO-поверхні

Після перезавантаження Nginx переконайтесь, що боти, краулери та файли discovery доходять до бекенду правильно. Замініть `yourdomain.com` на ваш фактичний хостнейм.

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

Якщо будь-який з цих запитів повертає SPA-шаблон там, де має бути відрендерений HTML (або навпаки), найпоширеніші причини такі:

- Бекенд ще не працює на версії, яка постачає `/api/render`, `/api/robots.txt` і `/api/sitemap*.xml`.
- Значення `set $default_domain "..."` у вашій конфігурації Nginx не співпадає з ключем під `domains:` у `/etc/savva.yml`.
- Ваш upstream `/api` недоступний з хоста Nginx (`curl -s http://localhost:7000/api/info` на хості Nginx повинен повернути JSON).

Відкрийте в браузері:
- Перейдіть на `https://yourdomain.com`
- UI має завантажитися та підключитися до бекенду
- Перевірте консоль браузера на наявність помилок

## 7. Післядеплойні налаштування

### Оновлення CORS бекенду

Переконайтесь, що бекенд дозволяє ваш домен UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Налаштування CDN (за бажанням)

Для кращої продуктивності розгляньте використання CDN:

- **Cloudflare**: додайте сайт у Cloudflare, оновіть DNS
- **AWS CloudFront**: створіть дистрибуцію, яка вказує на origin
- **Інші CDN**: дотримуйтесь документації провайдера

### Налаштування моніторингу

Додайте моніторинг для uptime та логування помилок:

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

### Проблеми з підключенням до бекенду

- Перевірте `VITE_BACKEND_URL` у `.env`
- Перевірте налаштування CORS на бекенді
- Перевірте консоль браузера на наявність помилок
- Перевірте стан бекенду: `curl https://api.yourdomain.com/api/info`

### Порожня сторінка / білий екран

- Перевірте консоль браузера на JavaScript-помилки
- Переконайтесь, що всі активи завантажуються правильно
- Перевірте конфігурацію Nginx щодо SPA-роутінгу
- Переконайтесь, що директива `try_files` налаштована правильно

### Гаманець Web3 не підключається

- Перевірте, чи увімкнено HTTPS (потрібно для Web3)
- Переконайтесь, що URL RPC блокчейну доступний
- Перевірте, чи встановлено розширення гаманця в браузері
- Перегляньте заголовки політики безпеки контенту (Content Security Policy)