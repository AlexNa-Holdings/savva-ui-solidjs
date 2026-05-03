# Настройка бэкенд-сервера

Это руководство описывает установку и настройку бэкенд-сервера SAVVA.

## Обзор

Бэкенд SAVVA — это сервер API на Go, который отвечает за:
- Аутентификацию пользователей и сессии
- Хранение и получение постов (PostgreSQL)
- Интеграцию с IPFS для хранения контента
- WebSocket-соединения для обновлений в реальном времени
- Взаимодействие с блокчейном и мониторинг

## 1. Загрузка программного обеспечения бэкенда

Последняя версия программного обеспечения бэкенда SAVVA доступна по адресу:

**https://savva.app/public_files/**

**Важные примечания**:
- Бэкенд в настоящее время находится в активной разработке — регулярно проверяйте наличие новых релизов
- Бэкенд пока не является открытым исходным кодом. Мы планируем открыть исходники в будущем
- Скачивайте последнюю версию, подходящую для вашей платформы (обычно `savva-backend-linux-amd64`)

```bash
# Download latest backend
cd /opt
sudo wget https://savva.app/public_files/savva-backend-linux-amd64

# Make executable
sudo chmod +x savva-backend-linux-amd64
sudo mv savva-backend-linux-amd64 savva-backend
```

## 2. Настройка базы данных

### Вариант A: Восстановление из последнего снимка (рекомендуется)

Чтобы сократить время синхронизации, вы можете восстановить базу данных из последнего снимка. Снимок включает:
- Вся необходимая структура базы данных
- Вся информация о контенте из сети SAVVA
- **Нет персональной информации пользователей** (безопасно для приватности)

База данных резервируется автоматически каждый день и доступна по адресу:

**https://savva.app/public_files/**

Ищите файлы вида `savva-db-backup-YYYY-MM-DD.sql.gz`

```bash
# Download latest database backup
wget https://savva.app/public_files/savva-db-backup-latest.sql.gz

# Create database and user
sudo -u postgres psql << 'EOF'
CREATE DATABASE savva;
CREATE USER savva_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE savva TO savva_user;
\q
EOF

# Restore from backup
gunzip -c savva-db-backup-latest.sql.gz | sudo -u postgres psql savva

# Grant permissions to your user
sudo -u postgres psql savva << 'EOF'
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO savva_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO savva_user;
\q
EOF
```

### Вариант B: Пустая база (для разработки)

Если вы предпочитаете начать с нуля:

```bash
# Create database and user
sudo -u postgres psql << 'EOF'
CREATE DATABASE savva;
CREATE USER savva_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE savva TO savva_user;
\q
EOF
```

Примечание: бэкенд создаст необходимые таблицы автоматически при первом запуске.

## 3. Конфигурация

Создайте файл конфигурации бэкенда SAVVA по пути `/etc/savva.yml`.

### Скачивание шаблона конфигурации

Полный пример конфигурации доступен:

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/_shared/installation/savva.yml.example

# Or view it locally at:
# public/dev_docs/_shared/installation/savva.yml.example

# Copy to system location
sudo cp savva.yml.example /etc/savva.yml
sudo chmod 600 /etc/savva.yml  # Protect configuration file
```

Посмотреть полный пример: [savva.yml.example](/dev_docs/_shared/installation/savva.yml.example)

### Параметры конфигурации

#### Настройки блокчейна

```yaml
blockchain-rpc: wss://your-rpc-endpoint.com:8546/your-api-key
initial-block: 20110428  # Starting block number for sync
```

- **blockchain-rpc**: WebSocket RPC-эндпоинт (рекомендуется WSS для событий в реальном времени)
  - Получите у AllNodes, Infura или с вашего собственного узла
  - Формат: `wss://hostname:port/api-key`
- **initial-block**: Номер блока, с которого начинать синхронизацию (чтобы пропустить старую историю)

#### Контракты

```yaml
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8
```

Используйте официальный адрес контракта SAVVA Config из [Official Contract Addresses](../licenses/official-contracts.md).

#### Конфигурация базы данных

```yaml
db:
  type: postgres
  connection-string: postgresql://username:password@host:port/database?sslmode=require
```

- **Для управляемой базы данных DigitalOcean**: Скопируйте строку подключения из панели DigitalOcean
- **Для собственной установки**: `postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable`

#### Настройки сервера

```yaml
server:
  port: 7000
  url-prefix: "/api"
  rpm-limit: 600  # Requests per minute limit
  cors-allowed-origins:
    - yourdomain.com
    - www.yourdomain.com
```

- **port**: Порт API бэкенда (по умолчанию: 7000)
- **url-prefix**: Префикс пути API (обычно "/api")
- **rpm-limit**: Ограничение скорости (запросов в минуту на IP)
- **cors-allowed-origins**: Список разрешённых доменов для CORS

