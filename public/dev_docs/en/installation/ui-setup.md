# UI Website Setup

This guide covers installing and deploying the SAVVA UI frontend.

## Overview

The SAVVA UI is a SolidJS-based single-page application that provides:
- Content creation and browsing interface
- Web3 wallet integration
- IPFS file uploads
- Smart contract interactions
- Multi-language support

## 1. Clone the Repository

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Configuration

### Create Environment File

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Environment Variables

```bash
# .env - SAVVA UI Configuration

# ============================================================================
# Application Configuration
# ============================================================================

# Backend API URL
VITE_BACKEND_URL=https://api.yourdomain.com

# Main website URL
VITE_WEBSITE_URL=https://yourdomain.com

# IPFS Gateway URL
VITE_IPFS_GATEWAY=https://ipfs.io
# Or use your own gateway:
# VITE_IPFS_GATEWAY=https://ipfs.yourdomain.com

# ============================================================================
# Build Configuration (Optional)
# ============================================================================

# Git branches for deployment
GIT_MAIN_BRANCH=main
PROD_BRANCH=prod

# ============================================================================
# Deployment via SSH (Optional)
# ============================================================================

# Server details for automated deployment
DEPLOY_HOST=yourdomain.com
DEPLOY_USER=deploy
DEPLOY_PATH=/var/www/savva-ui
DEPLOY_PORT=22
```

### Additional Configuration

The UI automatically fetches blockchain contract addresses from the backend `/info` endpoint, which reads from the Config contract.

No hardcoded contract addresses needed in the UI configuration.

## 4. Build the UI

### Development Build

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Production Build

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Build with Deployment

```bash
# Automated build + deploy (if DEPLOY_* vars configured)
npm run release

# This will:
# 1. Increment version
# 2. Run i18n scripts
# 3. Build production bundle
# 4. Commit and tag in git
# 5. Create GitHub release
# 6. Deploy via SCP (if configured)
```

## 5. Deploy to Production

### Option A: Static File Hosting

The built `dist/` folder contains static files that can be served by any web server.

#### Using Nginx (Recommended)

SAVVA requires a comprehensive Nginx configuration that handles:
- UI static file serving
- Backend API proxy at `/api`
- SEO bot prerendering
- Dynamic configuration endpoint
- WebSocket support

**Download the complete Nginx configuration template:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**View the complete example**: [nginx.conf.example](nginx.conf.example)

**Key features included:**
1. HTTP to HTTPS redirect
2. SSL/TLS setup (Cloudflare Origin Certificates or Let's Encrypt)
3. `/default_connect.yaml` endpoint - **required** dynamic configuration for the UI
4. Bot prerendering - SEO-friendly server-side rendering for search engines and social media
5. `/api` proxy - forwards API requests to backend on port 7000
6. WebSocket support - for real-time features
7. Static file serving with SPA routing
8. Smart caching - index.html never cached, assets cached for 1 year

### Understanding default_connect.yaml

The UI requires a `/default_connect.yaml` endpoint that tells it where to find the backend and IPFS gateway. This is configured directly in Nginx using variables:

```nginx
# Define your deployment settings
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

# Serve dynamic configuration to the UI
location = /default_connect.yaml {
    add_header Content-Type text/plain;
    return 200 'domain: $default_domain
backendLink: $default_backend
default_ipfs_link: $default_ipfs';
}
```

This endpoint returns a YAML response like:
```yaml
domain: yourdomain.com
backendLink: https://yourdomain.com/api/
default_ipfs_link: https://gateway.pinata.cloud/ipfs/
```

The UI fetches this configuration on startup to know where to connect.

**Customize the configuration:**

Edit these key variables in the downloaded file:

```nginx
# Your domain
server_name yourdomain.com;

# Dynamic configuration variables
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";  # Or Filebase, etc.

# Path to UI build files
root /var/www/savva-ui;

# SSL certificates (Cloudflare or Let's Encrypt)
ssl_certificate     /etc/ssl/cloudflare/yourdomain.com.crt;
ssl_certificate_key /etc/ssl/cloudflare/yourdomain.com.key;
```

**Deploy files and enable site:**

```bash
# Create web directory
sudo mkdir -p /var/www/savva-ui

# Copy built files
sudo cp -r dist/* /var/www/savva-ui/

# Set permissions
sudo chown -R www-data:www-data /var/www/savva-ui

# Install Nginx config
sudo cp nginx.conf.example /etc/nginx/sites-available/yourdomain.com

# Enable site
sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Option B: Automated Deployment Script

Create deployment script:

```bash
nano deploy.sh
chmod +x deploy.sh
```

Script content:

```bash
#!/bin/bash
# deploy.sh - SAVVA UI Deployment Script

set -e  # Exit on error

SERVER="deploy@yourdomain.com"
REMOTE_PATH="/var/www/savva-ui"
BUILD_DIR="dist"

echo "Building UI..."
npm run build

echo "Deploying to server..."
rsync -avz --delete "${BUILD_DIR}/" "${SERVER}:${REMOTE_PATH}/"

echo "Setting permissions..."
ssh "${SERVER}" "sudo chown -R www-data:www-data ${REMOTE_PATH}"

echo "Deployment complete!"
echo "Visit https://yourdomain.com"
```

Run deployment:

```bash
./deploy.sh
```

## 6. Verify Installation

Test the UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Open in browser:
- Navigate to `https://yourdomain.com`
- UI should load and connect to backend
- Check browser console for any errors

## 7. Post-Deployment Configuration

### Update Backend CORS

Ensure backend allows your UI domain:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Configure CDN (Optional)

For better performance, consider using a CDN:

- **Cloudflare**: Add site to Cloudflare, update DNS
- **AWS CloudFront**: Create distribution pointing to origin
- **Other CDNs**: Follow provider documentation

### Setup Monitoring

Add monitoring for uptime and errors:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## Troubleshooting

### Build Fails

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Backend Connection Issues

- Check `VITE_BACKEND_URL` in `.env`
- Verify backend CORS settings
- Check browser console for errors
- Test backend health: `curl https://api.yourdomain.com/api/info`

### Blank Page / White Screen

- Check browser console for JavaScript errors
- Verify all assets loaded correctly
- Check Nginx configuration for SPA routing
- Ensure `try_files` directive is configured correctly

### Web3 Wallet Not Connecting

- Check if HTTPS is enabled (required for Web3)
- Verify blockchain RPC URL is accessible
- Check browser wallet extension is installed
- Review Content Security Policy headers
