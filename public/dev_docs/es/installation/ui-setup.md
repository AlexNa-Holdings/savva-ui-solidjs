# Configuración del sitio UI

Esta guía cubre la instalación y el despliegue del frontend SAVVA UI.

## Resumen

La UI de SAVVA es una aplicación de una sola página basada en SolidJS que ofrece:
- Interfaz de creación y navegación de contenido
- Integración con monederos Web3
- Subidas de archivos a IPFS
- Interacciones con contratos inteligentes
- Soporte multidioma

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

La UI obtiene automáticamente las direcciones de los contratos de la blockchain desde el endpoint `/info` del backend, que lee desde el contrato Config.

No se necesitan direcciones de contrato codificadas en la configuración de la UI.

## 4. Construir la UI

### Compilación de desarrollo

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

### Compilación con despliegue

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

#### Usando Nginx (Recomendado)

SAVVA requiere una configuración completa de Nginx que gestione:
- Servicio de archivos estáticos de la UI
- Proxy del API del backend en `/api`
- Prerenderizado para bots y discovery SEO (`/robots.txt`, `/sitemap*.xml`)
- Endpoint de configuración dinámica
- Soporte para WebSocket

**Descarga la plantilla completa de configuración de Nginx:**

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/_shared/installation/nginx.conf.example

# Or view it locally at:
# public/dev_docs/_shared/installation/nginx.conf.example

# Edit with your domain and paths
nano nginx.conf.example
```

**Ver el ejemplo completo**: [nginx.conf.example](/docs/_shared/installation/nginx.conf.example)

**Características clave incluidas:**
1. Redirección HTTP a HTTPS
2. Configuración SSL/TLS (Certificados de origen de Cloudflare o Let's Encrypt)
3. Endpoint `/default_connect.json` - configuración dinámica **requerida** para la UI (`.yaml` también soportado como fallback)
4. Prerenderizado para bots - HTML renderizado en el servidor para motores de búsqueda, crawlers de IA y link unfurlers (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple; GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot, ...; Telegram, X, Facebook, Discord, Slack, WhatsApp, iMessage, LinkedIn, Reddit, Pinterest)
5. Rutas de descubrimiento SEO - `/robots.txt`, `/sitemap.xml` y `/sitemap-*.xml` proxied al backend por dominio
6. Proxy `/api` - reenvía las solicitudes API al backend en el puerto 7000
7. Soporte WebSocket - para funciones en tiempo real
8. Servicio de archivos estáticos con routing SPA
9. Caché inteligente - `index.html` nunca cacheado, assets cacheados por 1 año

#### Qué ofrece la superficie SEO

Con esta configuración, el backend sirve a los crawlers una versión HTML completamente renderizada de cada página (cuerpo del post, autor, fechas de publicación/actualización, etiquetas, datos estructurados, etiquetas Open Graph con dimensiones de imagen correctas) mientras que los usuarios humanos siguen recibiendo la rápida SPA de SolidJS. Los sitemaps por dominio y el `robots.txt` son generados por el backend, por lo que cada dominio en tu nodo obtiene su propia superficie de descubrimiento, política para crawlers de IA y URLs canónicas.

Para que esto funcione, tres cosas deben ser ciertas:

1. El backend (`savva-backend`) está en una versión que incluye los endpoints `/api/render`, `/api/robots.txt` y `/api/sitemap*.xml`.
2. Tu dominio tiene una entrada bajo `domains:` en `/etc/savva.yml`, y su clave coincide exactamente con el valor `set $default_domain "..."` en esta configuración de Nginx.
3. El enrutamiento de Nginx que sigue está en su lugar. (La configuración por defecto con la que muchas implementaciones antiguas empezaron tiene una expresión regular de bots de la era 2018 que no detecta a los crawlers de IA, no tiene rewrites para `/robots.txt` o `/sitemap.xml`, y un patrón de rewrite obsoleto `/api/render/$scheme://$host$uri` que el backend ya no acepta. Si estás actualizando desde una configuración más antigua, reemplaza esas tres partes.)

### Entendiendo default_connect.json

La UI requiere un endpoint `/default_connect.json` que le indique dónde encontrar el backend, qué cadena(s) sirve y la pasarela IPFS (también soporta `/default_connect.yaml` como fallback). Esto se configura directamente en Nginx.

La UI acepta dos esquemas — elige el que coincida con tu despliegue. El nuevo formato `chains` se recomienda para sitios nuevos y multicadena; el formato legado `backendLink` aún funciona.

**Nuevo formato (multicadena):**

```nginx
set $default_domain "yourdomain.com";

location = /default_connect.json {
    default_type application/json;
    return 200 '{
        "domain": "$default_domain",
        "chains": [
            {"chainId": 369, "rpc": "https://yourdomain.com/api/"}
        ],
        "default_ipfs_link": "https://gateway.pinata.cloud/ipfs/"
    }';
}
```

**Formato legado (backend único):**

