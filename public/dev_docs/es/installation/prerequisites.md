# Prerrequisitos

Antes de instalar SAVVA, asegúrate de que tu entorno cumpla los siguientes requisitos.

## Requisitos del servidor

### Hardware

- **CPU**: Se recomiendan 2+ núcleos
- **RAM**: Mínimo 4GB, recomendado 8GB
- **Almacenamiento**: SSD de 50GB+ (crece con el contenido)
- **Red**: Conexión a internet estable con IP pública

### Sistema operativo

- **Linux**: Ubuntu 20.04 LTS o posterior (recomendado)
- **Alternativa**: Debian 10+, CentOS 8+ o cualquier distribución Linux moderna
- **macOS/Windows**: Posible para desarrollo, no recomendado para producción

## Requisitos de software

### 1. Base de datos PostgreSQL

**Versión requerida**: PostgreSQL 14 o posterior

Tienes dos opciones:

**Opción A: Servicio de base de datos gestionado** (Recomendado para producción)

Recomendamos **DigitalOcean Managed Databases** para despliegues en producción:

- **Beneficios**:
  - Copias de seguridad automatizadas y recuperación punto en el tiempo
  - Actualizaciones automáticas y parches de seguridad
  - Alta disponibilidad y conmutación por error
  - Monitorización y alertas
  - Sin sobrecarga de administración de la base de datos

- **Configuración**:
  1. Crea una cuenta en DigitalOcean en https://digitalocean.com
  2. Navega a Databases → Create Database
  3. Elige PostgreSQL 14 o posterior
  4. Selecciona tu plan (empieza en $15/mes)
  5. Elige la región del datacenter (cerca de tu servidor)
  6. Anota los detalles de conexión (host, puerto, usuario, contraseña, nombre de la base de datos)

**Opción B: Alojarlo tú mismo** (Para desarrollo o configuraciones personalizadas)

Instala PostgreSQL en tu propio servidor:

```bash
# Required version check
psql --version  # Should output: psql (PostgreSQL) 14.x or higher
```

Instalación en Ubuntu:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Almacenamiento IPFS

SAVVA requiere **tanto** un nodo IPFS local COMO un servicio de pinning externo para un almacenamiento fiable del contenido.

**A. Nodo IPFS local** (Requerido)

Instala y ejecuta un nodo IPFS local para el manejo de contenido:

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

Para producción, configura IPFS como servicio del sistema:
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

**B. Servicio de pinning externo** (Requerido)

Para garantizar la permanencia y disponibilidad del contenido, **debes** suscribirte al menos a un servicio de pinning IPFS:

**Servicios recomendados:**

