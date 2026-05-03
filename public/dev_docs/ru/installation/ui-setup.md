# Настройка веб-интерфейса UI

Это руководство охватывает установку и развертывание фронтенда SAVVA UI.

## Обзор

SAVVA UI — одностраничное приложение (SPA) на SolidJS, которое предоставляет:
- Интерфейс создания и просмотра контента
- Интеграцию Web3-кошельков
- Загрузку файлов в IPFS
- Взаимодействие со смарт-контрактами
- Поддержку нескольких языков

## 1. Клонирование репозитория

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Установка зависимостей

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Конфигурация

### Создание файла окружения

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Переменные окружения

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

### Дополнительная конфигурация

UI автоматически получает адреса смарт-контрактов блокчейна с backend через endpoint `/info`, который читает их из контракта Config.

В конфигурации UI нет необходимости хардкодить адреса контрактов.

## 4. Сборка UI

### Сборка для разработки

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Сборка для продакшена

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Сборка и деплой

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

## 5. Развертывание в продакшн

### Вариант A: Раздача статических файлов

Собранная папка `dist/` содержит статические файлы, которые может обслуживать любой веб-сервер.

#### Использование Nginx (рекомендуется)

SAVVA требует расширенной конфигурации Nginx, которая обрабатывает:
- Раздачу статических файлов UI
- Прокси API бекенда по пути `/api`
- Пререндеринг для SEO-ботов и файлы discovery (`/robots.txt`, `/sitemap*.xml`)
- Динамическую конфигурацию
- Поддержку WebSocket

**Скачать полный шаблон конфигурации Nginx:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/_shared/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/_shared/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Просмотреть полный пример**: [nginx.conf.example](/docs/_shared/installation/nginx.conf.example)