```nginx
set $default_domain "yourdomain.com";
set $default_backend "https://yourdomain.com/api/";
set $default_ipfs "https://gateway.pinata.cloud/ipfs/";

location = /default_connect.json {
    default_type application/json;
    return 200 '{"domain":"$default_domain","backendLink":"$default_backend","default_ipfs_link":"$default_ipfs"}';
}
```

La UI obtiene esta configuración al arrancar. El valor `domain` debe coincidir con una clave bajo `domains:` en tu `/etc/savva.yml`, y también es lo que los rewrites SEO pasan al backend como `?domain=` para que pueda resolver qué configuración de dominio renderizar.

Personalizar la configuración:

Edita estas variables clave en el archivo descargado:

```nginx
# Your domain
server_name www.yourdomain.com yourdomain.com;

# MUST match a key under `domains:` in /etc/savva.yml. Used by the SEO
# rewrites as ?domain= and embedded into /default_connect.json.
set $default_domain "yourdomain.com";

# Path to UI build files
root /var/www/savva-ui;

# SSL certificates (Cloudflare or Let's Encrypt)
ssl_certificate     /etc/ssl/cloudflare/yourdomain.com.crt;
ssl_certificate_key /etc/ssl/cloudflare/yourdomain.com.key;
```

Luego actualiza el `chainId` / `rpc` (o las variables legadas `set $default_backend` / `set $default_ipfs`) dentro del bloque `/default_connect.json` para que coincidan con tu cadena.

Desplegar archivos y habilitar el sitio:

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

Ejecutar el despliegue:

```bash
./deploy.sh
```

## 6. Verificar la instalación

Probar la UI:

```bash
# Test website is accessible
curl https://yourdomain.com

# Should return HTML with SAVVA UI content
```

### Pruebas rápidas de la superficie SEO

Después de recargar Nginx, verifica que los bots, crawlers y archivos de descubrimiento lleguen al backend correctamente. Reemplaza `yourdomain.com` por tu nombre de host real.

```bash
# 1. Bot path returns rendered HTML (post body, title, OG tags), NOT the SPA shell.
curl -sA "Googlebot" https://yourdomain.com/ | head -10
# Expect: <!DOCTYPE html><html lang="en"><head>...<title>...</title>

# 2. robots.txt comes from the backend (per-domain), not nginx's default 404.
curl -s https://yourdomain.com/robots.txt
# Expect: User-agent: * / Disallow: /api/ ... / Sitemap: https://...

# 3. Sitemap index.
curl -s https://yourdomain.com/sitemap.xml | head -5
# Expect: <?xml version="1.0"...?><sitemapindex...

# 4. Modern AI crawler is also rendered (proves the new UA regex works).
curl -sA "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" \
  https://yourdomain.com/ | grep -E "og:title|<title>" | head -3

# 5. Human path STILL gets the SPA shell (regression check).
curl -sA "Mozilla/5.0 Chrome/120" https://yourdomain.com/ | head -5
# Expect: SPA shell (small index.html), NOT bot-rendered HTML.
```

Si alguno de estos devuelve la SPA shell cuando no debería (o viceversa), las causas más comunes son:

- El backend aún no ejecuta una versión que incluya `/api/render`, `/api/robots.txt` y `/api/sitemap*.xml`.
- El valor `set $default_domain "..."` en tu configuración de Nginx no coincide con una clave bajo `domains:` en `/etc/savva.yml`.
- Tu upstream `/api` no es accesible desde el host de Nginx (`curl -s http://localhost:7000/api/info` desde el host de Nginx debería devolver JSON).

Abrir en el navegador:
- Navega a `https://yourdomain.com`
- La UI debería cargarse y conectarse al backend
- Revisa la consola del navegador por errores

## 7. Configuración posterior al despliegue

### Actualizar CORS del backend

Asegúrate de que el backend permita tu dominio UI:

```yaml
# In backend config.yaml
cors:
  allowed_origins:
    - "https://yourdomain.com"
    - "https://www.yourdomain.com"
```

### Configurar CDN (Opcional)

Para mejor rendimiento, considera usar un CDN:

- **Cloudflare**: Añade el sitio a Cloudflare, actualiza DNS
- **AWS CloudFront**: Crea una distribución apuntando al origin
- **Otros CDNs**: Sigue la documentación del proveedor

### Configurar monitorización

Añade monitorización para tiempo de actividad y errores:

```bash
# Using UptimeRobot, Pingdom, or similar services
# Monitor: https://yourdomain.com
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

- Revisa `VITE_BACKEND_URL` en `.env`
- Verifica la configuración CORS del backend
- Revisa la consola del navegador por errores
- Prueba la salud del backend: `curl https://api.yourdomain.com/api/info`

### Página en blanco / pantalla blanca

- Revisa la consola del navegador por errores de JavaScript
- Verifica que todos los assets se carguen correctamente
- Revisa la configuración de Nginx para el routing SPA
- Asegúrate de que la directiva `try_files` esté configurada correctamente

### El monedero Web3 no se conecta

- Comprueba que HTTPS esté habilitado (requerido para Web3)
- Verifica que la URL RPC de la blockchain sea accesible
- Comprueba que la extensión del monedero esté instalada en el navegador
- Revisa las cabeceras de Content Security Policy