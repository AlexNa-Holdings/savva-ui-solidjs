# Configuración del servidor backend

Esta guía cubre la instalación y configuración del servidor backend de SAVVA.

## Resumen

El backend de SAVVA es un servidor API basado en Go que maneja:
- Autenticación de usuarios y sesiones
- Almacenamiento y recuperación de publicaciones (PostgreSQL)
- Integración con IPFS para almacenamiento de contenido
- Conexiones WebSocket para actualizaciones en tiempo real
- Interacción y monitoreo de la cadena de bloques

## 1. Descargar el software del backend

El último software del backend de SAVVA está disponible en:

**https://savva.app/public_files/**

**Notas importantes**:
- El backend está actualmente en desarrollo activo — revise nuevas versiones con regularidad
- El backend aún no es de código abierto. Planeamos hacerlo público en el futuro
- Descargue la versión más reciente adecuada para su plataforma (típicamente `savva-backend-linux-amd64`)

```bash
# Download latest backend
cd /opt
sudo wget https://savva.app/public_files/savva-backend-linux-amd64

# Make executable
sudo chmod +x savva-backend-linux-amd64
sudo mv savva-backend-linux-amd64 savva-backend
```

## 2. Configuración de la base de datos

### Opción A: Restaurar desde la última instantánea (Recomendado)

Para reducir el tiempo de sincronización, puede restaurar desde la última instantánea de la base de datos. La instantánea incluye:
- Toda la estructura necesaria de la base de datos
- Toda la información de contenido de la red SAVVA
- **No contiene información personal de usuarios** (segura para la privacidad)

La base de datos se respalda automáticamente cada día y está disponible en:

**https://savva.app/public_files/**

Busque archivos como `savva-db-backup-YYYY-MM-DD.sql.gz`

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

### Opción B: Base de datos nueva (Para desarrollo)

Si prefiere empezar desde cero:

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

Cree el archivo de configuración del backend SAVVA en `/etc/savva.yml`.

### Descargar plantilla de configuración

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

#### Configuración de blockchain

```yaml
blockchain-rpc: wss://your-rpc-endpoint.com:8546/your-api-key
initial-block: 20110428  # Starting block number for sync
```

- **blockchain-rpc**: Endpoint RPC WebSocket (se recomienda WSS para eventos en tiempo real)
  - Obtenga uno en AllNodes, Infura o desde su propio nodo
  - Formato: `wss://hostname:port/api-key`
- **initial-block**: Número de bloque desde el cual comenzar a sincronizar (omite historial antiguo)

#### Contratos

```yaml
contracts:
  Config: 0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8
```

Use la dirección oficial del contrato Config de SAVVA desde [Official Contract Addresses](../licenses/official-contracts.md).

#### Configuración de la base de datos

```yaml
db:
  type: postgres
  connection-string: postgresql://username:password@host:port/database?sslmode=require
```

- **Para DigitalOcean Managed Database**: Copie la cadena de conexión desde el panel de DigitalOcean
- **Para autoalojado**: `postgresql://savva_user:your_password@localhost:5432/savva?sslmode=disable`

#### Ajustes del servidor

```yaml
server:
  port: 7000
  url-prefix: "/api"
  rpm-limit: 600  # Requests per minute limit
  cors-allowed-origins:
    - yourdomain.com
    - www.yourdomain.com
```

- **port**: Puerto de la API del backend (por defecto: 7000)
- **url-prefix**: Prefijo de ruta de la API (normalmente "/api")
- **rpm-limit**: Límite de solicitudes (por minuto por IP)
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

- **url**: Endpoint local de la API de IPFS
- **pin-services**: Configure su(s) servicio(s) de pinning con claves API
- **gateways**: Gateways públicos de IPFS para la recuperación de contenido

#### Contenido y almacenamiento

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

Tiempo de vida para los datos en caché.

#### Búsqueda de texto completo

```yaml
full-text-search:
  enabled: true
  languages: [english, russian, french]
```

Habilite la búsqueda de texto completo de PostgreSQL con los idiomas deseados.

#### Registro

```yaml
verbosity: info  # Options: trace, debug, info, warn, error
log-prefix: SAVVA
```

#### Configuración de dominios

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

- **process-all-domains**: Establezca en `true` para procesar todos los dominios de la red SAVVA
- **domains**: Configure ajustes específicos por dominio (opcional)

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

## 4. Ejecutar el backend

### Prueba de configuración

```bash
# Test run to verify configuration
cd /opt
./savva-backend --config /etc/savva.yml
```

Presione Ctrl+C para detenerlo si se inicia correctamente.

### Configurar servicio systemd

Cree el archivo de servicio systemd:

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

Habilite e inicie:

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
curl http://localhost:7000/api/info

# Should return: {"status":"ok"}
```

Debería ver una respuesta JSON que indique que el backend está en funcionamiento. Los registros del backend pueden verse con:

```bash
# View real-time logs
sudo journalctl -u savva-backend -f

# View recent logs
sudo journalctl -u savva-backend -n 100
```