1. **Pinata** (https://pinata.cloud)
   - Plan gratuito: 1GB de almacenamiento
   - Planes de pago disponibles
   - Integración API sencilla
   - **Gateway público**: `https://gateway.pinata.cloud/ipfs/`

2. **Web3.Storage** (https://web3.storage)
   - Plan gratuito disponible
   - Construido sobre Filecoin
   - API simple
   - **Gateway público**: `https://w3s.link/ipfs/`

3. **Filebase** (https://filebase.com)
   - API compatible con S3
   - Pinning de IPFS incluido
   - Almacenamiento georredundante
   - **Gateway público**: `https://ipfs.filebase.io/ipfs/`

4. **NFT.Storage** (https://nft.storage)
   - Gratis para contenido NFT
   - Limitado a casos de uso NFT
   - **Gateway público**: `https://nftstorage.link/ipfs/`

**Importante**: Elige un servicio que proporcione una URL de **gateway público** de IPFS. Este gateway permite a los usuarios acceder al contenido incluso si no tienen IPFS instalado.

**Pasos de configuración:**

1. Crea una cuenta en el servicio de pinning elegido
2. Genera una clave API
3. Anota la URL del gateway público
4. Configura el backend con:
   - Credenciales API del servicio de pinning
   - URL del gateway público para la recuperación de contenido
5. Prueba la conexión antes de poner en producción

**Por qué se necesitan ambos:**

- **Nodo IPFS local**: Subida/descarga de contenido rápida, caché local, participación en la red
- **Servicio de pinning**: Garantiza la permanencia del contenido, redundancia y alta disponibilidad incluso cuando tu servidor esté desconectado

### 3. Servidor web (Producción)

Para despliegue en producción:

**Nginx** (Recomendado):
```bash
sudo apt install nginx
```

**Apache** (Alternativa):
```bash
sudo apt install apache2
```

### 4. Certificado SSL

Para HTTPS (requerido en producción):

**Usando Let's Encrypt** (Gratis):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Requisitos de blockchain

### Proveedor Web3

Necesitas acceso a una red blockchain compatible con Ethereum. SAVVA soporta conexiones tanto HTTP(S) como WebSocket (WSS).

**Tipos de conexión:**

- **HTTPS RPC**: `https://rpc.example.com` - Conexión HTTP estándar
- **WSS RPC**: `wss://rpc.example.com` - **Recomendado** para procesamiento de eventos más rápido y actualizaciones en tiempo real

**Recomendado: Usa WSS** para despliegues en producción para habilitar:
- Monitorización de eventos blockchain en tiempo real
- Confirmaciones de transacciones más rápidas
- Menor latencia para interacciones de usuario

**Opción A: Proveedores de nodos como servicio** (Recomendado)

Recomendamos usar **AllNodes** u otros proveedores de nodos gestionados:

1. **AllNodes** (https://www.allnodes.com)
   - Soporta PulseChain, Ethereum y otras cadenas EVM
   - Endpoints HTTPS y WSS
   - Alta disponibilidad y redundancia
   - Planes desde ~$20/mes

2. **Alternativas**:
   - **Infura** (https://infura.io) - Ethereum, Polygon, Arbitrum
   - **Alchemy** (https://alchemy.com) - Varias cadenas
   - **QuickNode** (https://quicknode.com) - Amplio soporte de cadenas
   - **GetBlock** (https://getblock.io) - Múltiples protocolos

**Pasos de configuración**:
1. Crea una cuenta en el proveedor elegido
2. Crea un nuevo nodo/endpoint para tu cadena (p. ej., PulseChain)
3. Obtén las URLs de endpoint HTTPS y WSS
4. Configura el backend para usar el endpoint WSS para un rendimiento óptimo

**Opción B: Nodo autoalojado**

Ejecuta tu propio nodo blockchain para máximo control:

- **Beneficios**: Control total, sin dependencia de terceros, sin límites de tasa
- **Desventajas**: Requiere recursos significativos y mantenimiento continuo
- **Almacenamiento**: SSD de 500GB+ (crece con el tiempo)
- **Tiempo de sincronización**: Varias horas o días según la cadena

Para PulseChain:
```bash
# Example: Running a PulseChain node with go-pulse
# See official PulseChain documentation for detailed setup
```

**Requisitos de red**:
- URL del endpoint RPC (HTTPS o WSS)
- **Recomendado**: endpoint WSS para procesamiento de eventos más rápido
- Clave privada para desplegar contratos (si vas a desplegar en una red nueva)
- Tokens nativos para tarifas de gas (PLS para PulseChain, ETH para Ethereum, etc.)

**Nota**: Todos los contratos inteligentes necesarios de SAVVA ya están desplegados en PulseChain. Consulta [Official Contract Addresses](../licenses/official-contracts.md) para la lista completa.

## Configuración de red

### Puertos del firewall

Abre los siguientes puertos:

- **80**: HTTP (redirige a HTTPS)
- **443**: HTTPS (UI)
- **8080**: API del backend (puede ser solo interna)
- **4001**: IPFS Swarm (si ejecutas IPFS local)
- **5001**: IPFS API (solo localhost)
- **8545**: RPC de Ethereum (si ejecutas un nodo local)

Ejemplo usando `ufw`:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8080/tcp  # Or keep internal
sudo ufw enable
```

### Configuración DNS

Apunta tu dominio a tu servidor:
- **A Record**: `yourdomain.com` → IP del servidor
- **A Record**: `www.yourdomain.com` → IP del servidor (opcional)

**Nota**: La API del backend se sirve desde el mismo dominio en la ruta `/api` (por ejemplo, `https://yourdomain.com/api`), por lo que no se necesita un subdominio separado.

## Lista de verificación de verificación

Antes de continuar, verifica todos los prerrequisitos:

- Servidor con recursos adecuados (2+ núcleos CPU, 4GB+ RAM, 50GB+ SSD)
- PostgreSQL 14+ instalado y en ejecución (o base de datos gestionada configurada)
- Nodo IPFS ejecutándose como servicio systemd
- Servicio de pinning IPFS configurado con gateway público
- Servidor web Nginx o Apache instalado
- Nombre de dominio con DNS configurado
- Certificado SSL obtenido
- Acceso RPC a la blockchain configurado (preferiblemente WSS)
- Puertos del firewall abiertos