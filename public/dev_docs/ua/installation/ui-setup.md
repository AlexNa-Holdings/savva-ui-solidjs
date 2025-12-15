# Налаштування UI вебсайту

Цей посібник описує встановлення та розгортання фронтенду SAVVA UI.

## Огляд

SAVVA UI — односторінковий додаток на SolidJS, який надає:
- Інтерфейс для створення та перегляду контенту
- Інтеграцію Web3-гаманців
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

## 3. Конфігурація

### Створення файлу оточення

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Змінні оточення

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

UI автоматично отримує адреси контрактів блокчейну з бекенду через кінцеву точку `/info`, яка читає з контракту Config.

У конфігурації UI не потрібні жорстко вбудовані адреси контрактів.

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

Зібрана папка `dist/` містить статичні файли, які можна розгорнути на будь-якому вебсервері.

#### Використання Nginx (рекомендовано)

SAVVA вимагає комплексної конфігурації Nginx, яка обробляє:
- Обслуговування статичних файлів UI
- Проксі бекенд API на `/api`
- Пререндеринг для SEO-ботів
- Динамічну кінцеву точку конфігурації
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

Ключові включені можливості:
1. Перенаправлення HTTP на HTTPS
2. Налаштування SSL/TLS (сертифікати Cloudflare Origin або Let's Encrypt)
3. Кінцева точка `/default_connect.yaml` — надає UI URL-адреси бекенду та IPFS-шлюзу
4. Пререндеринг для ботів — SEO-дружній рендеринг на стороні сервера для пошукових систем і соцмереж
5. Проксі `/api` — пересилає API-запити до бекенду на порті 7000
6. Підтримка WebSocket — для функцій у реальному часі
7. Обслуговування статичних файлів з маршрутизацією SPA
8. Розумне кешування — `index.html` ніколи не кешується, ресурси кешуються на 1 рік

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

Конфігурація Apache:

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

### Варіант B: Автоматизований скрипт деплою

Створіть скрипт деплою:

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

Запустіть деплой:

```bash
./deploy.sh
```

### Варіант C: Розгортання в Docker

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
- UI має завантажитись і підключитись до бекенду
- Перевірте консоль браузера на наявність помилок

## 7. Налаштування після розгортання

### Оновіть CORS на бекенді

Переконайтесь, що бекенд дозволяє доступ з вашого домену UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Налаштування CDN (за бажанням)

Для кращої продуктивності розгляньте використання CDN:

- Cloudflare: додайте сайт до Cloudflare, оновіть DNS
- AWS CloudFront: створіть дистрибуцію, яка вказує на origin
- Інші CDN: дотримуйтесь документації провайдера

### Налаштуйте моніторинг

Додайте моніторинг доступності та помилок:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## 8. Безперервне розгортання

### GitHub Actions

Створіть `.github/workflows/deploy.yml`:

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

- Перевірте `VITE_BACKEND_URL` у `.env`
- Переконайтесь у налаштуваннях CORS бекенду
- Перевірте консоль браузера на помилки
- Перевірте стан бекенду: `curl https://api.yourdomain.com/health`

### Порожня сторінка / Білий екран

- Перевірте консоль браузера на помилки JavaScript
- Переконайтесь, що всі ресурси завантажуються коректно
- Перевірте конфігурацію Nginx/Apache для маршрутизації SPA
- Переконайтесь, що `try_files` або `FallbackResource` налаштовано

### Web3-гаманець не підключається

- Переконайтесь, що HTTPS увімкнено (потрібно для Web3)
- Перевірте доступність RPC-URL блокчейну
- Переконайтесь, що розширення гаманця встановлене в браузері
- Перегляньте заголовки політики безпеки контенту (CSP)