**Ключевые возможности:**
1. Перенаправление с HTTP на HTTPS
2. Настройка SSL/TLS (Cloudflare Origin Certificates или Let's Encrypt)
3. Эндпоинт `/default_connect.json` — обязательная динамическая конфигурация для UI (`.yaml` также поддерживается как fallback)
4. Пререндеринг для ботов — серверно отрендеренный HTML для поисковиков, AI-кроулеров и unfurl’ов (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple; GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot, ...; Telegram, X, Facebook, Discord, Slack, WhatsApp, iMessage, LinkedIn, Reddit, Pinterest)
5. Маршруты для SEO discovery — `/robots.txt`, `/sitemap.xml` и `/sitemap-*.xml`, проксируемые на бекенд по домену
6. Прокси `/api` — пересылает API-запросы на бэкенд на порт 7000
7. Поддержка WebSocket — для функций реального времени
8. Раздача статических файлов с маршрутизацией SPA
9. Умное кэширование — `index.html` никогда не кэшируется, ассеты кэшируются на 1 год

#### Что даёт SEO-слой

С этой конфигурацией бэкенд отдаёт краулерам полностью отрендеренную HTML-версию каждой страницы (тело поста, автор, время публикации/обновления, теги, структурированные данные, Open Graph с правильными размерами изображений), в то время как пользователи получают быстрый SolidJS SPA. Пер-доменные sitemap и `robots.txt` генерируются бэкендом, поэтому каждый домен на вашем ноде получает собственную поверхность discovery, политику AI-кроулеров и канонические URL.

Для корректной работы необходимо выполнить три условия:

1. Бэкенд (`savva-backend`) должен быть в версии, которая поставляет эндпоинты `/api/render`, `/api/robots.txt` и `/api/sitemap*.xml`.
2. Ваш домен должен быть указан под `domains:` в `/etc/savva.yml`, и его ключ должен точно совпадать со значением `set $default_domain "..."` в этой конфигурации Nginx.
3. Должна быть настроена маршрутизация Nginx, описанная ниже. (Стандартная конфигурация, от которой многие старые деплои начинали, содержит regex для ботов эры 2018 года, который пропускает почти всех AI-кроулеров, не имеет перенаправлений для `/robots.txt` или `/sitemap.xml` и использует устаревший шаблон `/api/render/$scheme://$host$uri`, который бэкенд больше не принимает. При обновлении старой конфигурации замените эти три части.)

### Понимание /default_connect.json

UI требует эндпоинт `/default_connect.json`, который сообщает, где находится бэкенд, какие цепи он обслуживает и какой IPFS-гейтвей использовать (также поддерживается `/default_connect.yaml` как fallback). Это настраивается прямо в Nginx.

UI принимает две схемы — выберите ту, которая соответствует вашему развертыванию. Новый формат `chains` предпочтителен для новых и мульти-цепочных сайтов; устаревший формат `backendLink` всё ещё работает.

Новый формат (мульти-цепочки):

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

Устаревший формат (один бэкенд):

```nginx
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

location = /default_connect.json {
    default_type application/json;
    return 200 '{"domain":"$default_domain","backendLink":"$default_backend","default_ipfs_link":"$default_ipfs"}';
}
```

UI подтягивает эту конфигурацию при запуске. Значение `domain` должно совпадать с ключом под `domains:` в вашем `/etc/savva.yml`, и именно оно передаётся SEO-перенаправлениями в бэкенд как `?domain=`, чтобы бэкенд мог определить, какую конфигурацию домена рендерить.

Настройте конфигурацию:

Отредактируйте эти ключевые переменные в скачанном файле:

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

Затем обновите `chainId` / `rpc` (или устаревшие `set $default_backend` / `set $default_ipfs`) внутри блока `/default_connect.json`, чтобы они соответствовали вашей цепи.

Разверните файлы и включите сайт:

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

### Вариант B: Автоматизированный скрипт деплоя

Создайте скрипт деплоя:

```bash
nano deploy.sh
chmod +x deploy.sh
```

Содержимое скрипта:

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

Запуск деплоя:

```bash
./deploy.sh
```

## 6. Проверка установки

Проверьте UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

### Smoke-тесты SEO-слоя

После перезагрузки Nginx убедитесь, что боты, кроулеры и discovery-файлы корректно доходят до бэкенда. Замените `yourdomain.com` на ваш реальный хостнейм.

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

Если какой-либо из этих запросов возвращает SPA shell там, где должен быть рендер бота (или наоборот), наиболее распространённые причины:

- Бэкенд ещё не работает на версии, которая предоставляет `/api/render`, `/api/robots.txt` и `/api/sitemap*.xml`.
- Значение `set $default_domain "..."` в вашей конфигурации Nginx не совпадает с ключом под `domains:` в `/etc/savva.yml`.
- Ваш upstream `/api` недоступен с хоста Nginx (`curl -s http://localhost:7000/api/info` на хосте Nginx должен вернуть JSON).

Откройте в браузере:
- Перейдите на `https://yourdomain.com`
- UI должен загрузиться и подключиться к бэкенду
- Проверьте консоль браузера на наличие ошибок

## 7. Конфигурация после развертывания

### Обновление CORS на бэкенде

Убедитесь, что бэкенд позволяет доступ с домена вашего UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Настройка CDN (опционально)

Для лучшей производительности рассмотрите использование CDN:

- **Cloudflare**: добавьте сайт в Cloudflare, обновите DNS
- **AWS CloudFront**: создайте дистрибуцию, указывая origin
- **Другие CDN**: следуйте документации провайдера

### Настройка мониторинга

Добавьте мониторинг аптайма и ошибок:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## Устранение неполадок

### Сбой сборки

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Проблемы с подключением к бэкенду

- Проверьте `VITE_BACKEND_URL` в `.env`
- Убедитесь в настройках CORS на бэкенде
- Посмотрите консоль браузера на предмет ошибок
- Протестируйте здоровье бэкенда: `curl https://api.yourdomain.com/api/info`

### Пустая страница / белый экран

- Проверьте консоль браузера на наличие ошибок JavaScript
- Убедитесь, что все ассеты загрузились корректно
- Проверьте конфигурацию Nginx для маршрутизации SPA
- Убедитесь, что директива `try_files` настроена правильно

### Web3-кошелёк не подключается

- Проверьте, включён ли HTTPS (требуется для Web3)
- Убедитесь, что RPC-URL блокчейна доступен
- Проверьте, установлен ли расширение-кошелёк в браузере
- Проверьте заголовки Content Security Policy