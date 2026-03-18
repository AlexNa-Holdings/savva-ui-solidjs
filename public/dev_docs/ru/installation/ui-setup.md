# Настройка сайта UI

Это руководство описывает установку и развёртывание фронтенда SAVVA UI.

## Обзор

SAVVA UI — одностраничное приложение на SolidJS, которое предоставляет:
- Интерфейс для создания и просмотра контента
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

### Создайте файл окружения

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

UI автоматически получает адреса смарт-контрактов блокчейна с конечной точки бэкенда `/info`, которая читает их из контракта Config.

В конфигурации UI нет необходимости жёстко прописывать адреса контрактов.

## 4. Сборка UI

### Режим разработки

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

### Сборка и развертывание

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

### Вариант A: Хостинг статических файлов

Папка с собранными файлами `dist/` содержит статические файлы, которые можно обслуживать любым веб-сервером.

#### Использование Nginx (рекомендуется)

SAVVA требует комплексной конфигурации Nginx, которая обеспечивает:
- Обслуживание статических файлов UI
- Проксирование запросов API на бэкенд по `/api`
- Пререндеринг для SEO-ботов
- Динамическую конечную точку конфигурации
- Поддержку WebSocket

**Скачать полный шаблон конфигурации Nginx:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Просмотреть полный пример**: [nginx.conf.example](nginx.conf.example)

**Ключевые функции, включённые в конфигурацию:**
1. Перенаправление HTTP на HTTPS
2. Настройка SSL/TLS (Cloudflare Origin Certificates или Let's Encrypt)
3. Конечная точка `/default_connect.json` — обязательно для динамической конфигурации UI (также поддерживается `.yaml` как резерв)
4. Пререндеринг для ботов — SEO-дружественный рендеринг на стороне сервера для поисковых систем и соцсетей
5. Проксирование `/api` — пересылает запросы API на бэкенд на порт 7000
6. Поддержка WebSocket — для функций в реальном времени
7. Обслуживание статических файлов с маршрутизацией SPA
8. Интеллектуальное кэширование — `index.html` никогда не кэшируется, ассеты кэшируются на 1 год

### Понимание default_connect.json

UI требует конечную точку `/default_connect.json`, которая сообщает, где найти бэкенд и шлюз IPFS (также поддерживается `/default_connect.yaml` как запасной вариант). Это настраивается прямо в Nginx с использованием переменных:

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

Эта конечная точка возвращает JSON-ответ вида:
```json
{
  "domain": "yourdomain.com",
  "backendLink": "https://yourdomain.com/api/",
  "default_ipfs_link": "https://gateway.pinata.cloud/ipfs/"
}
```

UI загружает эту конфигурацию при запуске, чтобы знать, к чему подключаться.

**Настройка конфигурации:**

Отредактируйте эти ключевые переменные в скачанном файле:

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

**Развернуть файлы и включить сайт:**

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

### Вариант B: Скрипт автоматического развертывания

Создайте скрипт развертывания:

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

Запуск развертывания:

```bash
./deploy.sh
```

## 6. Проверка установки

Проверить UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Откройте в браузере:
- Перейдите на `https://yourdomain.com`
- UI должен загрузиться и подключиться к бэкенду
- Проверьте консоль браузера на наличие ошибок

## 7. Конфигурация после развёртывания

### Обновление CORS на бэкенде

Убедитесь, что бэкенд разрешает домен вашего UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Настройка CDN (опционально)

Для повышения производительности рассмотрите использование CDN:

- **Cloudflare**: Добавьте сайт в Cloudflare, обновите DNS
- **AWS CloudFront**: Создайте дистрибуцию, указывающую на origin
- **Другие CDN**: Следуйте документации провайдера

### Настройка мониторинга

Добавьте мониторинг доступности и ошибок:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
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

- Проверьте `VITE_BACKEND_URL` в файле `.env`
- Проверьте настройки CORS на бэкенде
- Посмотрите ошибки в консоли браузера
- Проверьте состояние бэкенда: `curl https://api.yourdomain.com/api/info`

### Пустая страница / белый экран

- Проверьте консоль браузера на наличие ошибок JavaScript
- Убедитесь, что все ассеты загружены корректно
- Проверьте конфигурацию Nginx для маршрутизации SPA
- Убедитесь, что директива `try_files` настроена правильно

### Web3-кошелёк не подключается

- Проверьте, включён ли HTTPS (требуется для Web3)
- Убедитесь, что RPC-адрес блокчейна доступен
- Проверьте, установлен ли расширяемый кошелёк в браузере
- Проверьте заголовки Content Security Policy