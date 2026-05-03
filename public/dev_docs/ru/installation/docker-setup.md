# Docker Node Installation

Эта страница описывает рекомендованный способ запуска узла бэкенда SAVVA: публичный Docker-образ с одним стеком Compose. Если у вас установлен Docker (24+) и плагин Compose, рабочий узел настраивается примерно за час — исходники и инструментарий Go не требуются.

## Why Docker

SAVVA — это платформа для нескольких доменов. Один и тот же протокол и реестр контента в цепочке могут обслуживаться с любого количества независимых доменов, у каждого — свой бренд, сообщество и политика модерации. Любой желающий может поднять домен.

До выхода Docker-образа на практике это требовало сборки бэкенда из исходников и написания длинного YAML-конфига с нуля. Docker-бандл заменяет это одним образом, одним файлом `.env` и одной командой `docker compose up -d`. Протокол всегда был безразрешительным; образ делает реализацию соответствующей.

## What You'll Need

Пять вещей, ни одна из которых специфична для SAVVA:

1. **Linux-сервер или Mac** с Docker (24+) и плагином Compose. Подойдёт небольшой VPS. Потребуется место на диске для включённого хранилища IPFS — см. [About IPFS Storage](#about-ipfs-storage).
2. **База данных PostgreSQL** (14 или новее), до которой бэкенд может добраться. Она может работать на той же машине, в управляемом сервисе (DigitalOcean, RDS, Supabase, Neon и т.п.) или где угодно ещё.
3. **RPC URL блокчейна.** SAVVA работает на Monad. Публичный mainnet RPC `https://rpc.monad.xyz` работает из коробки без регистрации. Публичные RPC ограничены по скорости и являются общими, поэтому для узла, который вы планируете держать под реальной нагрузкой, лучше запустить собственный узел Monad или арендовать приватную точку доступа (QuickNode, Alchemy, Ankr и т.д.). Можно начать с публичного RPC и потом переключиться, изменив одну строку в `.env`.
4. **Админский адрес кошелька.** Идентичность кошелька, которой разрешено администрирование домена. Отдельный кошелёк **processor** (используется бэкендом для подписания транзакций с оплатой / шифрованным контентом) — опционален: узел можно запустить без него и добавить позже.
5. **Один — желательно два — аккаунта сервиса закрепления (pinning) для IPFS.** Включённый IPFS-узел хранит контент локально, но один узел — это единая точка отказа. Сервис pinning реплицирует закреплённый контент на надёжное внешнее хранилище и предоставляет публичный шлюз, чтобы любой мог получить ваш контент даже когда ваш узел офлайн.

   Рекомендуем **[Pinata](https://www.pinata.cloud/)** как основной сервис. Большинство pinning-сервисов только запрашивают CID из публичной сети IPFS *после* его публикации, что может означать минуты недоступности для только что опубликованного файла. API Pinata предоставляет прямой endpoint для загрузки, поэтому бэкенд отправляет файл напрямую в Pinata в тот же момент, когда добавляет его локально — контент становится надёжно закреплённым и сразу доступен через шлюз.

   Бесплатный план Pinata использует общий `gateway.pinata.cloud` (с ограничением скорости, подходит для узлов с низкой нагрузкой, рискован для публичных сервисов). **Выделённый шлюз** на поддомене под вашим контролем (`yourname.mypinata.cloud`) требует платного плана. У других сервисов — [web3.storage](https://web3.storage/), [Filebase](https://filebase.com/), [4everland](https://www.4everland.org/) — есть аналогичные разделения на общий/выделенный уровни.

   Добавьте второй сервис вместе с Pinata. Два независимых провайдера фактически устраняют риск, что простои, спор по оплате или изменение политики одной компании выведут ваш контент из доступа. Бандл поддерживает до десяти pin-сервисов (`PIN_SERVICE_2_*`, `PIN_SERVICE_3_*`, ...). Частая пара — Pinata как быстрый/надёжный основной и `web3.storage` или `Filebase` как более дешёвый запасной вариант.

   От каждого сервиса понадобятся три строки: **URL endpoint'а API**, **API-ключ** (обычно JWT) и **публичный URL их шлюза**.

Бандл поставляется с собственным IPFS-узлом — предоставлять отдельный узел не требуется. Если у вас уже есть IPFS-узел и вы хотите указывать на него, см. примечание о переопределении в конце [About IPFS Storage](#about-ipfs-storage).

Регистрации на стороне SAVVA нет и кроме pin-сервисов других API-ключей не требуется.

## The Five-Minute Install

### 1. Create the deploy directory and the two files

```sh
mkdir savva && cd savva
```

Create **`docker-compose.yml`**:

```yaml
services:
  ipfs:
    image: ipfs/kubo:latest
    container_name: savva-ipfs
    restart: unless-stopped
    environment:
      - IPFS_PROFILE=server
    volumes:
      # Override IPFS_DATA_PATH in .env to put the datastore on a
      # different disk. Default is ./ipfs-data alongside this file.
      - ${IPFS_DATA_PATH:-./ipfs-data}:/data/ipfs
    ports:
      # Swarm port — must be reachable from the public internet (or
      # at least NAT-traversable) for the node to participate in pin
      # replication. Bind both TCP and UDP.
      - "4001:4001"
      - "4001:4001/udp"
    healthcheck:
      test: ["CMD-SHELL", "ipfs --api=/ip4/127.0.0.1/tcp/5001 id >/dev/null 2>&1 || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 5s

  savva-backend:
    image: ghcr.io/alexna-holdings/savva-backend:${SAVVA_VERSION:-latest}
    container_name: savva-backend
    restart: unless-stopped
    env_file: .env
    depends_on:
      ipfs:
        condition: service_healthy
    ports:
      - "${PORT:-8080}:8080"
    volumes:
      - ./data:/data
      # Optional: mount a private key file and set PROCESSOR_KEY_FILE
      # in .env to point at this path inside the container.
      - ./secrets:/run/secrets:ro
```

Create **`.env`** (you'll fill in the values in step 2):

```sh
# ----------------------------------------------------------------------
# REQUIRED — fill these in before `docker compose up`.
# ----------------------------------------------------------------------

# Public hostname this instance serves (no scheme, no path).
DOMAIN=mysavva.example.com

# Wallet address(es) that administer the domain (EIP-55 checksummed).
# To list multiple admins, separate with commas: 0xAaa...,0xBbb...
ADMIN_ADDRESS=0xYourAdminWalletAddress

# Postgres connection string. The DB must already exist; see step 3.
DB_CONNECTION_STRING=postgres://savva:savva@db.example.com:5432/savva?sslmode=disable

# IPFS API endpoint. By default this points at the `ipfs` service
# bundled in docker-compose.yml above. Override only if you want to
# point at an IPFS node you run elsewhere.
# IPFS_URL=http://ipfs:5001

# Blockchain RPC URL. The Monad public mainnet RPC works out of the box;
# swap for a private endpoint if you need higher throughput / reliability.
BLOCKCHAIN_RPC=https://rpc.monad.xyz

# Primary IPFS pin service. Required — see step 5 in the prereqs.
# PIN_SERVICE_URL: the IPFS Pinning Service API endpoint
# PIN_SERVICE_API_KEY: the JWT / bearer token from your account
# PIN_SERVICE_GATEWAY: the service's public gateway URL
PIN_SERVICE_URL=https://api.pinata.cloud/psa
PIN_SERVICE_API_KEY=
PIN_SERVICE_GATEWAY=https://gateway.pinata.cloud/ipfs/

# Strongly recommended: a SECOND pin service for redundancy. The
# bundle supports up to ten (PIN_SERVICE_2_*, PIN_SERVICE_3_*, ...).
# PIN_SERVICE_2_URL=https://api.web3.storage/pins
# PIN_SERVICE_2_API_KEY=
# PIN_SERVICE_2_GATEWAY=https://w3s.link/ipfs/

# Processor signing key. OPTIONAL — leave empty to boot a node without
# processor capability. Set later when you want to handle paid /
# encrypted content. EITHER paste the raw hex key here, OR mount a
# file at ./secrets/processor.key and set PROCESSOR_KEY_FILE below.
PROCESSOR_KEY=
# PROCESSOR_KEY_FILE=/run/secrets/processor.key

# ----------------------------------------------------------------------
# OPTIONAL — sensible defaults are baked in. Uncomment to override.
# ----------------------------------------------------------------------

# On-chain Config contract. Default is Monad mainnet; change for other chains.
# CONFIG_CONTRACT=0xEeDf3fd85b8C955160CBee10FB45e02add055e39

# Where the bundled IPFS node stores its data on the host. Defaults to
# ./ipfs-data alongside this file. Point at a different disk for
# production deployments — the datastore grows with pinned content.
# IPFS_DATA_PATH=./ipfs-data

# Telegram bot for the domain (optional). Set both TOKEN and NAME to
# enable; leave either blank to disable. TOKEN comes from BotFather,
# NAME is the bot's @-username without the @. The bot ID is auto-
# derived from the token's "<id>:<secret>" prefix.
# TELEGRAM_BOT_TOKEN=123456789:ABCdef-the-rest-of-your-token
# TELEGRAM_BOT_NAME=YourSavvaBot

# Image version to pull (matches a release tag).
# SAVVA_VERSION=latest

# Host port exposed by docker compose. The container always listens
# on 8080 internally; this only changes the port your host binds to.
# PORT=8080

# Verbosity: trace, debug, info, warn, error.
# VERBOSITY=info

# Block to start indexing from on a fresh DB.
# INITIAL_BLOCK=0

# Size limits.
# MAX_FILE_SIZE=50MB
# MAX_POST_SIZE=10MB
# MAX_USER_DISK_SPACE=1GB

# Public website URL for the domain (defaults to https://${DOMAIN}).
# DOMAIN_WEBSITE=https://mysavva.example.com
```

That's the whole install bundle: two files in one directory.

### 2. Fill in `.env`

Откройте `.env` и замените значения-заполнители. Семь полей обязательны:

- `DOMAIN`, `ADMIN_ADDRESS`, `DB_CONNECTION_STRING`, `BLOCKCHAIN_RPC`
- `PIN_SERVICE_URL`, `PIN_SERVICE_API_KEY`, `PIN_SERVICE_GATEWAY` (полученные от вашего pin-сервиса)

`PROCESSOR_KEY` опционален и может быть добавлен позже. `IPFS_URL` по умолчанию указывает на включённый IPFS-сервис. Всё ниже раздела `OPTIONAL` имеет разумные значения по умолчанию и может оставаться закомментированным.

О порте. Контейнер всегда слушает на `8080` внутри — это зашито в образе. Сопоставление в Compose `${PORT:-8080}:8080` публикует его на хосте на порту `8080` по умолчанию, так что `curl http://localhost:8080/info` работает из коробки. Устанавливайте `PORT=` в `.env` только если хотите другой *хостовый* порт (например `PORT=9000`, если 8080 уже занят). Ваш обратный прокси в любом случае общается с контейнером на `8080`.

Если вы не хотите вставлять приватный ключ в файл, смонтируйте его как секрет:

```sh
mkdir -p secrets
echo "0xYourProcessorPrivateKey" > secrets/processor.key
chmod 600 secrets/processor.key
```

…и в `.env`:

```sh
PROCESSOR_KEY=
PROCESSOR_KEY_FILE=/run/secrets/processor.key
```

Папка `secrets/` монтируется в контейнер только для чтения из стандартного `docker-compose.yml`. Контейнер читает ключ с диска при старте; значение никогда не появляется в `docker inspect` или списке процессов.

### 3. Bootstrap the database

Есть два способа заполнить базу данных. **Рекомендуется восстановление из снапшота.**

#### Option A (recommended) — restore from a public snapshot

SAVVA публикует ежедневные PostgreSQL-снапшоты в [savva.app/public_files/](https://savva.app/public_files/), по одному на цепочку, с именами вроде:

```
savva-db-backup-monad-2026-05-03.sql.gz
savva-db-backup-pls-2026-05-03.sql.gz
```

Выберите цепочку, которую вы индексируете (в этом руководстве по умолчанию — `monad`) и самую свежую дату. Дамп — это обычный gz-сжатый SQL — восстановите его с помощью `psql`:

```sh
# Pick the latest snapshot for your chain.
SNAP=https://savva.app/public_files/savva-db-backup-monad-2026-05-03.sql.gz

# Empty target database must already exist and match $DB_CONNECTION_STRING.
curl -L "$SNAP" | gunzip -c | psql "$DB_CONNECTION_STRING"
```

При старте бэкенд продолжит ровно с того места, где был снапшот — обычно отставая от актуальной цепочки на несколько часов — и завершит синхронизацию за минуты вместо часов.

#### Option B — initialize an empty schema and resync from genesis

Полезно, если вы работаете на кастомной цепочке, хотите независимую проверку или просто хотите наблюдать за работой индексера:

```sh
docker compose run --rm savva-backend -initdb
```

Это создаёт все таблицы, необходимые бэкенду, и выставляет версию схемы. Первый `docker compose up -d` после этого начнёт индексировать с настроенного `INITIAL_BLOCK` — готовьтесь к длительной первоначальной синхронизации.

### 4. Start it

```sh
docker compose up -d
```

Контейнер скачивает образ (≈100 MB), читает `.env`, рендерит собственный YAML-конфиг и начинает индексировать блокчейн. Следите за логами:

```sh
docker compose logs -f savva-backend
```

Здоровый старт выглядит примерно так:

```
INF Config: Blockchain RPC configured
INF Config: Processor key configured
INF Connected to DB
INF SAVVA Backend. v:1.0.25
```

…за чем следуют строки о догоняющем слушателе блокчейна. Если вы видите ошибки, см. [Troubleshooting](#troubleshooting).

### 5. Verify

Бэкенд слушает на порту `8080`. С той же машины:

```sh
curl http://localhost:8080/info
```

Вы должны получить JSON-ответ с описанием системы: адреса контрактов, ваш домен, версия, IPFS-шлюзы и т.д. Это означает, что узел SAVVA работает.

## Putting It on the Public Internet

Образ не завершает TLS — это сделано намеренно. Операторы выбирают разные опции (Cloudflare, Caddy, nginx, Traefik, Tailscale Funnel) и бандл не навязывает выбор. Минимум — это то, что:

- слушает на `:443`, завершает TLS и проксирует в контейнер на `:8080`;
- проксирует апгрейд WebSocket для endpoint`а `/ws`;
- маршрутизирует `/api/*` и SEO-URLы (`/robots.txt`, `/sitemap*.xml`) в бэкенд.

Caddy с `reverse_proxy 127.0.0.1:8080` — разумный двухстрочный вариант, если у вас нет предпочтений. Для production-grade конфигурации nginx см. пример в [`_shared/installation/nginx.conf.example`](/dev_docs/_shared/installation/nginx.conf.example) — это тот же конфиг, который используется для любого сайта на платформе SAVVA.

## Setting Your Domain Assets (the UI Bundle)

Сам по себе бэкенд SAVVA не включает UI — он служит API и ожидает, что обратный прокси будет отдавать веб-клиент SolidJS из IPFS-бандла. Когда бэкенд запущен:

1. Соберите (или форкните) проект [savva-ui-solidjs](https://github.com/AlexNa-Holdings/savva-ui-solidjs), закрепите (pin) вывод сборки в IPFS и получите соответствующий CID.
2. От клиента SAVVA, подписанного вашим админским кошельком, вызовите админ-команду `setDomainAssetsCID` с этим CID. Бэкенд скачивает бандл, сохраняет его под `data/domain_assets/` и отдает оттуда.

CID **не** является частью YAML-конфига — он устанавливается во время выполнения и сохраняется в базе данных. Вы можете менять UI без перезапуска бэкенда.

## Updating to a New Version

Релизы публикуются как образы с тегами:

```sh
# Pin a specific version (recommended for production):
echo "SAVVA_VERSION=1.0.26" >> .env
docker compose pull
docker compose up -d

# Or just track latest:
docker compose pull && docker compose up -d
```

Миграции схемы применяются автоматически при старте. Следите за релиз-ноутами для версий, которые меняют схему, на случай, если потребуется ручной шаг.

## Troubleshooting

**`ERROR: required env var X is not set`** — в `.env` отсутствует обязательная переменная. В ошибке указано её имя.

**`dial tcp: connection refused` on the DB** — контейнер не может достучаться до Postgres. Если база на той же хост-машине, что и Docker, используйте `host.docker.internal` (Mac/Windows) или LAN-IP машины, а не `localhost`. `localhost` внутри контейнера означает сам контейнер.

**`http: server gave HTTP response to HTTPS client`** для IPFS-URL — неверная схема: `http://` для HTTPS-эндпойнта или наоборот. Проверьте URL.

**Логи постоянно показывают `RPC error`** — RPC URL неверен, превышены лимиты или идентификатор цепочки не совпадает. Значение `CONFIG_CONTRACT` по умолчанию для Monad; если вы подключаетесь к другой цепочке, установите `CONFIG_CONTRACT` в `.env` на правильный адрес для этой цепочки.

**Контейнер запустился, но долго ничего не происходит** — это нормально, если вы использовали Вариант B на шаге 3 (пустая схема). Бэкенд синхронизирует историю блокчейна, начиная с `INITIAL_BLOCK`, что может занять часы на цепочке с длинной историей. Смотрите `docker compose logs -f`; вы увидите рост номеров блоков. Если ждать не хочется, остановите контейнер, удалите базу и восстановите из публичного снапшота (Вариант A).

Если вы столкнулись с чем-то, что здесь не описано, обратитесь в каналы поддержки SAVVA, приложив вывод `docker compose logs` и обезличенный `.env` (скройте processor key).

## About IPFS Storage

В установке SAVVA работают два уровня закрепления (pinning):

1. **Включённый Kubo-узел** (сервис `ipfs` в Compose) хранит каждый загруженный файл локально. Это быстро, бесплатно и сразу доступно — но это единая точка отказа. Если диск умрёт, локальная копия исчезнет.
2. **Внешний pin-сервис** (настраивается через `PIN_SERVICE_*` в `.env`) также делает копию. Бэкенд просит pin-сервис закрепить каждый новый CID сразу после добавления в локальный узел, поэтому контент вашего сообщества реплицируется надёжно и остаётся доступным через публичный шлюз сервиса даже если ваш узел офлайн.

Комбинация «быстро локально + надёжно внешне» — причина существования обоих уровней. **Не пренебрегайте внешним pin-сервисом**, если только вы не поднимаете временный тестовый узел — потеря pin’а необратима.

Включённое IPFS-хранилище заслуживает такого же обращения, как и любая растущая директория состояния. В отличие от базы Postgres (фиксированная схема, увеличивается только когда вы добавляете домены), **IPFS-datastore растёт пропорционально контенту вашего сообщества.** Бандл поставляется с `process-all-domains: true` в сгенерированном конфиге, поэтому ваш узел индексирует и закрепляет посты **всех доменов в сети**, а не только вашего. Это сделано сознательно — так контент остаётся доступным, даже когда отдельные операторы доменов уходят офлайн — но это также означает, что рост datastore отслеживает всю платформу, а не только ваше сообщество. Планируйте это как любую другую нагрузку на хранилище для pin'ов:

- **Поместите datastore на диск, который вы готовы расширять.** `IPFS_DATA_PATH=` в `.env` контролирует путь на хосте. По умолчанию `./ipfs-data` рядом с файлом Compose; для продакшена указывайте выделённый диск или том (`/mnt/data1/ipfs`, присоединённый EBS и т.п.).
- **Мониторьте использование диска.** Оповещений о заполнении диска нет. Следите за `du -sh ipfs-data/` (или по указанному пути) и настройте общие алерты по использованию диска.
- **Делайте бэкапы как любой другой директории состояния.** Остановка сервиса `ipfs` и rsync папки данных — самый простой путь.
- **Откройте порт 4001 (TCP и UDP).** Это порт IPFS swarm. Если он закрыт брандмауэром, контент по‑прежнему будет закрепляться локально, но не будет реплицироваться в сеть IPFS. Большинство облачных провайдеров требуют явно открыть этот порт в security group / VPC firewall.
- **Kubo по умолчанию не имеет лимита MaxStorage.** Если нужен жёсткий потолок с автоматическим GC, отредактируйте `ipfs-data/config` после первого старта и установите `Datastore.StorageMax` в значение вроде `"100GB"`.

Если вы уже эксплуатируете IPFS-узел и хотите использовать его, установите `IPFS_URL=` в `.env` и удалите блок `ipfs:` из `docker-compose.yml`. Бэкенду это безразлично.

## What's Intentionally Not in the Image

Образ запускает только бэкенд. Стек Compose добавляет сервис IPFS, но **PostgreSQL**, **TLS** и **веб-клиент** остаются вашей ответственностью:

- **PostgreSQL** — у операторов разные предпочтения по бэкапам, репликам и варианту управляемого против самостоятелно-хостимого решения. Включение базы в бандл усложнило бы эти варианты.
- **TLS** — выбор обратного прокси за вами.
- **Веб-клиент** — распределён через IPFS и закрепляется админом, а не встраивается в образ бэкенда.

В будущем может быть опубликована установка «всё в одном», которая включит Postgres, Caddy и UI как отдельный Compose-файл для случайного/хоббийного использования. Текущий бандл рассчитан на людей, которые собираются держать сервис в рабочем состоянии.