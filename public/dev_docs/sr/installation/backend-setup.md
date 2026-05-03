# Backend Server Setup

Ovaj vodič pokriva instalaciju i konfiguraciju SAVVA backend servera.

## Overview

SAVVA backend je API server zasnovan na Go-u koji rukuje:
- Autentifikacijom korisnika i sesijama
- Skladištenjem i preuzimanjem postova (PostgreSQL)
- Integracijom sa IPFS-om za čuvanje sadržaja
- WebSocket konekcijama za real-time ažuriranja
- Interakcijom i praćenjem blockchain-a

## 1. Download Backend Software

Najnoviji SAVVA backend softver dostupan je na:

**https://savva.app/public_files/**

**Važne napomene**:
- Backend je trenutno u aktivnom razvoju - redovno proveravajte nove verzije
- Backend još nije open source. Planiramo da ga oslobodimo u budućnosti
- Preuzmite najnoviju verziju odgovarajuću za vašu platformu (obično `savva-backend-linux-amd64`)

```bash
# Download latest backend
cd /opt
sudo wget https://savva.app/public_files/savva-backend-linux-amd64

# Make executable
sudo chmod +x savva-backend-linux-amd64
sudo mv savva-backend-linux-amd64 savva-backend
```

## 2. Database Setup

### Option A: Restore from Latest Snapshot (Recommended)

Da biste smanjili vreme sinhronizacije, možete obnoviti iz najnovijeg snapshot-a baze podataka. Snapshot sadrži:
- Sve neophodne strukture baze podataka
- Sve informacije o sadržaju sa SAVVA mreže
- **Nijednu ličnu informaciju o korisnicima** (privatnost zadržana)

Baza se automatski bekapuje svakog dana i dostupna je na:

**https://savva.app/public_files/**

Potražite fajlove poput `savva-db-backup-YYYY-MM-DD.sql.gz`

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

### Option B: Fresh Database (For Development)

Ako želite da počnete od nule:

```bash
# Create database and user
sudo -u postgres psql << 'EOF'
CREATE DATABASE savva;
CREATE USER savva_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE savva TO savva_user;
\q
EOF
```

Napomena: Backend će automatski kreirati neophodne tabele pri prvom pokretanju.

## 3. Configuration

Kreirajte konfiguracioni fajl SAVVA backenda na `/etc/savva.yml`.

### Download Configuration Template

Kompletan primer konfiguracije dostupan je:

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/_shared/installation/savva.yml.example

# Or view it locally at:
# public/dev_docs/_shared/installation/savva.yml.example

# Copy to system location
sudo cp savva.yml.example /etc/savva.yml
sudo chmod 600 /etc/savva.yml  # Protect configuration file
```

**Pogledajte kompletan primer**: [savva.yml.example](/dev_docs/_shared/installation/savva.yml.example)

### Configuration Parameters

#### Blockchain Settings

```yaml
blockchain-rpc: wss://your-rpc-endpoint.com:8546/your-api-key
initial-block: 20110428  # Starting block number for sync
```

- **blockchain-rpc**: WebSocket RPC endpoint (WSS preporučeno za real-time događaje)
  - Nabavite od AllNodes, Infura, ili vašeg sopstvenog čvora
  - Format: `wss://hostname:port/api-key`
- **initial-block**: Broj bloka od kojeg počinje sinhronizacija (preskočite staru istoriju)

#### Contracts

```yaml
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8
```

Koristite zvaničnu SAVVA Config adresu ugovora iz [Official Contract Addresses](../licenses/official-contracts.md).

#### Database Configuration

```yaml
db:
  type: postgres
  connection-string: postgresql://username:password@host:port/database?sslmode=require
```

- **Za DigitalOcean Managed Database**: Kopirajte connection string iz DigitalOcean kontrolne table
- **Za self-hosted**: `postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable`

#### Server Settings

```yaml
server:
  port: 7000
  url-prefix: "/api"
  rpm-limit: 600  # Requests per minute limit
  cors-allowed-origins:
    - yourdomain.com
    - www.yourdomain.com
```

- **port**: Port za Backend API (podrazumevano: 7000)
- **url-prefix**: Prefiks putanje API-ja (obično "/api")
- **rpm-limit**: Ograničenje po zahtevu (zahteva u minuti po IP-u)
- **cors-allowed-origins**: Lista dozvoljenih domena za CORS

#### IPFS Configuration

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

- **url**: Lokalni IPFS API endpoint
- **pin-services**: Konfigurišite vaše pinning servise sa API ključevima
- **gateways**: Javni IPFS gateway-ovi za preuzimanje sadržaja

#### Content & Storage

```yaml
content-retry-delay: 5m
max-content-retries: 3
temp-folder: /tmp/savva
data-folder: /var/lib/savva
max-user-disk-space: 50 MB
max-post-size: 50 MB
```

- **data-folder**: Trajno skladište za domenske asset-e
- **temp-folder**: Privremeno skladište fajlova
- **max-post-size**: Maksimalna veličina pojedinačnog posta

#### Caching

```yaml
user-cache-ttl: 6h
post-cache-ttl: 6h
```

Vreme života (TTL) keširanih podataka.

#### Full-Text Search

```yaml
full-text-search:
  enabled: true
  languages: [english, russian, french]
```

Omogućite PostgreSQL full-text pretragu sa željenim jezicima.

#### Logging

```yaml
verbosity: info  # Options: trace, debug, info, warn, error
log-prefix: SAVVA
```

#### Domain Configuration

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

- **process-all-domains**: Postavite na `true` da obrađujete sve SAVVA mrežne domene
- **domains**: Konfigurišite postavke specifične za domen (opciono)

### Complete Example Configuration

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

### Create Storage Directories

```bash
sudo mkdir -p /var/lib/savva
sudo mkdir -p /tmp/savva
sudo chown -R your-user:your-user /var/lib/savva /tmp/savva
```

## 4. Run the Backend

### Test Configuration

```bash
# Test run to verify configuration
cd /opt
./savva-backend --config /etc/savva.yml
```

Pritisnite Ctrl+C da zaustavite ako se uspešno pokrene.

### Set Up Systemd Service

Kreirajte systemd servis fajl:

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

Omogućite i pokrenite:

```bash
sudo systemctl daemon-reload
sudo systemctl enable savva-backend
sudo systemctl start savva-backend
sudo systemctl status savva-backend

# View logs
sudo journalctl -u savva-backend -f
```

## 5. Verify Installation

```bash
# Test backend health (local)
curl http://localhost:7000/api/info

# Should return: {"status":"ok"}
```

Trebalo bi da vidite JSON odgovor koji pokazuje da backend radi. Backend logove možete pregledati sa:

```bash
# View real-time logs
sudo journalctl -u savva-backend -f

# View recent logs
sudo journalctl -u savva-backend -n 100
```