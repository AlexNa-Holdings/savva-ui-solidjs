# Prerequisites

Before installing SAVVA, ensure your environment meets the following requirements.

## Server Requirements

### Hardware

- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 50GB+ SSD (grows with content)
- **Network**: Stable internet connection with public IP

### Operating System

- **Linux**: Ubuntu 20.04 LTS or later (recommended)
- **Alternative**: Debian 10+, CentOS 8+, or any modern Linux distribution
- **macOS/Windows**: Possible for development, not recommended for production

## Software Requirements

### 1. PostgreSQL Database

**Required version**: PostgreSQL 14 or later

You have two options:

**Option A: Managed Database Service** (Recommended for Production)

We recommend **DigitalOcean Managed Databases** for production deployments:

- **Benefits**:
  - Automated backups and point-in-time recovery
  - Automatic updates and security patches
  - High availability and failover
  - Monitoring and alerts
  - No database administration overhead

- **Setup**:
  1. Create a DigitalOcean account at https://digitalocean.com
  2. Navigate to Databases → Create Database
  3. Choose PostgreSQL 14 or later
  4. Select your plan (starts at $15/month)
  5. Choose datacenter region (close to your server)
  6. Note the connection details (host, port, username, password, database name)

**Option B: Self-Hosted** (For Development or Custom Setups)

Install PostgreSQL on your own server:

```bash
# Required version check
psql --version  # Should output: psql (PostgreSQL) 14.x or higher
```

Installation on Ubuntu:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. IPFS Storage

SAVVA requires **both** a local IPFS node AND an external pinning service for reliable content storage.

**A. Local IPFS Node** (Required)

Install and run a local IPFS node for content handling:

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

For production, set up IPFS as a system service:
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

**B. External Pinning Service** (Required)

To ensure content permanence and availability, you **must** subscribe to at least one IPFS pinning service:

**Recommended Services:**

1. **Pinata** (https://pinata.cloud)
   - Free tier: 1GB storage
   - Paid plans available
   - Easy API integration
   - **Public Gateway**: `https://gateway.pinata.cloud/ipfs/`

2. **Web3.Storage** (https://web3.storage)
   - Free tier available
   - Built on Filecoin
   - Simple API
   - **Public Gateway**: `https://w3s.link/ipfs/`

3. **Filebase** (https://filebase.com)
   - S3-compatible API
   - IPFS pinning included
   - Geo-redundant storage
   - **Public Gateway**: `https://ipfs.filebase.io/ipfs/`

4. **NFT.Storage** (https://nft.storage)
   - Free for NFT content
   - Limited to NFT use cases
   - **Public Gateway**: `https://nftstorage.link/ipfs/`

**Important**: Choose a service that provides a **public IPFS gateway** URL. This gateway allows users to access content even if they don't have IPFS installed.

**Setup Steps:**

1. Create an account with your chosen pinning service
2. Generate an API key
3. Note the public gateway URL
4. Configure the backend with:
   - Pinning service API credentials
   - Public gateway URL for content retrieval
5. Test the connection before going live

**Why Both Are Needed:**

- **Local IPFS Node**: Fast content upload/download, local caching, network participation
- **Pinning Service**: Guarantees content permanence, redundancy, high availability even when your server is offline

### 3. Web Server (Production)

For production deployment:

**Nginx** (Recommended):
```bash
sudo apt install nginx
```

**Apache** (Alternative):
```bash
sudo apt install apache2
```

### 4. SSL Certificate

For HTTPS (required in production):

**Using Let's Encrypt** (Free):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Blockchain Requirements

### Web3 Provider

You need access to an Ethereum-compatible blockchain network. SAVVA supports both HTTP(S) and WebSocket (WSS) connections.

**Connection Types:**

- **HTTPS RPC**: `https://rpc.example.com` - Standard HTTP connection
- **WSS RPC**: `wss://rpc.example.com` - **Recommended** for faster event processing and real-time updates

**Recommended: Use WSS** for production deployments to enable:
- Real-time blockchain event monitoring
- Faster transaction confirmations
- Lower latency for user interactions

**Option A: Node Service Providers** (Recommended)

We recommend using **AllNodes** or similar managed node providers:

1. **AllNodes** (https://www.allnodes.com)
   - Supports PulseChain, Ethereum, and other EVM chains
   - Both HTTPS and WSS endpoints
   - High availability and redundancy
   - Plans start at ~$20/month

2. **Alternatives**:
   - **Infura** (https://infura.io) - Ethereum, Polygon, Arbitrum
   - **Alchemy** (https://alchemy.com) - Multiple chains
   - **QuickNode** (https://quicknode.com) - Wide chain support
   - **GetBlock** (https://getblock.io) - Multiple protocols

**Setup Steps**:
1. Create an account with your chosen provider
2. Create a new node/endpoint for your chain (e.g., PulseChain)
3. Get both HTTPS and WSS endpoint URLs
4. Configure backend to use WSS endpoint for optimal performance

**Option B: Self-Hosted Node**

Run your own blockchain node for maximum control:

- **Benefits**: Full control, no third-party dependency, no rate limits
- **Drawbacks**: Requires significant resources, ongoing maintenance
- **Storage**: 500GB+ SSD (grows over time)
- **Sync Time**: Several hours to days depending on chain

For PulseChain:
```bash
# Example: Running a PulseChain node with go-pulse
# See official PulseChain documentation for detailed setup
```

**Network Requirements**:
- RPC endpoint URL (HTTPS or WSS)
- **Recommended**: WSS endpoint for faster event processing
- Private key for deploying contracts (if deploying new network)
- Native tokens for gas fees (PLS for PulseChain, ETH for Ethereum, etc.)

**Note**: All necessary SAVVA smart contracts are already deployed on PulseChain. See [Official Contract Addresses](../licenses/official-contracts.md) for the complete list.

## Network Configuration

### Firewall Ports

Open the following ports:

- **80**: HTTP (redirects to HTTPS)
- **443**: HTTPS (UI)
- **8080**: Backend API (can be internal only)
- **4001**: IPFS Swarm (if running local IPFS)
- **5001**: IPFS API (localhost only)
- **8545**: Ethereum RPC (if running local node)

Example using `ufw`:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8080/tcp  # Or keep internal
sudo ufw enable
```

### DNS Configuration

Point your domain to your server:
- **A Record**: `yourdomain.com` → Server IP
- **A Record**: `www.yourdomain.com` → Server IP (optional)

**Note**: The backend API is served from the same domain at `/api` path (e.g., `https://yourdomain.com/api`), so no separate subdomain is needed.

## Verification Checklist

Before proceeding, verify all prerequisites:

- Server with adequate resources (2+ CPU cores, 4GB+ RAM, 50GB+ SSD)
- PostgreSQL 14+ installed and running (or managed database configured)
- IPFS node running as systemd service
- IPFS pinning service configured with public gateway
- Nginx or Apache web server installed
- Domain name with DNS configured
- SSL certificate obtained
- Blockchain RPC access configured (preferably WSS)
- Firewall ports opened
