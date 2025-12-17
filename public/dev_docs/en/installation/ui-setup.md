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
3. `/default_connect.yaml` endpoint - provides backend and IPFS gateway URLs to UI
4. Bot prerendering - SEO-friendly server-side rendering for search engines and social media
5. `/api` proxy - forwards API requests to backend on port 7000
6. WebSocket support - for real-time features
7. Static file serving with SPA routing
8. Smart caching - index.html never cached, assets cached for 1 year

**Customize the configuration:**

Edit these key variables in the downloaded file:

```nginx
# Your domain
server_name yourdomain.com;

# IPFS gateway (Pinata, Filebase, or custom)
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

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

#### Using Apache

Create Apache configuration:

```bash
sudo nano /etc/apache2/sites-available/savva-ui.conf
```

Apache config:

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com

    # Redirect to HTTPS
    Redirect permanent / https://yourdomain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com

    DocumentRoot /var/www/savva-ui

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/yourdomain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/yourdomain.com/privkey.pem

    # SPA routing
    <Directory /var/www/savva-ui>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # Fallback to index.html for SPA routing
        FallbackResource /index.html
    </Directory>

    # Security headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"

    # Compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css application/javascript application/json
    </IfModule>
</VirtualHost>
```

Enable site:

```bash
sudo a2enmod ssl rewrite headers deflate
sudo a2ensite savva-ui
sudo systemctl reload apache2
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

### Option C: Docker Deployment

Create Dockerfile:

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:

```bash
# Build image
docker build -t savva-ui .

# Run container
docker run -d -p 80:80 --name savva-ui savva-ui
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

## 8. Continuous Deployment

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy UI

on:
  push:
    branches: [ prod ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm ci

    - name: Build
      run: npm run build

    - name: Deploy via SCP
      uses: appleboy/scp-action@master
      with:
        host: ${{ secrets.DEPLOY_HOST }}
        username: ${{ secrets.DEPLOY_USER }}
        key: ${{ secrets.DEPLOY_SSH_KEY }}
        source: "dist/*"
        target: "/var/www/savva-ui"
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
- Check Nginx/Apache configuration for SPA routing
- Ensure `try_files` or `FallbackResource` is configured

### Web3 Wallet Not Connecting

- Check if HTTPS is enabled (required for Web3)
- Verify blockchain RPC URL is accessible
- Check browser wallet extension is installed
- Review Content Security Policy headers
