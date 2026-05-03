# Docker Node Installation

This page describes the recommended way to run a SAVVA backend node: a public Docker image with a single Compose stack. If you have Docker (24+) and the Compose plugin installed, a working node is roughly an hour of setup — you do not need source access or a Go toolchain.

## Why Docker

SAVVA is a multi-domain platform. The same protocol and the same on-chain content registry can be served from any number of independent domains, each with its own brand, community, and moderation policy. Anyone can stand up a domain.

Until the Docker image was released, doing so in practice required building the backend from source and writing a long YAML config from scratch. The Docker bundle replaces that with one image, one `.env` file, and a single `docker compose up -d`. The protocol was always permissionless; the image makes the implementation match.

## What You'll Need

Five things, none of them SAVVA-specific:

1. **A Linux server or Mac** with Docker (24+) and the Compose plugin. A small VPS is enough. You will need disk space for the bundled IPFS datastore — see [About IPFS Storage](#about-ipfs-storage).
2. **A PostgreSQL database** (14 or later) the backend can reach. It can run on the same machine, on a managed service (DigitalOcean, RDS, Supabase, Neon, etc.), or anywhere else.
3. **A blockchain RPC URL.** SAVVA runs on Monad. The public mainnet RPC `https://rpc.monad.xyz` works out of the box with no signup. Public RPCs are rate-limited and shared, so for a node you intend to keep up under real traffic plan to either run your own Monad node or rent a private endpoint (QuickNode, Alchemy, Ankr, etc.). You can start with the public RPC and switch later by editing one line in `.env`.
4. **An admin wallet address.** The wallet identity allowed to administer the domain. A separate **processor** wallet (used by the backend to sign paid / encrypted-content transactions) is optional — you can boot a node without one and add it later.
5. **One — ideally two — IPFS pinning service accounts.** The bundled IPFS node holds content locally, but a single node is a single point of failure. A pin service replicates pinned content to durable external storage and exposes a public gateway so anyone can fetch your content even when your own node is offline.

   We recommend **[Pinata](https://www.pinata.cloud/)** as the primary service. Most pinning services only fetch a CID off the public IPFS network *after* it has been published, which can mean minutes of unavailability for a freshly posted file. Pinata's API exposes a direct upload endpoint, so the backend hands the file straight to Pinata at the same time it adds it locally — content becomes durably pinned and reachable through the gateway immediately.

   Pinata's free plan uses the shared `gateway.pinata.cloud` (rate-limited, fine for low-traffic personal nodes, risky for anything public-facing). A **dedicated gateway** on a subdomain you control (`yourname.mypinata.cloud`) requires a paid plan. Other services — [web3.storage](https://web3.storage/), [Filebase](https://filebase.com/), [4everland](https://www.4everland.org/) — have analogous shared/dedicated tier splits.

   Add a second service alongside Pinata. Two independent providers effectively eliminate the risk that a single company's outage, billing dispute, or policy change takes your content offline. The bundle supports up to ten pin services (`PIN_SERVICE_2_*`, `PIN_SERVICE_3_*`, ...). A common pairing is Pinata as the fast/durable primary and `web3.storage` or `Filebase` as a lower-cost backstop.

   From each service you'll need three strings: the **API endpoint URL**, an **API key** (usually a JWT), and the service's **public gateway URL**.

The bundle ships its own IPFS node — you do not need to provide one separately. If you already run an IPFS node and want to point at it, see the override note at the end of [About IPFS Storage](#about-ipfs-storage).

There is no SAVVA-side registration and no API keys other than the pin service.

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

Open `.env` and replace the placeholder values. Seven fields are required:

- `DOMAIN`, `ADMIN_ADDRESS`, `DB_CONNECTION_STRING`, `BLOCKCHAIN_RPC`
- `PIN_SERVICE_URL`, `PIN_SERVICE_API_KEY`, `PIN_SERVICE_GATEWAY` (from your pin service account)

`PROCESSOR_KEY` is optional and can be added later. `IPFS_URL` defaults to the bundled IPFS service. Everything below the `OPTIONAL` divider has a sensible default and can stay commented out.

**About the port.** The container always listens on `8080` internally — that's hardcoded in the image. The Compose mapping `${PORT:-8080}:8080` publishes it to the host on port `8080` by default, so `curl http://localhost:8080/info` works out of the box. Set `PORT=` in `.env` only if you want a different *host* port (for example `PORT=9000` when 8080 is already taken). Your reverse proxy talks to the container's `8080` either way.

If you'd rather not paste a private key into a file, mount it as a secret instead:

```sh
mkdir -p secrets
echo "0xYourProcessorPrivateKey" > secrets/processor.key
chmod 600 secrets/processor.key
```

…and in `.env`:

```sh
PROCESSOR_KEY=
PROCESSOR_KEY_FILE=/run/secrets/processor.key
```

The `secrets/` folder is mounted read-only into the container by the default `docker-compose.yml`. The container reads the key from disk at startup; the value never appears in `docker inspect` or process listings.

### 3. Bootstrap the database

There are two ways to populate the database. **Restoring from a snapshot is strongly recommended.**

#### Option A (recommended) — restore from a public snapshot

SAVVA publishes daily PostgreSQL snapshots at [savva.app/public_files/](https://savva.app/public_files/), one per chain, named like:

```
savva-db-backup-monad-2026-05-03.sql.gz
savva-db-backup-pls-2026-05-03.sql.gz
```

Pick the chain you're indexing (`monad` is the default in this guide) and the latest date. The dump is plain gzipped SQL — restore it with `psql`:

```sh
# Pick the latest snapshot for your chain.
SNAP=https://savva.app/public_files/savva-db-backup-monad-2026-05-03.sql.gz

# Empty target database must already exist and match $DB_CONNECTION_STRING.
curl -L "$SNAP" | gunzip -c | psql "$DB_CONNECTION_STRING"
```

When the backend starts, it picks up exactly where the snapshot left off — usually a few hours behind tip — and finishes syncing in minutes rather than hours.

#### Option B — initialize an empty schema and resync from genesis

Useful if you're running on a custom chain, want independent verification, or just want to watch the indexer work:

```sh
docker compose run --rm savva-backend -initdb
```

This creates every table the backend needs and sets the schema version. The first `docker compose up -d` afterwards starts indexing from the configured `INITIAL_BLOCK` forward — expect a long initial sync.

### 4. Start it

```sh
docker compose up -d
```

The container pulls (≈100 MB), reads `.env`, renders its own YAML config, and starts indexing the blockchain. Watch the logs:

```sh
docker compose logs -f savva-backend
```

A healthy startup looks something like:

```
INF Config: Blockchain RPC configured
INF Config: Processor key configured
INF Connected to DB
INF SAVVA Backend. v:1.0.25
```

…followed by lines about the blockchain listener catching up. If you see errors instead, see [Troubleshooting](#troubleshooting).

### 5. Verify

The backend listens on port `8080`. From the same machine:

```sh
curl http://localhost:8080/info
```

You should get a JSON response describing the system: contract addresses, your domain, the version, IPFS gateways, and so on. That's a working SAVVA node.

## Putting It on the Public Internet

The image does not terminate TLS — that is deliberate. Different operators want different things (Cloudflare, Caddy, nginx, Traefik, Tailscale Funnel) and the bundle does not pick for you. The minimum is something that:

- Listens on `:443`, terminates TLS, proxies to the container's `:8080`.
- Forwards the WebSocket upgrade for the `/ws` endpoint.
- Routes `/api/*` and the SEO discovery URLs (`/robots.txt`, `/sitemap*.xml`) into the backend.

Caddy with `reverse_proxy 127.0.0.1:8080` is a reasonable two-line choice if you don't already have a preference. For a full production-grade nginx config, see the example in [`_shared/installation/nginx.conf.example`](/dev_docs/_shared/installation/nginx.conf.example) — it is the same config used for any SAVVA-platform site.

## Setting Your Domain Assets (the UI Bundle)

A SAVVA backend by itself does not ship a UI — it serves the API and expects the reverse proxy to serve the SolidJS web client out of an IPFS-hosted bundle. Once the backend is running:

1. Build (or fork) the [savva-ui-solidjs](https://github.com/AlexNa-Holdings/savva-ui-solidjs) project, pin the build output to IPFS, and grab the resulting CID.
2. From a SAVVA client signed by your admin wallet, call the `setDomainAssetsCID` admin command with the CID. The backend downloads the bundle, stores it under `data/domain_assets/`, and serves it from there.

The CID is **not** part of the YAML config — it is set at runtime and persisted in the database. You can swap UIs without restarting the backend.

## Updating to a New Version

Releases are published as tagged Docker images:

```sh
# Pin a specific version (recommended for production):
echo "SAVVA_VERSION=1.0.26" >> .env
docker compose pull
docker compose up -d

# Or just track latest:
docker compose pull && docker compose up -d
```

Schema migrations are applied automatically on startup. Watch the release notes for any version that bumps the schema in case there is a manual step.

## Troubleshooting

**`ERROR: required env var X is not set`** — a required field is missing in `.env`. The error names the variable.

**`dial tcp: connection refused` on the DB** — the container cannot reach Postgres. If your DB runs on the same host as Docker, use `host.docker.internal` (Mac/Windows) or your machine's LAN IP, not `localhost`. `localhost` inside the container means the container itself.

**`http: server gave HTTP response to HTTPS client`** for the IPFS URL — the scheme is wrong: `http://` for an HTTPS endpoint or vice versa. Check the URL.

**Logs say `RPC error` repeatedly** — the RPC URL is wrong, rate-limited, or the chain ID does not match. The default `CONFIG_CONTRACT` is for Monad; if you're connecting to a different chain, set `CONFIG_CONTRACT` in `.env` to the right address for that chain.

**The container starts but nothing happens for a long time** — that is normal if you used Option B in step 3 (empty schema). The backend is syncing blockchain history from `INITIAL_BLOCK` forward, which can take hours on a chain with a long history. Watch `docker compose logs -f`; you'll see block numbers climbing. If you don't want to wait, stop the container, drop the database, and restore from a public snapshot (Option A).

If you hit something not covered here, reach out through the SAVVA support channels with your `docker compose logs` output and your sanitized `.env` (redact the processor key).

## About IPFS Storage

There are two layers of pinning at work in a SAVVA install:

1. **The bundled Kubo node** (the `ipfs:` service in Compose) holds every uploaded file locally. It is fast, free, and immediately reachable — but it is a single point of failure. If that disk dies, the local copy goes with it.
2. **Your external pin service** (configured via `PIN_SERVICE_*` in `.env`) takes a copy too. The backend asks the pin service to pin each new CID right after it's added to the local node, so your community's content is durably replicated and remains reachable through the service's public gateway even when your own node is offline.

The combination of "fast local + durable external" is why both halves exist. **Don't skip the external pin service** unless you're spinning up a throwaway test node — pin loss is irreversible.

The bundled IPFS datastore deserves the same treatment as any other growing state directory. Unlike a Postgres database (a fixed schema that only grows when you add domains), **the IPFS datastore grows in proportion to your community's content.** The bundle ships with `process-all-domains: true` in the rendered config, so your node indexes and pins posts from **every domain on the network**, not just yours. That is deliberate — it keeps content available even when individual domain operators go offline — but it also means datastore growth tracks the whole platform, not just your own community. Plan for it the way you'd plan for any other pin-storage workload:

- **Put the datastore on the disk you're willing to grow.** `IPFS_DATA_PATH=` in `.env` controls the host path. Default is `./ipfs-data` next to the Compose file; for production, point it at a dedicated disk or volume (`/mnt/data1/ipfs`, an attached EBS volume, etc.).
- **Monitor disk usage.** No alarm rings if the disk fills. Watch `du -sh ipfs-data/` (or wherever you pointed it) and a generic disk-usage alert.
- **Back it up like any other state directory.** Stopping the `ipfs` service and rsync'ing the data folder is the simplest path.
- **Open port 4001 (TCP and UDP).** That is the IPFS swarm port. If it's firewalled off, content still pins locally but does not replicate to the wider IPFS network. Most cloud providers require you to open this in the security group / VPC firewall explicitly.
- **Kubo defaults to no MaxStorage cap.** If you want a hard ceiling with automatic GC, edit `ipfs-data/config` after first start and set `Datastore.StorageMax` to a size like `"100GB"`.

If you already operate an IPFS node and would rather use that, set `IPFS_URL=` in `.env` to point at it and remove the `ipfs:` service block from `docker-compose.yml`. The backend doesn't care.

## What's Intentionally Not in the Image

The image runs only the backend. The Compose stack adds the IPFS service, but **PostgreSQL**, **TLS**, and **the web client** remain your responsibility:

- **PostgreSQL** — operators have strong opinions about backups, replicas, and managed-vs-self-hosted. Bundling one would make all of those harder.
- **TLS** — the choice of reverse proxy is yours.
- **The web client** — distributed via IPFS and pinned by the admin, not baked into the backend image.

An "everything in one box" install that also includes Postgres, Caddy, and the UI may be published later as a separate Compose file for casual / hobby use. The current bundle targets people who'll run something they intend to keep up.
