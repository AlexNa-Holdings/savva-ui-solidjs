# Instalacija Docker čvora

Ova stranica opisuje preporučeni način za pokretanje SAVVA backend čvora: javni Docker image sa jednim Compose stack-om. Ako imate Docker (24+) i instaliran Compose plugin, radni čvor se podesi za otprilike sat vremena — ne treba vam pristup izvornom kodu ili Go toolchain.

## Zašto Docker

SAVVA je platforma sa više domena. Isti protokol i isti on-chain registar sadržaja mogu da se služe sa bilo kog broja nezavisnih domena, od kojih svaki ima svoj brend, zajednicu i politiku moderacije. Bilo ko može da podigne domen.

Dok nije objavljen Docker image, to je u praksi zahtevalo da se backend izgradi iz izvora i da se napiše dugačak YAML konfiguracioni fajl ispočetka. Docker paket to zamenjuje jednim image-om, jednim `.env` fajlom i jednim `docker compose up -d`. Protokol je oduvek bio bez dozvola; image čini implementaciju odgovarajućom.

## Šta će vam trebati

Pet stvari, nijedna nije specifična za SAVVA:

1. **Linux server ili Mac** sa Docker-om (24+) i Compose pluginom. Dovoljan je i mali VPS. Trebaće vam prostor na disku za ugrađeni IPFS datastore — vidi [About IPFS Storage](#about-ipfs-storage).
2. **PostgreSQL baza podataka** (14 ili novija) kojoj backend može da pristupi. Može da radi na istoj mašini, na managed servisu (DigitalOcean, RDS, Supabase, Neon itd.) ili bilo gde drugde.
3. **Blockchain RPC URL.** SAVVA radi na Monad-u. Javnog mainnet RPC `https://rpc.monad.xyz` radi odmah bez prijave. Javne RPC tačke imaju ograničenja i dele se među korisnicima, pa ako nameravate da čvor održavate pod stvarnim opterećenjem, planirajte da ili pokrenete sopstveni Monad čvor ili iznajmite privatnu endpoint uslugu (QuickNode, Alchemy, Ankr itd.). Možete početi sa javnim RPC-om i kasnije promeniti jednu liniju u `.env`.
4. **Adresa administratorskog novčanika.** Identitet novčanika koji ima pravo administracije domenom. Poseban **processor** novčanik (koji backend koristi za potpisivanje plaćenih / enkriptovanih transakcija) je opcion — možete podići čvor bez njega i dodati kasnije.
5. **Jedan — idealno dva — naloga za IPFS pinning servis.** Ugrađeni IPFS čvor drži sadržaj lokalno, ali jedan čvor je jedinstvena tačka otkaza. Pin servis replicira pinovane sadržaje na trajno eksterno skladište i izlaže javni gateway tako da svako može da preuzme vaš sadržaj čak i kada vaš čvor nije dostupan.

   Preporučujemo **[Pinata](https://www.pinata.cloud/)** kao primarnu uslugu. Većina pinning servisa preuzme CID sa javne IPFS mreže *nakon* što je objavljen, što može značiti nekoliko minuta nedostupnosti za sveže postavljenu datoteku. Pinata-ino API izlaže direktan upload endpoint, pa backend predaje fajl direktno Pinati istovremeno kad ga doda lokalno — sadržaj postaje trajno pinovan i odmah dostupan preko gateway-a.

   Pinata-ov besplatan plan koristi deljeni `gateway.pinata.cloud` (sa ograničenjem, dovoljno za nisko-opterećene lične čvorove, rizično za javno izložene servise). **Posvećeni gateway** na poddomeni koju kontrolišete (`yourname.mypinata.cloud`) zahteva plaćeni plan. Druge usluge — [web3.storage](https://web3.storage/), [Filebase](https://filebase.com/), [4everland](https://www.4everland.org/) — imaju slične podele na deljene / posvećene nivoe.

   Dodajte drugu uslugu pored Pinate. Dva nezavisna provajdera praktično eliminišu rizik da ispadanje, problem sa naplatom ili promena politike jedne kompanije učini vaš sadržaj nedostupnim. Paket podržava do deset pin servisa (`PIN_SERVICE_2_*`, `PIN_SERVICE_3_*`, ...). Uobičajena kombinacija je Pinata kao brz/durabilan primarni i `web3.storage` ili `Filebase` kao jeftinija rezerva.

   Od svake usluge biće vam potrebna tri stringa: **API endpoint URL**, **API ključ** (obično JWT) i javni **gateway URL** servisa.

Bundl dolazi sa sopstvenim IPFS čvorom — ne morate ga zasebno obezbediti. Ako već pokrećete IPFS čvor i želite da ga koristite, pogledajte napomenu o overridu na kraju [About IPFS Storage](#about-ipfs-storage).

Ne postoji SAVVA registracija na strani servisa i nema API ključeva osim onih od pin servisa.

## Instalacija za pet minuta

### 1. Napravite direktorijum za deploy i dve datoteke

```sh
mkdir savva && cd savva
```

Kreirajte **`docker-compose.yml`**:

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

Kreirajte **`.env`** (vrednosti ćete uneti u koraku 2):

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

To je ceo instalacioni paket: dve datoteke u jednom direktorijumu.

### 2. Popunite `.env`

Otvorite `.env` i zamenite placeholder vrednosti. Sedam polja je obavezno:

- `DOMAIN`, `ADMIN_ADDRESS`, `DB_CONNECTION_STRING`, `BLOCKCHAIN_RPC`
- `PIN_SERVICE_URL`, `PIN_SERVICE_API_KEY`, `PIN_SERVICE_GATEWAY` (dobijate iz naloga pin servisa)

`PROCESSOR_KEY` je opcion i može se dodati kasnije. `IPFS_URL` po defaultu pokazuje na ugrađeni IPFS servis. Sve ispod odeljka `OPTIONAL` ima razumna podrazumevana podešavanja i može ostati zakomentarisano.

O portu. Kontejner uvek sluša na `8080` interno — to je hardkodovano u image-u. Compose mapiranje `${PORT:-8080}:8080` objavljuje ga na hostu na portu `8080` po defaultu, pa `curl http://localhost:8080/info` radi odmah. Postavite `PORT=` u `.env` samo ako želite drugi host port (na primer `PORT=9000` kada je 8080 već zauzet). Vaš reverse proxy uvek razgovara sa kontejnerom na internom `8080`.

Ako ne želite da nalepite privatni ključ u fajl, montirajte ga kao secret umesto toga:

```sh
mkdir -p secrets
echo "0xYourProcessorPrivateKey" > secrets/processor.key
chmod 600 secrets/processor.key
```

…i u `.env`:

```sh
PROCESSOR_KEY=
PROCESSOR_KEY_FILE=/run/secrets/processor.key
```

`secrets/` folder se montira kao read-only u kontejner prema podrazumevanom `docker-compose.yml`. Kontejner čita ključ sa diska pri pokretanju; vrednost se nikada ne pojavljuje u `docker inspect` ili listama procesa.

### 3. Pokretanje baze podataka

Postoje dva načina da popunite bazu podataka. **Obnova iz snimka (snapshot) je snažno preporučena.**

#### Opcija A (preporučeno) — obnova iz javnog snimka

SAVVA objavljuje dnevne PostgreSQL snimke na [savva.app/public_files/](https://savva.app/public_files/), po jedan za svaku mrežu, imenovane kao:

```
savva-db-backup-monad-2026-05-03.sql.gz
savva-db-backup-pls-2026-05-03.sql.gz
```

Izaberite mrežu koju indeksirate (`monad` je podrazumevana u ovom vodiču) i najnoviji datum. Dump je običan gzip-ovan SQL — obnovite ga sa `psql`:

```sh
# Pick the latest snapshot for your chain.
SNAP=https://savva.app/public_files/savva-db-backup-monad-2026-05-03.sql.gz

# Empty target database must already exist and match $DB_CONNECTION_STRING.
curl -L "$SNAP" | gunzip -c | psql "$DB_CONNECTION_STRING"
```

Kada backend startuje, nastaviće tačno tamo gde je snimak stao — obično par sati iza najnovijeg bloka — i završiti sinhronizaciju za minute umesto sati.

#### Opcija B — inicijalizujte prazan šemu i resinkronizujte od genesis-a

Koristan ako pokrećete na prilagođenoj mreži, želite nezavisnu verifikaciju ili samo želite da gledate kako indeksator radi:

```sh
docker compose run --rm savva-backend -initdb
```

Ovo kreira sve tabele koje su potrebne backend-u i postavlja verziju šeme. Prvi `docker compose up -d` posle toga počinje indeksiranje od konfigurisane vrednosti `INITIAL_BLOCK` nadalje — očekujte dugu početnu sinhronizaciju.

### 4. Pokrenite

```sh
docker compose up -d
```

Kontejner povlači image (≈100 MB), čita `.env`, renderuje sopstveni YAML config i počinje da indeksira blockchain. Pratite logove:

```sh
docker compose logs -f savva-backend
```

Zdrav početak izgleda otprilike ovako:

```
INF Config: Blockchain RPC configured
INF Config: Processor key configured
INF Connected to DB
INF SAVVA Backend. v:1.0.25
```

…i potom linije o tome kako listener za blockchain sustiže istoriju. Ako vidite greške umesto toga, pogledajte [Otklanjanje problema](#troubleshooting).

### 5. Proverite

Backend sluša na portu `8080`. Sa iste mašine:

```sh
curl http://localhost:8080/info
```

Treba da dobijete JSON odgovor koji opisuje sistem: adrese ugovora, vaš domen, verziju, IPFS gateway-e i slično. To znači da je SAVVA čvor u funkciji.

## Postavljanje na javni internet

Image ne obavlja TLS terminaciju — to je namerno. Različiti operateri žele različite stvari (Cloudflare, Caddy, nginx, Traefik, Tailscale Funnel) i paket ne odlučuje umesto vas. Minimum je nešto što:

- Sluša na `:443`, vrši TLS terminaciju i prosleđuje zahteve kontejneru na `:8080`.
- Prosleđuje WebSocket upgrade za `/ws` endpoint.
- Rutira `/api/*` i SEO otkrivne URL-ove (`/robots.txt`, `/sitemap*.xml`) ka backend-u.

Caddy sa `reverse_proxy 127.0.0.1:8080` je razumna dvo-linijska opcija ako nemate već preferencu. Za produkcijski nginx konfiguraciju, pogledajte primer u [`_shared/installation/nginx.conf.example`](/dev_docs/_shared/installation/nginx.conf.example) — to je ista konfiguracija koja se koristi za bilo koji SAVVA-platform sajt.

## Podesite resurse vašeg domena (UI paket)

SAVVA backend sam po sebi ne sadrži UI — on služi API i očekuje da reverse proxy posluži SolidJS web klijent iz IPFS-ovanog bundle-a. Kada backend radi:

1. Izgradite (ili fork-ujte) [savva-ui-solidjs](https://github.com/AlexNa-Holdings/savva-ui-solidjs) projekat, pinujte izlaz iz build-a na IPFS i preuzmite dobijeni CID.
2. Iz SAVVA klijenta koji je potpisan administratorskim novčanikom pozovite admin komandu `setDomainAssetsCID` sa CID-om. Backend preuzima bundle, skladišti ga u `data/domain_assets/` i služi ga odatle.

CID **nije** deo YAML konfiguracije — postavlja se u runtime-u i upisuje u bazu. Možete menjati UI bez restartovanja backend-a.

## Ažuriranje na novu verziju

Releasi se objavljuju kao tagged Docker image-i:

```sh
# Pin a specific version (recommended for production):
echo "SAVVA_VERSION=1.0.26" >> .env
docker compose pull
docker compose up -d

# Or just track latest:
docker compose pull && docker compose up -d
```

Migracije šeme se primenjuju automatski pri pokretanju. Pratite beleške izdanja za svaku verziju koja podiže šemu u slučaju da postoji manuelni korak.

## Otklanjanje problema

**`ERROR: required env var X is not set`** — obavezno polje nedostaje u `.env`. Greška navodi promenljivu.

**`dial tcp: connection refused` on the DB** — kontejner ne može da pristupi Postgres-u. Ako vaša baza radi na istom hostu kao Docker, koristite `host.docker.internal` (Mac/Windows) ili LAN IP vaše mašine, ne `localhost`. `localhost` unutar kontejnera znači sam kontejner.

**`http: server gave HTTP response to HTTPS client`** za IPFS URL — šema je pogrešna: `http://` za HTTPS endpoint ili obrnuto. Proverite URL.

**Logs say `RPC error` repeatedly** — RPC URL je pogrešan, ima rate-limit ili ID chain-a se ne poklapa. Podrazumevani `CONFIG_CONTRACT` je za Monad; ako se povezujete na drugu mrežu, podesite `CONFIG_CONTRACT` u `.env` na pravu adresu za tu mrežu.

**Kontejner startuje ali se dugo ništa ne dešava** — to je normalno ako ste koristili Opciju B u koraku 3 (prazna šema). Backend sinhronizuje blockchain istoriju od `INITIAL_BLOCK`, što može trajati satima na mreži sa dugom istorijom. Pratite `docker compose logs -f`; videćete kako brojevi blokova rastu. Ako ne želite da čekate, zaustavite kontejner, obrišite bazu i obnovite iz javnog snimka (Opcija A).

Ako naletite na nešto što ovde nije obuhvaćeno, obratite se SAVVA support kanalima uz `docker compose logs` izlaz i vašu sanitizovanu `.env` (redaktujte processor key).

## O IPFS skladištu

U SAVVA instalaciji rade dve vrste pinovanja:

1. **Ugrađeni Kubo čvor** (servis `ipfs:` u Compose-u) drži svaki uploadovani fajl lokalno. Brz je, besplatan i odmah dostupan — ali predstavlja jedinstvenu tačku otkaza. Ako taj disk otkaže, lokalna kopija nestaje.
2. **Eksterni pin servis** (konfigurisano preko `PIN_SERVICE_*` u `.env`) takođe pravi kopiju. Backend traži od pin servisa da pinuje svaki novi CID odmah nakon što ga doda lokalnom čvoru, tako da sadržaj vaše zajednice bude trajno replikovan i dostupan preko javnog gateway-a servisa čak i kada vaš čvor nije online.

Kombinacija "brzo lokalno + trajno eksterno" objašnjava zašto postoje obe komponente. **Ne preskačite eksterni pin servis** osim ako podižete testni čvor za bacanje — gubitak pin-a je nepovratan.

Ugrađeni IPFS datastore zaslužuje isto rukovanje kao i svaki drugi rastući state direktorijum. Za razliku od Postgres baze (fiksna šema koja raste samo kada dodajete domene), **IPFS datastore raste proporcionalno sadržaju vaše zajednice.** Paket isporučuje `process-all-domains: true` u renderovanoj konfiguraciji, tako da vaš čvor indeksira i pin-uje postove sa **svih domena na mreži**, ne samo vašeg. To je namerno — održava sadržaj dostupnim čak i kada pojedinačni operatori domena odu offline — ali takođe znači da rast datastore-a prati celu platformu, ne samo vašu zajednicu. Planirajte u skladu sa tim kao za bilo koji drugi workload za pin-storage:

- **Stavite datastore na disk koji ste spremni da proširite.** `IPFS_DATA_PATH=` u `.env` kontroliše host putanju. Default je `./ipfs-data` pored Compose fajla; za produkciju usmerite ga na odvojeni disk ili volume (`/mnt/data1/ipfs`, prikačeni EBS volume itd.).
- **Nadzorite korišćenje diska.** Ne postoji alarm koji zvoni kad disk popuni. Pratite `du -sh ipfs-data/` (ili gde god ste ga usmerili) i podesite generičan alarm za zauzeće diska.
- **Pravite bekap kao za svaki drugi direktorijum stanja.** Zaustavljanje `ipfs` servisa i rsync podataka je najjednostavniji put.
- **Otvorite port 4001 (TCP i UDP).** To je IPFS swarm port. Ako je zatvoren u firewall-u, sadržaj se i dalje pinuje lokalno ali se ne replicira na širu IPFS mrežu. Većina cloud provajdera zahteva eksplicitno otvaranje u security grupi / VPC firewall-u.
- **Kubo po defaultu nema ograničenje MaxStorage.** Ako želite tvrdi limit sa automatskim GC-om, izmenite `ipfs-data/config` nakon prvog starta i podesite `Datastore.StorageMax` na veličinu kao `"100GB"`.

Ako već upravljate IPFS čvorom i radije biste koristili njega, podesite `IPFS_URL=` u `.env` da pokazuje na njega i uklonite `ipfs:` blok iz `docker-compose.yml`. Backend ne pravi razliku.

## Šta je namerno izostavljeno iz image-a

Image pokreće samo backend. Compose stack dodaje IPFS servis, ali **PostgreSQL**, **TLS** i **web klijent** ostaju na vašoj strani odgovornosti:

- **PostgreSQL** — operatori imaju jake stavove o backup-ima, replikama i managed vs self-hosted rešenjima. Ubacivanje jedne u paket bi sve to otežalo.
- **TLS** — izbor reverse proxy-ja je vaš.
- **Web klijent** — distribuira se preko IPFS-a i pin-uje ga administrator, nije uključen u backend image.

Jedna "sve u jednom" instalacija koja bi uključivala i Postgres, Caddy i UI može biti objavljena kasnije kao poseban Compose fajl za ležernu / hobističku upotrebu. Trenutni paket cilja ljude koji žele da pokrenu nešto što nameravaju da održavaju.