#### Настройка IPFS

```yaml
ipfs:
  url: http://localhost:5001
  max-file-size: 100 MB
  timeout: 2m
  pin-services:
    - name: pinata
      url: https://api.pinata.cloud/pinning
      api-key: YOUR_PINATA_JWT_TOKEN
    - name: filebase
      url: https://api.filebase.io/v1/ipfs
      api-key: YOUR_FILEBASE_API_KEY
  gateways:
    - https://gateway.pinata.cloud/ipfs/
    - https://ipfs.filebase.io/ipfs/
```

- **url**: Локальный API-эндпоинт IPFS
- **pin-services**: Настройте ваши сервисы закрепления (pinning) с API-ключами
- **gateways**: Публичные IPFS-шлюзы для получения контента

#### Контент и хранилище

```yaml
content-retry-delay: 5m
max-content-retries: 3
temp-folder: /tmp/savva
data-folder: /var/lib/savva
max-user-disk-space: 50 MB
max-post-size: 50 MB
```

- **data-folder**: Постоянное хранилище для ресурсов домена
- **temp-folder**: Временное хранилище файлов
- **max-post-size**: Максимальный размер одного поста

#### Кеширование

```yaml
user-cache-ttl: 6h
post-cache-ttl: 6h
```

Время жизни кэша для данных.

#### Полнотекстовый поиск

```yaml
full-text-search:
  enabled: true
  languages: [english, russian, french]
```

Включите полнотекстовый поиск PostgreSQL с нужными языками.

#### Логирование

```yaml
verbosity: info  # Options: trace, debug, info, warn, error
log-prefix: SAVVA
```

#### Конфигурация доменов

```yaml
process-all-domains: true
domains:
  yourdomain.com:
    website: https://yourdomain.com
    admins:
      0xYourAdminAddress:
        alerts: all
    telegram-bot:
      enabled: false
```

- **process-all-domains**: Установите `true`, чтобы обрабатывать все домены сети SAVVA
- **domains**: Настройки, специфичные для доменов (опционально)

### Полный пример конфигурации

```yaml
# /etc/savva.yml - SAVVA Backend Configuration

# Blockchain
blockchain-rpc: wss://pls-rpc.example.com:8546/your-api-key
initial-block: 20110428

# Contracts (use official addresses)
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8

# Database
db:
  type: postgres
  connection-string: postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable

# Server
server:
  port: 7000
  url-prefix: "/api"
  rpm-limit: 600
  cors-allowed-origins:
    - yourdomain.com
    - www.yourdomain.com

# IPFS
ipfs:
  url: http://localhost:5001
  max-file-size: 100 MB
  timeout: 2m
  pin-services:
    - name: pinata
      url: https://api.pinata.cloud/pinning
      api-key: YOUR_PINATA_JWT_TOKEN
  gateways:
    - https://gateway.pinata.cloud/ipfs/

# Content & Storage
content-retry-delay: 5m
max-content-retries: 3
temp-folder: /tmp/savva
data-folder: /var/lib/savva
max-user-disk-space: 50 MB
max-post-size: 50 MB

# Caching
user-cache-ttl: 6h
post-cache-ttl: 6h

# Full-Text Search
full-text-search:
  enabled: true
  languages: [english]

# Logging
verbosity: info
log-prefix: SAVVA

# Domain Processing
process-all-domains: true
```

### Создание директорий для хранения

```bash
sudo mkdir -p /var/lib/savva
sudo mkdir -p /tmp/savva
sudo chown -R your-user:your-user /var/lib/savva /tmp/savva
```

## 4. Запуск бэкенда

### Тестирование конфигурации

```bash
# Test run to verify configuration
cd /opt
./savva-backend --config /etc/savva.yml
```

Нажмите Ctrl+C, чтобы остановить, если он успешно запустился.

### Настройка службы systemd

Создайте файл службы systemd:

```bash
sudo nano /etc/systemd/system/savva-backend.service
```

```ini
[Unit]
Description=SAVVA Backend API Server
After=network.target postgresql.service ipfs.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/opt
ExecStart=/opt/savva-backend --config /etc/savva.yml
Restart=always
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Включите и запустите:

```bash
sudo systemctl daemon-reload
sudo systemctl enable savva-backend
sudo systemctl start savva-backend
sudo systemctl status savva-backend

# View logs
sudo journalctl -u savva-backend -f
```

## 5. Проверка установки

```bash
# Test backend health (local)
curl http://localhost:7000/api/info

# Should return: {"status":"ok"}
```

Вы должны получить JSON-ответ, показывающий, что бэкенд запущен. Логи бэкенда можно просматривать с помощью:

```bash
# View real-time logs
sudo journalctl -u savva-backend -f

# View recent logs
sudo journalctl -u savva-backend -n 100
```