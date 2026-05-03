# Встановлення Docker-нода

Ця сторінка описує рекомендований спосіб запуску бекенд-нода SAVVA: публічний Docker-образ із єдиним стеком Compose. Якщо у вас встановлено Docker (24+) і плагін Compose, робочий нод збирається приблизно за годину налаштування — вам не потрібен доступ до вихідників або середовище Go.

## Чому Docker

SAVVA — це мультидоменна платформа. Той самий протокол і та сама реєстрація контенту в ланцюжку можуть обслуговуватись з будь-якої кількості незалежних доменів, кожен з власним брендом, спільнотою та політикою модерації. Будь-хто може підняти домен.

Поки не вийшов Docker-образ, це на практиці вимагало збирати бекенд із вихідників і писати довгий YAML-конфіг з нуля. Docker-бандл замінює це одним образом, одним файлом `.env` і одним `docker compose up -d`. Протокол завжди був безпристрасним (permissionless); образ робить реалізацію відповідною.

## Що вам знадобиться

П’ять речей, жодна з яких не є специфічною для SAVVA:

1. **Сервер під Linux або Mac** з Docker (24+) і плагіном Compose. Достатньо невеликого VPS. Вам знадобиться дисковий простір для вбудованого сховища IPFS — див. [Про збереження в IPFS](#about-ipfs-storage).
2. **PostgreSQL база даних** (версія 14 або новіша), до якої бекенд зможе дістатися. Вона може працювати на тій же машині, на керованому сервісі (DigitalOcean, RDS, Supabase, Neon тощо) або будь-де іншому.
3. **RPC URL блокчейну.** SAVVA працює на Monad. Публічний mainnet RPC `https://rpc.monad.xyz` працює одразу без реєстрації. Публічні RPC обмежені за швидкістю та спільні, тому для нода, який ви збираєтесь підтримувати під реальним трафіком, плануйте або запустити власний вузол Monad, або орендувати приватну точку доступу (QuickNode, Alchemy, Ankr тощо). Ви можете почати з публічного RPC і переключитися пізніше, відредагувавши один рядок в `.env`.
4. **Адмін-адреса гаманця.** Ідентичність гаманця, якій дозволено адмініструвати домен. Окремий **процесорний** гаманець (використовується бекендом для підпису транзакцій за платний/зашифрований контент) — опційний: можна запустити нод без нього і додати потім.
5. **Одна — бажано дві — послуги пінування IPFS.** Вбудований IPFS вузол зберігає контент локально, але один вузол — це єдина точка відмови. Послуга пінування реплікує закріплений контент на надійне зовнішнє сховище і надає публічний шлюз, щоб будь-хто міг отримати ваш контент навіть коли ваш власний вузол офлайн.

   Ми рекомендуємо **[Pinata](https://www.pinata.cloud/)** як основну послугу. Більшість сервісів пінування лише отримують CID із публічної мережі IPFS *після* його публікації, що може означати хвилини недоступності для щойно опублікованого файлу. API Pinata надає прямий endpoint для завантаження, тож бекенд передає файл прямо в Pinata одночасно з тим, як додає його локально — контент стає надійно закріпленим і доступним через шлюз негайно.

   Безкоштовний план Pinata використовує спільний `gateway.pinata.cloud` (обмежений за швидкістю, підходить для вузлів із невеликим трафіком, але ризикований для загальнодоступних сайтів). **Виділений шлюз** на піддомені, яким ви володієте (`yourname.mypinata.cloud`) вимагає платного плану. Інші сервіси — [web3.storage](https://web3.storage/), [Filebase](https://filebase.com/), [4everland](https://www.4everland.org/) — мають аналогічні розділення на спільні/виділені рівні.

   Додайте другу послугу поряд з Pinata. Два незалежні провайдери ефективно усувають ризик того, що відмова, платіжна суперечка або зміна політики однієї компанії зробить ваш контент недоступним. Бандл підтримує до десяти сервісів пінування (`PIN_SERVICE_2_*`, `PIN_SERVICE_3_*`, ...). Звичне поєднання — Pinata як швидкий/надійний первинний та `web3.storage` або `Filebase` як дешевша підстраховка.

   Від кожної служби вам знадобляться три рядки: **URL API endpoint**, **API-ключ** (зазвичай JWT) і **публічний шлюз** служби.

Бандл постачає власний IPFS вузол — вам не потрібно надавати його окремо. Якщо ви вже запускаєте IPFS вузол і хочете вказати на нього, див. примітку про переоприділення в кінці розділу [Про збереження в IPFS](#about-ipfs-storage).

Немає реєстрації на боці SAVVA і немає API-ключів, крім сервісів пінування.

## Установка за п’ять хвилин

### 1. Створіть директорію для розгортання і два файли

```sh
mkdir savva && cd savva
```

Створіть **`docker-compose.yml`**:

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

Створіть **`.env`** (ви заповните значення на кроці 2):

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

Це весь інсталяційний бандл: два файли в одній директорії.

### 2. Заповніть `.env`

Відкрийте `.env` і замініть значення-заповнювачі. Сім полів є обов’язковими:

- `DOMAIN`, `ADMIN_ADDRESS`, `DB_CONNECTION_STRING`, `BLOCKCHAIN_RPC`
- `PIN_SERVICE_URL`, `PIN_SERVICE_API_KEY`, `PIN_SERVICE_GATEWAY` (з вашого облікового запису послуги пінування)

`PROCESSOR_KEY` опційний і може бути доданий пізніше. `IPFS_URL` за замовчуванням вказує на вбудований IPFS-сервіс. Все нижче роздільника `OPTIONAL` має розумні значення за замовчуванням і може залишатися закоментованим.

Про порт. Контейнер завжди слухає `8080` всередині — це закладено в образі. Відображення Compose `${PORT:-8080}:8080` публікує його на хості на порті `8080` за замовчуванням, тому `curl http://localhost:8080/info` працює одразу. Встановлюйте `PORT=` в `.env` тільки якщо хочете інший порт на *хості* (наприклад `PORT=9000`, коли 8080 вже зайнятий). Ваш зворотний проксі в будь-якому випадку говорить з контейнером на внутрішньому `8080`.

Якщо ви не хочете вставляти приватний ключ у файл, змонтуйте його як секрет:

```sh
mkdir -p secrets
echo "0xYourProcessorPrivateKey" > secrets/processor.key
chmod 600 secrets/processor.key
```

…і в `.env`:

```sh
PROCESSOR_KEY=
PROCESSOR_KEY_FILE=/run/secrets/processor.key
```

Папка `secrets/` монтується лише для читання в контейнер за замовчуванням у `docker-compose.yml`. Контейнер читає ключ із диска при старті; значення ніколи не з’являється в `docker inspect` або в списку процесів.

### 3. Ініціалізація бази даних

Є два способи заповнити базу даних. **Рекомендується відновлення з снапшота.**

#### Варіант A (рекомендовано) — відновлення з публічного снапшота

SAVVA публікує щоденні знімки PostgreSQL на [savva.app/public_files/](https://savva.app/public_files/), по одному для кожного ланцюжка, з іменами на кшталт:

```
savva-db-backup-monad-2026-05-03.sql.gz
savva-db-backup-pls-2026-05-03.sql.gz
```

Виберіть ланцюжок, який ви індексуєте (`monad` — за замовчуванням у цьому посібнику) і останню дату. Дамп — це звичайний gzipped SQL — відновіть його за допомогою `psql`:

```sh
# Pick the latest snapshot for your chain.
SNAP=https://savva.app/public_files/savva-db-backup-monad-2026-05-03.sql.gz

# Empty target database must already exist and match $DB_CONNECTION_STRING.
curl -L "$SNAP" | gunzip -c | psql "$DB_CONNECTION_STRING"
```

Коли бекенд запуститься, він продовжить саме звідти, де закінчив снапшот — зазвичай на кілька годин позаду поточної вершини — і догонить за хвилини замість годин.

#### Варіант B — ініціалізувати порожню схему і переіндексувати з генезису

Корисно, якщо ви працюєте на кастомному ланцюжку, хочете незалежну верифікацію або просто хочете спостерігати за роботою індексера:

```sh
docker compose run --rm savva-backend -initdb
```

Це створює всі таблиці, які потрібні бекенду, і встановлює версію схеми. Перший `docker compose up -d` після цього починає індексацію з налаштованого `INITIAL_BLOCK` далі — очікуйте тривалого початкового синхрону.

### 4. Запустіть

```sh
docker compose up -d
```

Контейнер завантажує образ (≈100 MB), читає `.env`, рендерить власний YAML-конфіг і починає індексувати блокчейн. Слідкуйте за логами:

```sh
docker compose logs -f savva-backend
```

Здоровий старт виглядає приблизно так:

```
INF Config: Blockchain RPC configured
INF Config: Processor key configured
INF Connected to DB
INF SAVVA Backend. v:1.0.25
```

…після чого йдуть рядки про те, що слухач блокчейну наздоганяє. Якщо бачите помилки, див. [Виправлення неполадок](#troubleshooting).

### 5. Перевірте

Бекенд слухає порт `8080`. З тієї ж машини:

```sh
curl http://localhost:8080/info
```

Ви повинні отримати JSON-відповідь, що описує систему: адреси контрактів, ваш домен, версію, IPFS шлюзи тощо. Це означає, що SAVVA нод працює.

## Розміщення в публічному інтернеті

Образ не завершує TLS — це зроблено навмисно. Різні оператори обирають різні рішення (Cloudflare, Caddy, nginx, Traefik, Tailscale Funnel) і бандл не обирає за вас. Мінімум — це щось, що:

- Слухає на `:443`, завершує TLS, і проксує до контейнера на `:8080`.
- Пересилає WebSocket-upgrade для endpoint `/ws`.
- Маршрутизує `/api/*` і SEO discovery URL-и (`/robots.txt`, `/sitemap*.xml`) у бекенд.

Caddy з директивою `reverse_proxy 127.0.0.1:8080` — розумний дворядковий вибір, якщо у вас немає переваги. Для повноцінного production-конфігу nginx див. приклад у [`_shared/installation/nginx.conf.example`](/dev_docs/_shared/installation/nginx.conf.example) — це той самий конфіг, що використовується для будь-якого сайту платформи SAVVA.

## Налаштування ресурсів вашого домену (UI-бандл)

Сам по собі бекенд SAVVA не постачає UI — він подає API і очікує, що зворотний проксі віддаватиме SolidJS веб-клієнт із IPFS-хостингового бандла. Коли бекенд працює:

1. Зберіть (або форкніть) проект [savva-ui-solidjs](https://github.com/AlexNa-Holdings/savva-ui-solidjs), закріпіть (pin) результат збірки в IPFS і заберіть отриманий CID.
2. З клієнта SAVVA, підписаного вашим адмін-ганцем, викличте адмін-команду `setDomainAssetsCID` із CID. Бекенд завантажить бандл, збереже його під `data/domain_assets/` і роздаватиме звідти.

CID **не** частина YAML-конфігу — він задається під час роботи і зберігається в базі даних. Ви можете змінювати UI без перезапуску бекенду.

## Оновлення до нової версії

Релізи публікуються як теговані Docker-образи:

```sh
# Pin a specific version (recommended for production):
echo "SAVVA_VERSION=1.0.26" >> .env
docker compose pull
docker compose up -d

# Or just track latest:
docker compose pull && docker compose up -d
```

Міграції схеми застосовуються автоматично при старті. Слідкуйте за нотатками релізу для будь-якої версії, яка підвищує схему, на випадок ручного кроку.

## Виправлення неполадок

**`ERROR: required env var X is not set`** — у `.env` відсутнє обов’язкове поле. В помилці вказано ім’я змінної.

**`dial tcp: connection refused` on the DB** — контейнер не може дістатися Postgres. Якщо БД працює на тому самому хості, що і Docker, використовуйте `host.docker.internal` (Mac/Windows) або LAN IP машини, а не `localhost`. `localhost` всередині контейнера означає сам контейнер.

**`http: server gave HTTP response to HTTPS client`** для IPFS URL — неправильна схема: `http://` для HTTPS-ендпоінта або навпаки. Перевірте URL.

**Логи повторювано показують `RPC error`** — RPC URL неправильний, обмежений за швидкістю або ID ланцюжка не співпадає. За замовчуванням `CONFIG_CONTRACT` для Monad; якщо підключаєтесь до іншого ланцюжка, встановіть `CONFIG_CONTRACT` в `.env` на правильну адресу для того ланцюжка.

**Контейнер стартує, але довго нічого не відбувається** — це нормально, якщо ви використали Варіант B на кроці 3 (порожня схема). Бекенд синхронізує історію блокчейну з `INITIAL_BLOCK` далі, що може зайняти години для ланцюжка з довгою історією. Слідкуйте за `docker compose logs -f`; ви побачите зростання номерів блоків. Якщо не хочете чекати, зупиніть контейнер, видаліть базу даних і відновіть зі публічного снапшота (Варіант A).

Якщо ви зіткнулися з чимось, що тут не описано, зверніться в канали підтримки SAVVA з виводом `docker compose logs` і вашою санітизованою `.env` (затемніть processor key).

## Про збереження в IPFS

У встановленні SAVVA працюють два рівні пінування:

1. **Вбудований Kubo-вузол** (сервіс `ipfs:` у Compose) тримає кожен завантажений файл локально. Це швидко, безкоштовно і миттєво доступно — але це єдина точка відмови. Якщо той диск відмовить, локальна копія зникне.
2. **Зовнішня послуга пінування** (налаштовується через `PIN_SERVICE_*` у `.env`) також робить копію. Бекенд просить послугу пінування закріпити кожен новий CID одразу після його додавання до локального вузла, тож контент вашої спільноти надійно реплікований і залишається доступним через публічний шлюз сервісу навіть коли ваш вузол офлайн.

Комбінація «швидко локально + надійно зовнішньо» — причина існування обох шарів. **Не пропускайте зовнішню послугу пінування**, якщо ви не розгортаєте тимчасовий тестовий нод — втрата пінів незворотна.

Вбудований datstore IPFS заслуговує на те саме ставлення, що й інша директорія стану, яка росте. На відміну від PostgreSQL (фіксована схема, яка зростає лише при додаванні доменів), **IPFS datastore зростає пропорційно контенту вашої спільноти.** Бандл постачається з `process-all-domains: true` у згенерованому конфігу, тому ваш нод індексує і пінує пости з **усіх доменів в мережі**, а не лише вашого. Це зроблено навмисно — це зберігає контент доступним навіть коли окремі оператори доменів офлайн — але це також означає, що зростання datastore відслідковує всю платформу, а не лише вашу спільноту. Плануйте його як будь-яке інше навантаження на збереження:

- **Розмістіть datastore на диску, який ви готові збільшувати.** `IPFS_DATA_PATH=` в `.env` контролює шлях на хості. За замовчуванням це `./ipfs-data` поруч із файлом Compose; для продакшн-розгортань вкажіть окремий диск або том (`/mnt/data1/ipfs`, прикріплений EBS тощо).
- **Моніторьте використання диску.** Немає автоматичного сигналу, якщо диск заповнений. Слідкуйте за `du -sh ipfs-data/` (або шляхом, куди ви вказали) і налаштуйте загальний алерт по диску.
- **Резервне копіювання як будь-якої іншої директорії стану.** Зупинка сервісу `ipfs` і rsync каталогу даних — найпростіший шлях.
- **Відкрийте порт 4001 (TCP і UDP).** Це порт swarm IPFS. Якщо він заблокований у фаєрволі, контент усе ще пінується локально, але не реплікується у широку мережу IPFS. Більшість хмарних провайдерів вимагають явного відкриття цього порту у security group / VPC firewall.
- **Kubo за замовчуванням не має обмеження MaxStorage.** Якщо вам потрібна жорстка межа з автоматичним GC, відредагуйте `ipfs-data/config` після першого запуску і встановіть `Datastore.StorageMax` на розмір, наприклад `"100GB"`.

Якщо ви вже експлуатуєте IPFS вузол і бажаєте його використовувати, встановіть `IPFS_URL=` в `.env`, щоб вказати на нього, і видаліть блок сервісу `ipfs:` з `docker-compose.yml`. Бекенд не прив’язаний до конкретного вузла.

## Що навмисно не включено в образ

Образ запускає лише бекенд. Стек Compose додає сервіс IPFS, але **PostgreSQL**, **TLS** і **веб-клієнт** лишаються вашою відповідальністю:

- **PostgreSQL** — оператори мають сильні вподобання щодо бекапів, реплік і керованого vs самостійного хостингу. Інклудити його у бандл ускладнило б ці питання.
- **TLS** — вибір зворотного проксі за вами.
- **Веб-клієнт** — розповсюджується через IPFS і пінується адміністратором, не вбудований у бекенд-образ.

Можливо пізніше буде випущено окремий Compose-файл «все в одному», який також включатиме Postgres, Caddy і UI для випадкового/хобі-користувача. Поточний бандл орієнтований на людей, які мають намір підтримувати розгортання в робочому стані.