# Podešavanje backend servera

Ovaj vodič obuhvata instalaciju i konfiguraciju SAVVA backend servera.

## Pregled

SAVVA backend je API server baziran na Go-u koji rukuje:
- Autentifikacijom korisnika i sesijama
- Čuvanjem i preuzimanjem objava (PostgreSQL)
- Integracijom sa IPFS za skladištenje sadržaja
- WebSocket konekcijama za ažuriranja u realnom vremenu
- Interakcijom sa blockchainom i nadgledanjem

## 1. Preuzmite backend softver

Najnoviji SAVVA backend softver je dostupan na:

**https://savva.app/public_files/**

**Važne napomene**:
- Backend je trenutno u aktivnom razvoju - redovno proveravajte nove verzije
- Backend još nije otvorenog koda. Planiramo da ga otvorimo u budućnosti
- Preuzmite najnoviju verziju odgovarajuću za vašu platformu (obično `savva-backend-linux-amd64`)

```bash
# Download latest backend
cd /opt
sudo wget https://savva.app/public_files/savva-backend-linux-amd64

# Make executable
sudo chmod +x savva-backend-linux-amd64
sudo mv savva-backend-linux-amd64 savva-backend
```

## 2. Podešavanje baze podataka

### Opcija A: Vraćanje iz najnovijeg snimka (preporučeno)

Da biste smanjili vreme sinhronizacije, možete vratiti bazu iz najnovijeg snimka. Snimak uključuje:
- Sve potrebne strukture baze podataka
- Sve informacije o sadržaju sa SAVVA mreže
- **Nema ličnih podataka korisnika** (zaštita privatnosti)

Baza podataka se automatski bekapuje svakog dana i dostupna je na:

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

### Opcija B: Nova baza podataka (za razvoj)

Ako želite da počnete iz početka:

```bash
# Create database and user
sudo -u postgres psql << 'EOF'
CREATE DATABASE savva;
CREATE USER savva_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE savva TO savva_user;
\q
EOF
```

Napomena: Backend će kreirati potrebne tabele automatski pri prvom pokretanju.

## 3. Konfiguracija

Kreirajte konfiguracioni fajl SAVVA backenda na `/etc/savva.yml`.

### Preuzmite šablon konfiguracije

Ceo primer konfiguracije je dostupan:

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/savva.yml.example

# Or view it locally at:
# public/dev_docs/en/installation/savva.yml.example

# Copy to system location
sudo cp savva.yml.example /etc/savva.yml
sudo chmod 600 /etc/savva.yml  # Protect configuration file
```

**Pogledajte ceo primer**: [savva.yml.example](savva.yml.example)

### Parametri konfiguracije

#### Podešavanja blockchaina

```yaml
blockchain-rpc: wss://your-rpc-endpoint.com:8546/your-api-key
initial-block: 20110428  # Starting block number for sync
```

- **blockchain-rpc**: WebSocket RPC endpoint (preporučuje se WSS za događaje u realnom vremenu)
  - Nabavite od AllNodes, Infura ili vašeg sopstvenog noda
  - Format: `wss://hostname:port/api-key`
- **initial-block**: Broj bloka od kojeg treba započeti sinhronizaciju (preskočiti staru istoriju)

#### Kontrakti

```yaml
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8
```

Koristite zvaničnu adresu SAVVA Config ugovora iz [Official Contract Addresses](../licenses/official-contracts.md).

#### Konfiguracija baze podataka

```yaml
db:
  type: postgres
  connection-string: postgresql://username:password@host:port/database?sslmode=require
```

- **Za DigitalOcean Managed Database**: Kopirajte konekcioni string sa DigitalOcean kontrolne table
- **Za samostalno hostovanje**: `postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable`

#### Podešavanja servera

```yaml
server:
  port: 7000
  url-prefix: "/api"
  rpm-limit: 600  # Requests per minute limit
  cors-allowed-origins:
    - yourdomain.com
    - www.yourdomain.com
```

- **port**: Port backend API-ja (podrazumevano: 7000)
- **url-prefix**: Prefiks API putanje (obično "/api")
- **rpm-limit**: Ograničenje broja zahteva (zahteva u minuti po IP)
- **cors-allowed-origins**: Lista dozvoljenih domena za CORS

#### IPFS konfiguracija

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
- **pin-services**: Konfigurišite servis(e) za pinovanje sa API ključevima
- **gateways**: Javne IPFS gateway-e za preuzimanje sadržaja

#### Sadržaj i skladištenje

```yaml
content-retry-delay: 5m
max-content-retries: 3
temp-folder: /tmp/savva
data-folder: /var/lib/savva
max-user-disk-space: 50 MB
max-post-size: 50 MB
```

- **data-folder**: Trajno skladište za domenske resurse
- **temp-folder**: Privremeno skladište fajlova
- **max-post-size**: Maksimalna veličina jedne objave

#### Keširanje

```yaml
user-cache-ttl: 6h
post-cache-ttl: 6h
```

Vreme trajanja (TTL) za keširane podatke.

#### Pretraga punog teksta

```yaml
full-text-search:
  enabled: true
  languages: [english, russian, french]
```

Omogućite PostgreSQL full-text pretragu sa željenim jezicima.

#### Logovanje

```yaml
verbosity: info  # Options: trace, debug, info, warn, error
log-prefix: SAVVA
```

#### Konfiguracija domena

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

- **process-all-domains**: Podesite na `true` da obrađujete sve domene SAVVA mreže
- **domains**: Konfigurišite podešavanja specifična za domen (opciono)

### Kompletan primer konfiguracije

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

### Kreirajte direktorijume za skladištenje

```bash
sudo mkdir -p /var/lib/savva
sudo mkdir -p /tmp/savva
sudo chown -R your-user:your-user /var/lib/savva /tmp/savva
```

## 4. Pokretanje backenda

### Test konfiguracije

```bash
# Test run to verify configuration
cd /opt
./savva-backend --config /etc/savva.yml
```

Pritisnite Ctrl+C da zaustavite ako se uspešno pokrene.

### Podešavanje systemd servisa

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

## 5. Proverite instalaciju

```bash
# Test backend health (local)
curl http://localhost:7000/api/info

# Should return: {"status":"ok"}
```

Trebalo bi da vidite JSON odgovor koji pokazuje da backend radi. Backend logovi se mogu pregledati pomoću:

```bash
# View real-time logs
sudo journalctl -u savva-backend -f

# View recent logs
sudo journalctl -u savva-backend -n 100
```