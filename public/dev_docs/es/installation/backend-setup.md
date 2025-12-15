# Configuración del Servidor Backend

Esta guía cubre la instalación y configuración del servidor backend de SAVVA.

## Descripción general

El backend de SAVVA es un servidor API escrito en Go que maneja:
- Autenticación de usuarios y sesiones
- Almacenamiento y recuperación de publicaciones (PostgreSQL)
- Integración con IPFS para el almacenamiento de contenido
- Conexiones WebSocket para actualizaciones en tiempo real
- Interacción y supervisión de la blockchain

## 1. Descargar el Software del Backend

El software más reciente del backend de SAVVA está disponible en:

**https://savva.app/public_files/**

**Notas importantes**:
- El backend está actualmente en desarrollo activo: revisa regularmente si hay nuevas versiones
- El backend todavía no es open source. Planeamos hacerlo open source en el futuro
- Descarga la versión más reciente apropiada para tu plataforma (típicamente `savva-backend-linux-amd64`)

```bash
# Download latest backend
cd /opt
sudo wget https://savva.app/public_files/savva-backend-linux-amd64

# Make executable
sudo chmod +x savva-backend-linux-amd64
sudo mv savva-backend-linux-amd64 savva-backend
```

## 2. Configuración de la Base de Datos

### Opción A: Restaurar desde el Snapshot más reciente (Recomendado)

Para reducir el tiempo de sincronización, puedes restaurar desde el snapshot más reciente de la base de datos. El snapshot incluye:
- Toda la estructura de base de datos necesaria
- Toda la información de contenido de la red SAVVA
- **No contiene información personal de usuarios** (seguro para la privacidad)

La base de datos se respalda automáticamente cada día y está disponible en:

**https://savva.app/public_files/**

Busca archivos como `savva-db-backup-YYYY-MM-DD.sql.gz`

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

### Opción B: Base de Datos Nueva (Para Desarrollo)

Si prefieres empezar desde cero:

```bash
# Create database and user
sudo -u postgres psql << 'EOF'
CREATE DATABASE savva;
CREATE USER savva_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE savva TO savva_user;
\q
EOF
```

Nota: El backend creará las tablas necesarias automáticamente en la primera ejecución.

## 3. Configuración

Crea el archivo de configuración del backend SAVVA en `/etc/savva.yml`.

### Descargar la plantilla de configuración

Un ejemplo completo de configuración está disponible:

```bash
# Download the example configuration
wget https://raw.githubusercontent.com/savva-network/savva-ui-solidjs/main/public/dev_docs/en/installation/savva.yml.example

# Or view it locally at:
# public/dev_docs/en/installation/savva.yml.example

# Copy to system location
sudo cp savva.yml.example /etc/savva.yml
sudo chmod 600 /etc/savva.yml  # Protect configuration file
```

**Ver el ejemplo completo**: [savva.yml.example](savva.yml.example)

### Parámetros de configuración

#### Ajustes de la Blockchain

```yaml
blockchain-rpc: wss://your-rpc-endpoint.com:8546/your-api-key
initial-block: 20110428  # Starting block number for sync
```

- **blockchain-rpc**: Endpoint RPC WebSocket (se recomienda WSS para eventos en tiempo real)
  - Consíguelo en AllNodes, Infura o en tu propio nodo
  - Formato: `wss://hostname:port/api-key`
- **initial-block**: Número de bloque desde el cual comenzar la sincronización (omitir historial antiguo)

#### Contratos

```yaml
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8
```

Usa la dirección oficial del contrato Config de SAVVA desde [Official Contract Addresses](../licenses/official-contracts.md).

#### Configuración de la Base de Datos

```yaml
db:
  type: postgres
  connection-string: postgresql://username:password@host:port/database?sslmode=require
```

- **Para DigitalOcean Managed Database**: Copia la cadena de conexión desde el panel de DigitalOcean
- **Para autoalojado**: `postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable`

#### Ajustes del Servidor

```yaml
server:
  port: 7000
  url-prefix: "/api"
  rpm-limit: 600  # Requests per minute limit
  cors-allowed-origins:
    - yourdomain.com
    - www.yourdomain.com
```

- **port**: Puerto del API del backend (por defecto: 7000)
- **url-prefix**: Prefijo de ruta de la API (usualmente "/api")
- **rpm-limit**: Límite de peticiones (requests per minute por IP)
- **cors-allowed-origins**: Lista de dominios permitidos para CORS

#### Configuración de IPFS

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

- **url**: Endpoint API local de IPFS
- **pin-services**: Configura tu(s) servicio(s) de pinning con las claves API
- **gateways**: Gateways públicas de IPFS para recuperación de contenido

#### Contenido y Almacenamiento

```yaml
content-retry-delay: 5m
max-content-retries: 3
temp-folder: /tmp/savva
data-folder: /var/lib/savva
max-user-disk-space: 50 MB
max-post-size: 50 MB
```

- **data-folder**: Almacenamiento permanente para activos de dominio
- **temp-folder**: Almacenamiento temporal de archivos
- **max-post-size**: Tamaño máximo para una sola publicación

#### Caché

```yaml
user-cache-ttl: 6h
post-cache-ttl: 6h
```

Tiempo de vida (TTL) para los datos en caché.

#### Búsqueda de Texto Completo

```yaml
full-text-search:
  enabled: true
  languages: [english, russian, french]
```

Habilita la búsqueda de texto completo de PostgreSQL con los idiomas deseados.

#### Registro (Logging)

```yaml
verbosity: info  # Options: trace, debug, info, warn, error
log-prefix: SAVVA
```

#### Configuración de Dominios

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

- **process-all-domains**: Configura a `true` para procesar todos los dominios de la red SAVVA
- **domains**: Configura ajustes específicos por dominio (opcional)

### Ejemplo completo de configuración

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

### Crear directorios de almacenamiento

```bash
sudo mkdir -p /var/lib/savva
sudo mkdir -p /tmp/savva
sudo chown -R your-user:your-user /var/lib/savva /tmp/savva
```

## 4. Ejecutar el Backend

### Probar la configuración

```bash
# Test run to verify configuration
cd /opt
./savva-backend --config /etc/savva.yml
```

Presiona Ctrl+C para detener si arranca correctamente.

### Configurar el servicio systemd

Crea el archivo de servicio systemd:

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

Habilita e inicia:

```bash
sudo systemctl daemon-reload
sudo systemctl enable savva-backend
sudo systemctl start savva-backend
sudo systemctl status savva-backend

# View logs
sudo journalctl -u savva-backend -f
```

## 5. Verificar la instalación

```bash
# Test backend health (local)
curl http://localhost:7000/api/health

# Should return: {"status":"ok"}
```

Deberías ver una respuesta JSON que indique que el backend está en funcionamiento. Los registros del backend pueden consultarse con:

```bash
# View real-time logs
sudo journalctl -u savva-backend -f

# View recent logs
sudo journalctl -u savva-backend -n 100
```