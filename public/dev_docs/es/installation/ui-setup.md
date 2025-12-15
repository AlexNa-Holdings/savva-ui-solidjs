# Configuración del sitio web UI

Esta guía cubre la instalación y el despliegue del frontend SAVVA UI.

## Resumen

La UI de SAVVA es una aplicación de una sola página basada en SolidJS que proporciona:
- Interfaz para creación y navegación de contenido
- Integración con billeteras Web3
- Subida de archivos a IPFS
- Interacciones con contratos inteligentes
- Soporte multilenguaje

## 1. Clonar el repositorio

```bash
# Clone the UI repository
git clone https://github.com/your-org/savva-ui-solidjs.git
cd savva-ui-solidjs

# Checkout the latest release
git checkout $(git describe --tags --abbrev=0)
```

## 2. Instalar dependencias

```bash
# Install Node.js dependencies
npm install

# Or using yarn
yarn install
```

## 3. Configuración

### Crear archivo de entorno

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

### Variables de entorno

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

### Configuración adicional

La UI obtiene automáticamente las direcciones de los contratos de blockchain desde el endpoint `/info` del backend, que lee desde el contrato Config.

No se necesitan direcciones de contrato hardcodeadas en la configuración de la UI.

## 4. Construir la UI

### Compilación para desarrollo

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Compilación para producción

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Compilar con despliegue

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

## 5. Desplegar en producción

### Opción A: Hospedaje de archivos estáticos

La carpeta compilada `dist/` contiene archivos estáticos que pueden ser servidos por cualquier servidor web.

#### Usando Nginx (recomendado)

SAVVA requiere una configuración de Nginx completa que gestione:
- Servir archivos estáticos de la UI
- Proxy de la API backend en `/api`
- Prerenderizado para bots de SEO
- Endpoint de configuración dinámica
- Soporte WebSocket

**Descargar la plantilla completa de configuración de Nginx:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Ver el ejemplo completo**: [nginx.conf.example](nginx.conf.example)

**Características principales incluidas:**
1. Redirección de HTTP a HTTPS
2. Configuración SSL/TLS (Cloudflare Origin Certificates o Let's Encrypt)
3. Endpoint `/default_connect.yaml` - provee URLs del backend y del gateway IPFS a la UI
4. Prerenderizado para bots - renderizado del lado servidor amigable para SEO y redes sociales
5. Proxy `/api` - reenvía las solicitudes de la API al backend en el puerto 7000
6. Soporte WebSocket - para funcionalidades en tiempo real
7. Servicio de archivos estáticos con enrutamiento SPA
8. Caché inteligente - `index.html` nunca cacheado, assets cacheados por 1 año

**Personalizar la configuración:**

Edita estas variables clave en el archivo descargado:

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

**Desplegar archivos y habilitar el sitio:**

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

#### Usando Apache

Crear configuración de Apache:

```bash
sudo nano /etc/apache2/sites-available/savva-ui.conf
```

Configuración de Apache:

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

Habilitar sitio:

```bash
sudo a2enmod ssl rewrite headers deflate
sudo a2ensite savva-ui
sudo systemctl reload apache2
```

### Opción B: Script de despliegue automatizado

Crear script de despliegue:

```bash
nano deploy.sh
chmod +x deploy.sh
```

Contenido del script:

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

Ejecutar despliegue:

```bash
./deploy.sh
```

### Opción C: Despliegue con Docker

Crear Dockerfile:

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

Construir y ejecutar:

```bash
# Build image
docker build -t savva-ui .

# Run container
docker run -d -p 80:80 --name savva-ui savva-ui
```

## 6. Verificar la instalación

Probar la UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Abrir en el navegador:
- Navega a `https://yourdomain.com`
- La UI debería cargar y conectarse al backend
- Revisa la consola del navegador por si hay errores

## 7. Configuración post-despliegue

### Actualizar CORS del backend

Asegúrate de que el backend permita el dominio de tu UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Configurar CDN (opcional)

Para mejor rendimiento, considera usar un CDN:

- **Cloudflare**: Añade el sitio a Cloudflare, actualiza DNS
- **AWS CloudFront**: Crea una distribución apuntando al origin
- **Otros CDNs**: Sigue la documentación del proveedor

### Configurar monitorización

Añade monitorización para uptime y errores:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## 8. Despliegue continuo

### GitHub Actions

Crear `.github/workflows/deploy.yml`:

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

## Solución de problemas

### Fallo en la compilación

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Problemas de conexión con el backend

- Verifica `VITE_BACKEND_URL` en `.env`
- Verifica la configuración CORS del backend
- Revisa la consola del navegador por errores
- Prueba la salud del backend: `curl https://api.yourdomain.com/health`

### Página en blanco / pantalla blanca

- Revisa la consola del navegador por errores de JavaScript
- Verifica que todos los assets se carguen correctamente
- Comprueba la configuración de Nginx/Apache para el enrutamiento SPA
- Asegúrate de que `try_files` o `FallbackResource` esté configurado

### La billetera Web3 no se conecta

- Comprueba que HTTPS esté habilitado (requerido para Web3)
- Verifica que la URL RPC de la blockchain sea accesible
- Revisa que la extensión de la billetera del navegador esté instalada
- Revisa las cabeceras de Content Security Policy