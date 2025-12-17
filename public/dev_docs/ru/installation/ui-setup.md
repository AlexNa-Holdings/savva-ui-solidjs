# Настройка веб-сайта UI

Это руководство описывает установку и развёртывание фронтенда SAVVA UI.

## Обзор

SAVVA UI — одностраничное приложение на основе SolidJS, которое обеспечивает:
- Интерфейс создания и просмотра контента
- Интеграцию с Web3-кошельками
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

UI автоматически получает адреса блокчейн-контрактов с бэкенда через endpoint `/info`, который читает их из контракта Config.

В конфигурации UI не требуется жёстко задавать адреса контрактов.

## 4. Сборка UI

### Сборка для разработки

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Сборка для production

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Сборка с деплоем

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

## 5. Развёртывание в продакшн

### Вариант A: Хостинг статических файлов

Собранная `dist/` папка содержит статические файлы, которые можно отдавать любым веб-сервером.

#### Использование Nginx (рекомендуется)

SAVVA требует комплексной конфигурации Nginx, которая обеспечивает:
- Раздачу статических файлов UI
- Прокси бэкенда по пути `/api`
- Пререндеринг для SEO-ботов
- Динамическую конечную точку конфигурации
- Поддержку WebSocket

**Скачайте шаблон полной конфигурации Nginx:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Просмотреть полный пример**: [nginx.conf.example](nginx.conf.example)

**Ключевые возможности:**
1. Перенаправление HTTP на HTTPS
2. Настройка SSL/TLS (Cloudflare Origin Certificates или Let's Encrypt)
3. Endpoint `/default_connect.yaml` — предоставляет UI URL-ы бэкенда и IPFS-гейтвея
4. Пререндеринг для ботов — SEO-дружественный серверный рендеринг для поисковых систем и соцсетей
5. Прокси `/api` — пересылает API-запросы на бэкенд на порт 7000
6. Поддержка WebSocket — для функций реального времени
7. Раздача статических файлов с маршрутизацией SPA
8. Интеллектуальное кеширование — index.html никогда не кешируется, ассеты кешируются на 1 год

**Настройка конфигурации:**

Отредактируйте эти ключевые переменные в загруженном файле:

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

**Разверните файлы и включите сайт:**

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

#### Использование Apache

Создайте конфигурацию Apache:

```bash
sudo nano /etc/apache2/sites-available/savva-ui.conf
```

Конфигурация Apache:

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

Включите сайт:

```bash
sudo a2enmod ssl rewrite headers deflate
sudo a2ensite savva-ui
sudo systemctl reload apache2
```

### Вариант B: Автоматический скрипт деплоя

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

### Вариант C: Развёртывание в Docker

Создайте Dockerfile:

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

Сборка и запуск:

```bash
# Build image
docker build -t savva-ui .

# Run container
docker run -d -p 80:80 --name savva-ui savva-ui
```

## 6. Проверка установки

Проверьте UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Откройте в браузере:
- Перейдите на `https://yourdomain.com`
- UI должен загрузиться и подключиться к бэкенду
- Проверьте консоль браузера на наличие ошибок

## 7. Постдеплойная конфигурация

### Обновите CORS бэкенда

Убедитесь, что бэкенд разрешает ваш домен UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Настройка CDN (опционально)

Для лучшей производительности рассмотрите использование CDN:

- **Cloudflare**: Добавьте сайт в Cloudflare, обновите DNS
- **AWS CloudFront**: Создайте дистрибутив, указывающий на origin
- **Другие CDN**: Следуйте документации провайдера

### Настройка мониторинга

Добавьте мониторинг доступности и ошибок:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## 8. Непрерывный деплой

### GitHub Actions

Создайте `.github/workflows/deploy.yml`:

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

## Устранение неполадок

### Сборка не проходит

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Проблемы с подключением к бэкенду

- Проверьте `VITE_BACKEND_URL` в `.env`
- Убедитесь в корректности настроек CORS на бэкенде
- Посмотрите ошибки в консоли браузера
- Проверьте работоспособность бэкенда: `curl https://api.yourdomain.com/api/info`

### Пустая страница / белый экран

- Проверьте консоль браузера на наличие ошибок JavaScript
- Убедитесь, что все ассеты загрузились корректно
- Проверьте конфигурацию Nginx/Apache для маршрутизации SPA
- Убедитесь, что настроен `try_files` или `FallbackResource`

### Web3-кошелёк не подключается

- Проверьте, включён ли HTTPS (требуется для Web3)
- Убедитесь, что RPC-URL блокчейна доступен
- Проверьте, установлено ли расширение кошелька в браузере
- Проверьте заголовки политики безопасности контента (Content Security Policy)