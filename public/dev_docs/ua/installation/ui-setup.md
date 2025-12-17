# Налаштування UI Website

Цей посібник охоплює встановлення та розгортання фронтенду SAVVA UI.

## Огляд

SAVVA UI — односторінковий додаток на базі SolidJS, який надає:
- Інтерфейс створення та перегляду контенту
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

UI автоматично отримує адреси смарт-контрактів блокчейну з бекенду через ендпойнт `/info`, який читає їх з контракту Config.

У конфігурації UI немає необхідності в жорстко прописаних адресах контрактів.

## 4. Зібрати UI

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

Зібрана папка `dist/` містить статичні файли, які можна обслуговувати будь-яким веб-сервером.

#### Використання Nginx (рекомендовано)

SAVVA вимагає комплексної конфігурації Nginx, яка обробляє:
- Обслуговування статичних файлів UI
- Проксі бекенду на `/api`
- Попередній рендеринг для SEO-ботів
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

**Ключові можливості, що входять:**
1. Перенаправлення HTTP на HTTPS
2. Налаштування SSL/TLS (сертифікати Cloudflare Origin або Let's Encrypt)
3. Ендпойнт `/default_connect.yaml` — **обов'язковий** динамічний конфіг для UI
4. Пререндеринг для ботів — SEO-дружній серверний рендеринг для пошукових систем і соцмереж
5. Проксі `/api` — перенаправляє API-запити на бекенд на порті 7000
6. Підтримка WebSocket — для функцій в реальному часі
7. Обслуговування статичних файлів з маршрутизацією SPA
8. Розумне кешування — `index.html` ніколи не кешується, ассети кешуються на 1 рік

### Розуміння default_connect.yaml

UI потребує ендпойнт `/default_connect.yaml`, який повідомляє, де знайти бекенд і шлюз IPFS. Це налаштовується безпосередньо в Nginx за допомогою змінних:

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

Цей ендпойнт повертає YAML-відповідь виду:
```yaml
domain: yourdomain.com
backendLink: https://yourdomain.com/api/
default_ipfs_link: https://gateway.pinata.cloud/ipfs/
```

UI зчитує цю конфігурацію під час запуску, щоб знати, до чого підключатися.

**Налаштуйте конфігурацію:**

Відредагуйте ці ключові змінні у завантаженому файлі:

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

### Варіант B: Скрипт автоматичного розгортання

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

Відкрийте у браузері:
- Перейдіть на `https://yourdomain.com`
- UI повинен завантажитись і підключитися до бекенду
- Перевірте консоль браузера на наявність помилок

## 7. Налаштування після розгортання

### Оновити CORS на бекенді

Переконайтесь, що бекенд дозволяє домен вашого UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Налаштувати CDN (необов'язково)

Для кращої продуктивності розгляньте використання CDN:

- **Cloudflare**: Додайте сайт у Cloudflare, оновіть DNS
- **AWS CloudFront**: Створіть дистрибуцію з походженням
- **Інші CDN**: Дотримуйтесь документації провайдера

### Налаштування моніторингу

Додайте моніторинг доступності та помилок:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## Усунення несправностей

### Збірка не вдається

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Проблеми з підключенням до бекенду

- Перевірте `VITE_BACKEND_URL` в `.env`
- Перевірте налаштування CORS на бекенді
- Перегляньте консоль браузера на предмет помилок
- Перевірте стан бекенду: `curl https://api.yourdomain.com/api/info`

### Порожня сторінка / Білий екран

- Перевірте консоль браузера на JavaScript-помилки
- Переконайтесь, що всі ассети завантажуються коректно
- Перевірте конфігурацію Nginx для маршрутизації SPA
- Переконайтесь, що директива `try_files` налаштована правильно

### Web3-гаманець не підключається

- Перевірте, чи увімкнено HTTPS (потрібно для Web3)
- Переконайтесь, що RPC-URL блокчейну доступний
- Перевірте, чи встановлене розширення гаманця в браузері
- Перегляньте заголовки політики безпеки контенту (CSP)