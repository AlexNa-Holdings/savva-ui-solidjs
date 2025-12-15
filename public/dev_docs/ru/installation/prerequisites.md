# Prerequisites

Перед установкой SAVVA убедитесь, что ваша среда соответствует следующим требованиям.

## Server Requirements

### Hardware

- **CPU**: рекомендуется 2 и более ядра
- **RAM**: минимум 4 ГБ, рекомендуется 8 ГБ
- **Storage**: SSD 50 ГБ и более (увеличивается с объёмом контента)
- **Network**: стабильное подключение к Интернету с публичным IP-адресом

### Operating System

- **Linux**: Ubuntu 20.04 LTS или более поздняя версия (рекомендуется)
- **Alternative**: Debian 10+, CentOS 8+ или любая современная Linux-дистрибуция
- **macOS/Windows**: возможно для разработки, не рекомендуется для продакшна

## Software Requirements

### 1. PostgreSQL Database

**Required version**: PostgreSQL 14 или более поздняя версия

У вас есть два варианта:

**Вариант A: Управляемая база данных** (рекомендуется для продакшна)

Мы рекомендуем **DigitalOcean Managed Databases** для боевых развертываний:

- **Преимущества**:
  - Автоматические бэкапы и восстановление по точке во времени
  - Автоматические обновления и патчи безопасности
  - Высокая доступность и переключение при сбое
  - Мониторинг и оповещения
  - Нет необходимости в управлении БД вручную

- **Настройка**:
  1. Создайте учётную запись на https://digitalocean.com
  2. Перейдите в Databases → Create Database
  3. Выберите PostgreSQL 14 или новее
  4. Выберите план (начинается с $15/месяц)
  5. Выберите регион дата-центра (ближе к вашему серверу)
  6. Зафиксируйте данные для подключения (host, port, username, password, database name)

**Вариант B: Самостоятельный хостинг** (для разработки или кастомных настроек)

Установите PostgreSQL на ваш собственный сервер:

```bash
# Required version check
psql --version  # Should output: psql (PostgreSQL) 14.x or higher
```

Установка на Ubuntu:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. IPFS Storage

SAVVA требует одновременно локальный узел IPFS И внешнюю службу закрепления (pinning) для надёжного хранения контента.

**A. Локальный узел IPFS** (обязательно)

Установите и запустите локальный узел IPFS для работы с контентом:

```bash
# Install IPFS Kubo
wget https://dist.ipfs.tech/kubo/v0.24.0/kubo_v0.24.0_linux-amd64.tar.gz
tar -xvzf kubo_v0.24.0_linux-amd64.tar.gz
cd kubo
sudo bash install.sh

# Initialize IPFS
ipfs init

# Configure IPFS (optional: increase connection limits)
ipfs config Datastore.StorageMax 50GB

# Start IPFS daemon
ipfs daemon
```

Для продакшна настройте IPFS как системную службу:
```bash
sudo nano /etc/systemd/system/ipfs.service
```

```ini
[Unit]
Description=IPFS Daemon
After=network.target

[Service]
Type=simple
User=youruser
ExecStart=/usr/local/bin/ipfs daemon
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable ipfs
sudo systemctl start ipfs
```

**B. Внешняя служба закрепления (pinning)** (обязательно)

Чтобы обеспечить постоянство и доступность контента, вы **должны** подписаться как минимум на одну службу закрепления IPFS:

**Рекомендуемые сервисы:**

