# Configuración del sitio UI

Esta guía cubre la instalación y el despliegue del frontend SAVVA UI.

## Resumen

La UI de SAVVA es una aplicación de una sola página basada en SolidJS que proporciona:
- Interfaz para crear y explorar contenido
- Integración con wallets Web3
- Subidas de archivos a IPFS
- Interacciones con smart contracts
- Soporte multilingüe

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

No se necesitan direcciones de contrato codificadas en la configuración de la UI.

## 4. Construir la UI

### Build en desarrollo

```bash
# Run development server
npm run dev

# Access at http://localhost:5173
```

### Build de producción

```bash
# Build for production
npm run build

# Output directory: dist/
# Contains optimized static files ready for deployment
```

### Build con despliegue

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

## 5. Desplegar a Producción

### Opción A: Hosting de archivos estáticos

La carpeta construida `dist/` contiene archivos estáticos que pueden ser servidos por cualquier servidor web.

#### Usando Nginx (Recomendado)

SAVVA requiere una configuración completa de Nginx que maneje:
- Servir archivos estáticos de la UI
- Proxy del API del backend en `/api`
- Prerenderizado para bots de SEO
- Endpoint de configuración dinámica
- Soporte para WebSocket

**Descarga la plantilla completa de configuración de Nginx:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/en/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Ver el ejemplo completo**: [nginx.conf.example](nginx.conf.example)

**Características clave incluidas:**
1. Redirección HTTP a HTTPS
2. Configuración SSL/TLS (Cloudflare Origin Certificates o Let's Encrypt)
3. Endpoint `/default_connect.json` - configuración dinámica **requerida** para la UI (`.yaml` también es compatible como fallback)
4. Prerenderizado para bots - renderizado del lado del servidor amigable para SEO y redes sociales
5. Proxy `/api` - reenvía las solicitudes al backend en el puerto 7000
6. Soporte para WebSocket - para funciones en tiempo real
7. Servido de archivos estáticos con enrutado SPA
8. Caché inteligente - `index.html` nunca cacheado, assets cacheados por 1 año

### Entendiendo default_connect.json

La UI requiere un endpoint `/default_connect.json` que le indique dónde encontrar el backend y el gateway de IPFS (también soporta `/default_connect.yaml` como fallback). Esto se configura directamente en Nginx usando variables:

```nginx
# Define your deployment settings
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

# Serve dynamic configuration to the UI
location = /default_connect.json {
    default_type application/json;
    return 200 '{"domain":"$default_domain","backendLink":"$default_backend","default_ipfs_link":"$default_ipfs"}';
}
```

Este endpoint devuelve una respuesta JSON como:
```json
{
  "domain": "yourdomain.com",
  "backendLink": "https://yourdomain.com/api/",
  "default_ipfs_link": "https://gateway.pinata.cloud/ipfs/"
}
```

La UI obtiene esta configuración al arrancar para saber dónde conectarse.

**Personaliza la configuración:**

Edita estas variables clave en el archivo descargado:

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

### Opción B: Script de despliegue automatizado

Crea el script de despliegue:

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

Ejecuta el despliegue:

```bash
./deploy.sh
```

## 6. Verificar la instalación

Prueba la UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

Abrir en el navegador:
- Navega a `https://yourdomain.com`
- La UI debería cargarse y conectarse al backend
- Revisa la consola del navegador por errores

## 7. Configuración post-despliegue

### Actualizar CORS del backend

Asegúrate de que el backend permita tu dominio de la UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Configurar CDN (Opcional)

Para mejorar el rendimiento, considera usar un CDN:

- **Cloudflare**: Añade el sitio a Cloudflare, actualiza DNS
- **AWS CloudFront**: Crea una distribución apuntando al origin
- **Otros CDNs**: Sigue la documentación del proveedor

### Configurar monitoreo

Agrega monitoreo para uptime y errores:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
```

## Solución de problemas

### Falla en el build

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be v18+
```

### Problemas de conexión al backend

- Revisa `VITE_BACKEND_URL` en `.env`
- Verifica la configuración CORS del backend
- Revisa la consola del navegador en busca de errores
- Prueba la salud del backend: `curl https://api.yourdomain.com/api/info`

### Página en blanco / Pantalla blanca

- Revisa la consola del navegador por errores de JavaScript
- Verifica que todos los assets se hayan cargado correctamente
- Revisa la configuración de Nginx para el enrutado SPA
- Asegúrate de que la directiva `try_files` esté configurada correctamente

### Wallet Web3 no se conecta

- Verifica que HTTPS esté habilitado (requerido para Web3)
- Verifica que la URL RPC de la blockchain sea accesible
- Comprueba que la extensión de wallet esté instalada en el navegador
- Revisa los encabezados de Content Security Policy