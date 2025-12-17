# Налаштування UI Вебсайту

Цей посібник охоплює встановлення та розгортання фронтенда SAVVA UI.

## Огляд

SAVVA UI — односторінковий додаток на SolidJS, який надає:
- Інтерфейс для створення та перегляду контенту
- Інтеграцію Web3-гаманців
- Завантаження файлів в IPFS
- Взаємодію зі смарт-контрактами
- Підтримку кількох мов

## 1. Клонувати репозиторій

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Встановити залежності

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Конфігурація

### Створити файл середовища

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

UI автоматично отримує адреси смарт-контрактів з бекенду через endpoint `/info`, який читає з Config контракту.

Немає потреби в жорстко вбудованих адресах контрактів у конфігурації UI.

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

Збудована папка `dist/` містить статичні файли, які можуть обслуговуватися будь-яким веб-сервером.

#### Використання Nginx (рекомендується)

SAVVA потребує комплексної конфігурації Nginx, яка обробляє:
- Обслуговування статичних файлів UI
- Проксі бекенду на `/api`
- Попередній рендеринг для ботів (SEO)
- Динамічний endpoint конфігурації
- Підтримку WebSocket

Завантажте повний шаблон конфігурації Nginx:

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

Переглянути повний приклад: [nginx.conf.example](nginx.conf.example)

Ключові можливості, що включені:
1. Перенаправлення HTTP на HTTPS
2. Налаштування SSL/TLS (Cloudflare Origin Certificates або Let's Encrypt)
3. Endpoint `/default_connect.yaml` — надає UI URL бекенду та IPFS-шлюзу
4. Попередній рендеринг для ботів — SEO-дружнє серверне рендерування для пошукових систем та соцмереж
5. Проксі `/api` — пересилає API-запити на бекенд на порті 7000
6. Підтримка WebSocket — для реального часу
7. Обслуговування статичних файлів з маршрутизацією SPA
8. Розумне кешування — `index.html` не кешується, ресурси кешуються на 1 рік

Налаштуйте конфігурацію:

Відредагуйте ці ключові змінні у завантаженому файлі:

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

Розгорніть файли та активуйте сайт:

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

#### Використання Apache

Створіть конфігурацію Apache:

```bash
sudo nano /etc/apache2/sites-available/savva-ui.conf
```

Конфіг Apache:

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

Активуйте сайт:

```bash
sudo a2enmod ssl rewrite headers deflate
sudo a2ensite savva-ui
sudo systemctl reload apache2
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

### Варіант C: Розгортання через Docker

Створіть Dockerfile:

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

Збірка та запуск:

```bash
# Build image
docker build -t savva-ui .

# Run container
docker run -d -p 80:80 --name savva-ui savva-ui
```

## 6. Перевірка встановлення

Перевірте UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Відкрийте в браузері:
- Перейдіть на `https://yourdomain.com`
- UI має завантажитися та підключитися до бекенду
- Перевірте консоль браузера на наявність помилок

## 7. Налаштування після розгортання

### Оновити CORS бекенду

Переконайтеся, що бекенд дозволяє запити з домену вашого UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Налаштування CDN (необов'язково)

Для кращої продуктивності розгляньте використання CDN:

- **Cloudflare**: Додайте сайт у Cloudflare, оновіть DNS
- **AWS CloudFront**: Створіть дистрибуцію з вказівкою origin
- **Інші CDN**: Дотримуйтесь документації провайдера

### Налаштування моніторингу

Додайте моніторинг доступності та помилок:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## 8. Безперервне розгортання

### GitHub Actions

Створіть файл `.github/workflows/deploy.yml`:

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

## Усунення неполадок

### Збірка не вдається

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Проблеми з підключенням до бекенду

- Перевірте `VITE_BACKEND_URL` у файлі `.env`
- Перевірте налаштування CORS бекенду
- Перегляньте консоль браузера на наявність помилок
- Перевірте стан бекенду: `curl https://api.yourdomain.com/api/info`

### Порожня сторінка / білий екран

- Перевірте консоль браузера на помилки JavaScript
- Переконайтеся, що всі ресурси завантажуються правильно
- Перевірте конфігурацію Nginx/Apache для маршрутизації SPA
- Переконайтеся, що `try_files` або `FallbackResource` налаштовані

### Web3 гаманець не підключається

- Переконайтеся, що HTTPS увімкнено (потрібно для Web3)
- Перевірте доступність RPC-URL блокчейну
- Перевірте, чи встановлене розширення гаманця у браузері
- Перегляньте заголовки політики безпеки контенту (Content Security Policy)