1. **Pinata** (https://pinata.cloud)
   - Бесплатный тариф: 1 ГБ хранилища
   - Доступны платные планы
   - Простая интеграция по API
   - **Public Gateway**: `https://gateway.pinata.cloud/ipfs/`

2. **Web3.Storage** (https://web3.storage)
   - Доступен бесплатный тариф
   - Основан на Filecoin
   - Простой API
   - **Public Gateway**: `https://w3s.link/ipfs/`

3. **Filebase** (https://filebase.com)
   - API, совместимый с S3
   - Включён IPFS-pin
   - Гео-резервированное хранение
   - **Public Gateway**: `https://ipfs.filebase.io/ipfs/`

4. **NFT.Storage** (https://nft.storage)
   - Бесплатно для NFT-контента
   - Ограничено случаями использования NFT
   - **Public Gateway**: `https://nftstorage.link/ipfs/`

**Важно**: выберите сервис, который предоставляет **публичный IPFS-шлюз** (gateway) URL. Этот шлюз позволяет пользователям получать доступ к контенту даже если у них нет установленного IPFS.

**Шаги настройки:**

1. Создайте учётную запись в выбранном сервисе закрепления
2. Сгенерируйте API-ключ
3. Зафиксируйте URL публичного шлюза
4. Сконфигурируйте бэкенд с:
   - учётными данными API pinning-сервиса
   - URL публичного шлюза для получения контента
5. Проверьте соединение перед запуском в боевой режим

**Зачем нужны оба:**

- **Локальный узел IPFS**: быстрый загруз/скачивание контента, локическое кэширование, участие в сети
- **Служба закрепления**: гарантирует постоянство контента, избыточность и высокую доступность, даже когда ваш сервер офлайн

### 3. Web Server (Production)

Для боевого развертывания:

**Nginx** (рекомендуется):
```bash
sudo apt install nginx
```

**Apache** (альтернатива):
```bash
sudo apt install apache2
```

### 4. SSL Certificate

Для HTTPS (обязательно в продакшне):

**Использование Let's Encrypt** (бесплатно):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Blockchain Requirements

### Web3 Provider

Вам нужен доступ к совместимой с Ethereum блокчейн-сети. SAVVA поддерживает как HTTP(S), так и WebSocket (WSS) подключения.

**Типы подключений:**

- **HTTPS RPC**: `https://rpc.example.com` — стандартное HTTP-подключение
- **WSS RPC**: `wss://rpc.example.com` — **рекомендуется** для более быстрой обработки событий и реального времени

**Рекомендуется: использовать WSS** в продакшне для:
- мониторинга событий блокчейна в реальном времени
- более быстрых подтверждений транзакций
- снижения задержек при взаимодействии с пользователем

**Вариант A: Поставщики узлов (рекомендуется)**

Мы рекомендуем использовать **AllNodes** или аналогичных управляемых провайдеров узлов:

1. **AllNodes** (https://www.allnodes.com)
   - Поддерживает PulseChain, Ethereum и другие EVM-цепочки
   - Предоставляет как HTTPS, так и WSS endpoints
   - Высокая доступность и избыточность
   - Планы начинаются примерно от $20/месяц

2. **Альтернативы**:
   - **Infura** (https://infura.io) — Ethereum, Polygon, Arbitrum
   - **Alchemy** (https://alchemy.com) — несколько цепочек
   - **QuickNode** (https://quicknode.com) — широкая поддержка цепочек
   - **GetBlock** (https://getblock.io) — несколько протоколов

**Шаги настройки**:
1. Создайте учётную запись у выбранного провайдера
2. Создайте новый узел/endpoint для вашей цепочки (например, PulseChain)
3. Получите как HTTPS, так и WSS URL-адреса endpoint'ов
4. Сконфигурируйте бэкенд для использования WSS endpoint'а для оптимальной производительности

**Вариант B: Собственный узел**

Запустите свой блокчейн-узел для максимального контроля:

- **Преимущества**: полный контроль, отсутствие зависимости от третьих сторон, отсутствие лимитов запросов
- **Недостатки**: требует значительных ресурсов и постоянного обслуживания
- **Хранилище**: SSD 500 ГБ и более (будет расти со временем)
- **Время синхронизации**: от нескольких часов до нескольких дней в зависимости от цепочки

Для PulseChain:
```bash
# Example: Running a PulseChain node with go-pulse
# See official PulseChain documentation for detailed setup
```

**Требования к сети**:
- RPC endpoint URL (HTTPS или WSS)
- **Рекомендуется**: WSS endpoint для быстрой обработки событий
- Приватный ключ для деплоя контрактов (если разворачиваете собственную сеть)
- Нативные токены для оплаты газа (PLS для PulseChain, ETH для Ethereum и т.д.)

**Примечание**: все необходимые смарт-контракты SAVVA уже задеплоены в PulseChain. См. [Official Contract Addresses](../licenses/official-contracts.md) для полного списка.

## Network Configuration

### Firewall Ports

Откройте следующие порты:

- **80**: HTTP (перенаправление на HTTPS)
- **443**: HTTPS (интерфейс)
- **8080**: Backend API (может быть только внутренним)
- **4001**: IPFS Swarm (если запущен локальный IPFS)
- **5001**: IPFS API (только localhost)
- **8545**: Ethereum RPC (если запущен локальный узел)

Пример с использованием `ufw`:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8080/tcp  # Or keep internal
sudo ufw enable
```

### DNS Configuration

Укажите ваш домен на сервер:
- **A Record**: `yourdomain.com` → IP сервера
- **A Record**: `www.yourdomain.com` → IP сервера (опционально)

**Примечание**: API бэкенда обслуживается с того же домена по пути `/api` (например, `https://yourdomain.com/api`), поэтому отдельный субдомен не требуется.

## Verification Checklist

Перед продолжением проверьте все предпосылки:

- Сервер с достаточными ресурсами (2+ CPU, 4 ГБ+ ОЗУ, 50 ГБ+ SSD)
- PostgreSQL 14+ установлен и запущен (или настроена управляемая БД)
- Узел IPFS запущен как служба systemd
- Служба закрепления IPFS настроена с публичным шлюзом
- Установлен Nginx или Apache
- Зарегистрирован домен и настроен DNS
- Получен SSL-сертификат
- Настроен доступ к RPC блокчейна (предпочтительно WSS)
- Открыты порты брандмауэра