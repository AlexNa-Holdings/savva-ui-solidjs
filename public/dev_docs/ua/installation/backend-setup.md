# Налаштування бекенд-сервера

Цей посібник охоплює встановлення та конфігурацію бекенд-сервера SAVVA.

## Огляд

Бекенд SAVVA — це API-сервер на Go, який відповідає за:
- Аутентифікацію користувачів та сесії
- Зберігання та отримання постів (PostgreSQL)
- Інтеграцію з IPFS для збереження контенту
- WebSocket-з’єднання для оновлень у реальному часі
- Взаємодію з блокчейном та моніторинг

## 1. Завантаження бекенд-програми

Остання версія бекенду SAVVA доступна за адресою:

**https://savva.app/public_files/**

**Важливі примітки**:
- Бекенд наразі активно розробляється — регулярно перевіряйте наявність нових релізів
- Бекенд ще не відкрито — плануємо зробити його open source у майбутньому
- Завантажуйте останню версію, що підходить для вашої платформи (зазвичай `savva-backend-linux-amd64`)

```bash
# Download latest backend
cd /opt
sudo wget https://savva.app/public_files/savva-backend-linux-amd64

# Make executable
sudo chmod +x savva-backend-linux-amd64
sudo mv savva-backend-linux-amd64 savva-backend
```

## 2. Налаштування бази даних

### Варіант A: Відновлення з останньої резервної копії (рекомендується)

Щоб зменшити час синхронізації, ви можете відновити базу даних з останньої резервної копії. Резервна копія містить:
- Усі необхідні структури бази даних
- Усі відомості про контент з мережі SAVVA
- **Жодної персональної інформації користувачів** (безпечно для приватності)

База даних автоматично резервується щодня і доступна за адресою:

**https://savva.app/public_files/**

Шукайте файли на кшталт `savva-db-backup-YYYY-MM-DD.sql.gz`

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

### Варіант B: Нова база даних (для розробки)

Якщо ви віддаєте перевагу початку з нуля:

```bash
# Create database and user
sudo -u postgres psql << 'EOF'
CREATE DATABASE savva;
CREATE USER savva_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE savva TO savva_user;
\q
EOF
```

Примітка: бекенд створить необхідні таблиці автоматично при першому запуску.

## 3. Конфігурація

Створіть файл конфігурації бекенду SAVVA за адресою `/etc/savva.yml`.

### Завантажити шаблон конфігурації

Доступний повний приклад конфігурації:

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/_shared/installation/savva.yml.example

# Or view it locally at:
# public/dev_docs/_shared/installation/savva.yml.example

# Copy to system location
sudo cp savva.yml.example /etc/savva.yml
sudo chmod 600 /etc/savva.yml  # Protect configuration file
```

Переглянути повний приклад: [savva.yml.example](/dev_docs/_shared/installation/savva.yml.example)

### Параметри конфігурації

#### Налаштування блокчейну

```yaml
blockchain-rpc: wss://your-rpc-endpoint.com:8546/your-api-key
initial-block: 20110428  # Starting block number for sync
```

- **blockchain-rpc**: WebSocket RPC-ендпойнт (рекомендується WSS для подій у реальному часі)
  - Отримайте з AllNodes, Infura або зі свого власного нода
  - Формат: `wss://hostname:port/api-key`
- **initial-block**: Номер блоку, з якого починати синхронізацію (щоб пропустити стару історію)

#### Контракти

```yaml
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8
```

Використовуйте офіційну адресу контракту SAVVA Config з [Офіційні адреси контрактів](../licenses/official-contracts.md).

#### Конфігурація бази даних

```yaml
db:
  type: postgres
  connection-string: postgresql://username:password@host:port/database?sslmode=require
```

- **Для керованої бази даних DigitalOcean**: Скопіюйте рядок підключення з панелі DigitalOcean
- **Для самостійного хостингу**: `postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable`

#### Налаштування сервера

```yaml
server:
  port: 7000
  url-prefix: "/api"
  rpm-limit: 600  # Requests per minute limit
  cors-allowed-origins:
    - yourdomain.com
    - www.yourdomain.com
```

- **port**: Порт API бекенду (за замовчуванням: 7000)
- **url-prefix**: Префікс шляху API (зазвичай "/api")
- **rpm-limit**: Обмеження швидкості (запитів за хвилину з однієї IP)
- **cors-allowed-origins**: Список дозволених доменів для CORS

#### Налаштування IPFS

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

- **url**: Локальний API-ендпойнт IPFS
- **pin-services**: Налаштуйте ваш(і) pinning-сервіс(и) з API-ключами
- **gateways**: Публічні IPFS-шлюзи для отримання контенту

#### Контент та зберігання

```yaml
content-retry-delay: 5m
max-content-retries: 3
temp-folder: /tmp/savva
data-folder: /var/lib/savva
max-user-disk-space: 50 MB
max-post-size: 50 MB
```

- **data-folder**: Постійне сховище для ресурсів домену
- **temp-folder**: Тимчасове зберігання файлів
- **max-post-size**: Максимальний розмір одного поста

#### Кешування

```yaml
user-cache-ttl: 6h
post-cache-ttl: 6h
```

Час життя кешованих даних.

#### Повнотекстовий пошук

```yaml
full-text-search:
  enabled: true
  languages: [english, russian, french]
```

Увімкніть повнотекстовий пошук PostgreSQL з бажаними мовами.

#### Логування

```yaml
verbosity: info  # Options: trace, debug, info, warn, error
log-prefix: SAVVA
```

#### Налаштування домену

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

- **process-all-domains**: Встановіть в `true`, щоб обробляти всі домени мережі SAVVA
- **domains**: Налаштування специфічні для домену (необов’язково)

### Повний приклад конфігурації

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

### Створіть директорії для зберігання

```bash
sudo mkdir -p /var/lib/savva
sudo mkdir -p /tmp/savva
sudo chown -R your-user:your-user /var/lib/savva /tmp/savva
```

## 4. Запуск бекенду

### Перевірка конфігурації

```bash
# Test run to verify configuration
cd /opt
./savva-backend --config /etc/savva.yml
```

Натисніть Ctrl+C, щоб зупинити, якщо він успішно запустився.

### Налаштування systemd-сервісу

Створіть файл systemd-сервісу:

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

Увімкніть та запустіть:

```bash
sudo systemctl daemon-reload
sudo systemctl enable savva-backend
sudo systemctl start savva-backend
sudo systemctl status savva-backend

# View logs
sudo journalctl -u savva-backend -f
```

## 5. Перевірка встановлення

```bash
# Test backend health (local)
curl http://localhost:7000/api/info

# Should return: {"status":"ok"}
```

Ви повинні отримати JSON-відповідь, яка вказує, що бекенд працює. Логи бекенду можна переглядати за допомогою:

```bash
# View real-time logs
sudo journalctl -u savva-backend -f

# View recent logs
sudo journalctl -u savva-backend -n 100
```