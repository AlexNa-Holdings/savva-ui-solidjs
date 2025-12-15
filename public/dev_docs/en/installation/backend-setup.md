# Backend Server Setup

This guide covers installing and configuring the SAVVA backend server.

## Overview

The SAVVA backend is a Go-based API server that handles:
- User authentication and sessions
- Post storage and retrieval (PostgreSQL)
- IPFS integration for content storage
- WebSocket connections for real-time updates
- Blockchain interaction and monitoring

## 1. Download Backend Software

The latest SAVVA backend software is available at:

**https://savva.app/public_files/**

**Important Notes**:
- The backend is currently under active development - check for new releases regularly
- The backend is not yet open source. We plan to open source it in the future
- Download the latest version appropriate for your platform (typically `savva-backend-linux-amd64`)

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

To reduce synchronization time, you can restore from the latest database snapshot. The snapshot includes:
- All necessary database structure
- All content information from the SAVVA network
- **No personal user information** (privacy-safe)

The database is backed up automatically every day and available at:

**https://savva.app/public_files/**

Look for files like `savva-db-backup-YYYY-MM-DD.sql.gz`

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

If you prefer to start from scratch:

```bash
# Create database and user
sudo -u postgres psql << 'EOF'
CREATE DATABASE savva;
CREATE USER savva_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE savva TO savva_user;
\q
EOF
```

Note: The backend will create necessary tables automatically on first run.

## 3. Configuration

Create the SAVVA backend configuration file at `/etc/savva.yml`.

### Download Configuration Template

A complete configuration example is available:

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/savva.yml.example

# Or view it locally at:
# public/dev_docs/en/installation/savva.yml.example

# Copy to system location
sudo cp savva.yml.example /etc/savva.yml
sudo chmod 600 /etc/savva.yml  # Protect configuration file
```

**View the complete example**: [savva.yml.example](savva.yml.example)

### Configuration Parameters

#### Blockchain Settings

```yaml
blockchain-rpc: wss://your-rpc-endpoint.com:8546/your-api-key
initial-block: 20110428  # Starting block number for sync
```

- **blockchain-rpc**: WebSocket RPC endpoint (WSS recommended for real-time events)
  - Get from AllNodes, Infura, or your own node
  - Format: `wss://hostname:port/api-key`
- **initial-block**: Block number to start syncing from (skip old history)

#### Contracts

```yaml
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8
```

Use the official SAVVA Config contract address from [Official Contract Addresses](../licenses/official-contracts.md).

#### Database Configuration

```yaml
db:
  type: postgres
  connection-string: postgresql://username:password@host:port/database?sslmode=require
```

- **For DigitalOcean Managed Database**: Copy connection string from DigitalOcean dashboard
- **For self-hosted**: `postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable`

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

- **port**: Backend API port (default: 7000)
- **url-prefix**: API path prefix (usually "/api")
- **rpm-limit**: Rate limiting (requests per minute per IP)
- **cors-allowed-origins**: List of allowed domains for CORS

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

- **url**: Local IPFS API endpoint
- **pin-services**: Configure your pinning service(s) with API keys
- **gateways**: Public IPFS gateways for content retrieval

#### Content & Storage

```yaml
content-retry-delay: 5m
max-content-retries: 3
temp-folder: /tmp/savva
data-folder: /var/lib/savva
max-user-disk-space: 50 MB
max-post-size: 50 MB
```

- **data-folder**: Permanent storage for domain assets
- **temp-folder**: Temporary file storage
- **max-post-size**: Maximum size for a single post

#### Caching

```yaml
user-cache-ttl: 6h
post-cache-ttl: 6h
```

Time-to-live for cached data.

#### Full-Text Search

```yaml
full-text-search:
  enabled: true
  languages: [english, russian, french]
```

Enable PostgreSQL full-text search with desired languages.

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

- **process-all-domains**: Set to `true` to process all SAVVA network domains
- **domains**: Configure domain-specific settings (optional)

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

Press Ctrl+C to stop if it starts successfully.

### Set Up Systemd Service

Create systemd service file:

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

Enable and start:

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
curl http://localhost:7000/api/health

# Should return: {"status":"ok"}
```

You should see a JSON response indicating the backend is running. The backend logs can be viewed with:

```bash
# View real-time logs
sudo journalctl -u savva-backend -f

# View recent logs
sudo journalctl -u savva-backend -n 100
```
