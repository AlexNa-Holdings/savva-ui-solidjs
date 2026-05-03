# Instalación de Node Docker

Esta página describe la forma recomendada de ejecutar un nodo backend de SAVVA: una imagen pública de Docker con una única pila Compose. Si tienes Docker (24+) y el plugin de Compose instalado, poner en marcha un nodo funcional lleva aproximadamente una hora de configuración: no necesitas acceso al código fuente ni un toolchain de Go.

## Por qué Docker

SAVVA es una plataforma multi-dominio. El mismo protocolo y el mismo registro de contenido on-chain pueden servirse desde cualquier número de dominios independientes, cada uno con su propia marca, comunidad y política de moderación. Cualquiera puede poner en marcha un dominio.

Hasta que se publicó la imagen Docker, hacerlo en la práctica requería compilar el backend desde el código fuente y escribir un largo YAML de configuración desde cero. El paquete de Docker reemplaza eso con una imagen, un archivo `.env` y un único `docker compose up -d`. El protocolo siempre fue sin permisos; la imagen hace que la implementación coincida.

## Qué necesitarás

Cinco cosas, ninguna específica de SAVVA:

1. **Un servidor Linux o Mac** con Docker (24+) y el plugin de Compose. Un VPS pequeño es suficiente. Necesitarás espacio en disco para el datastore de IPFS incluido — ver [Acerca del almacenamiento IPFS](#about-ipfs-storage).
2. **Una base de datos PostgreSQL** (14 o posterior) a la que el backend pueda acceder. Puede ejecutarse en la misma máquina, en un servicio gestionado (DigitalOcean, RDS, Supabase, Neon, etc.) o en cualquier otro lugar.
3. **Una URL RPC de blockchain.** SAVVA funciona sobre Monad. El RPC público de mainnet `https://rpc.monad.xyz` funciona directamente sin registro. Los RPC públicos tienen límites de tasa y son compartidos, así que para un nodo que planees mantener con tráfico real considera ejecutar tu propio nodo Monad o alquilar un endpoint privado (QuickNode, Alchemy, Ankr, etc.). Puedes empezar con el RPC público y cambiarlo después editando una línea en `.env`.
4. **Una dirección de wallet de administrador.** La identidad de wallet que tiene permiso para administrar el dominio. Una wallet de **procesador** separada (usada por el backend para firmar transacciones pagadas / de contenido cifrado) es opcional: puedes arrancar un nodo sin ella y añadirla más tarde.
5. **Una —idealmente dos— cuentas de servicios de pinning IPFS.** El nodo IPFS incluido guarda el contenido localmente, pero un único nodo es un único punto de fallo. Un servicio de pin replica el contenido fijado a almacenamiento externo durable y expone una gateway pública para que cualquiera pueda obtener tu contenido incluso cuando tu propio nodo esté offline.

   Recomendamos **[Pinata](https://www.pinata.cloud/)** como servicio principal. La mayoría de servicios de pinning sólo recuperan un CID de la red pública IPFS *después* de que haya sido publicado, lo que puede significar minutos de indisponibilidad para un archivo recién publicado. La API de Pinata expone un endpoint de subida directa, por lo que el backend entrega el archivo directamente a Pinata al mismo tiempo que lo añade localmente — el contenido queda duramente fijado y accesible a través de la gateway inmediatamente.

   El plan gratuito de Pinata usa la `gateway.pinata.cloud` compartida (con límite de tasa, adecuada para nodos personales de bajo tráfico, arriesgada para servicios públicos). Una **gateway dedicada** en un subdominio que controles (`yourname.mypinata.cloud`) requiere un plan de pago. Otros servicios — [web3.storage](https://web3.storage/), [Filebase](https://filebase.com/), [4everland](https://www.4everland.org/) — tienen divisiones de niveles compartidos/dedicados similares.

   Añade un segundo servicio junto con Pinata. Dos proveedores independientes eliminan efectivamente el riesgo de que la caída, disputa de facturación o cambio de política de una sola compañía deje tu contenido fuera de línea. El paquete soporta hasta diez servicios de pin (`PIN_SERVICE_2_*`, `PIN_SERVICE_3_*`, ...). Una combinación común es Pinata como primaria rápida/durable y `web3.storage` o `Filebase` como respaldo de menor coste.

   De cada servicio necesitarás tres cadenas: la **URL del endpoint API**, una **clave API** (normalmente un JWT) y la **URL de la gateway pública** del servicio.

El paquete incluye su propio nodo IPFS — no necesitas proporcionar uno por separado. Si ya operas un nodo IPFS y quieres apuntar a él, consulta la nota de anulación al final de [Acerca del almacenamiento IPFS](#about-ipfs-storage).

No hay registro por parte de SAVVA ni claves API aparte de las del servicio de pin.

## La instalación de cinco minutos

### 1. Crea el directorio de despliegue y los dos archivos

```sh
mkdir savva && cd savva
```

Crea **`docker-compose.yml`**:

```yaml
services:
  ipfs:
    image: ipfs/kubo:latest
    container_name: savva-ipfs
    restart: unless-stopped
    environment:
      - IPFS_PROFILE=server
    volumes:
      # Override IPFS_DATA_PATH in .env to put the datastore on a
      # different disk. Default is ./ipfs-data alongside this file.
      - ${IPFS_DATA_PATH:-./ipfs-data}:/data/ipfs
    ports:
      # Swarm port — must be reachable from the public internet (or
      # at least NAT-traversable) for the node to participate in pin
      # replication. Bind both TCP and UDP.
      - "4001:4001"
      - "4001:4001/udp"
    healthcheck:
      test: ["CMD-SHELL", "ipfs --api=/ip4/127.0.0.1/tcp/5001 id >/dev/null 2>&1 || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 5s

  savva-backend:
    image: ghcr.io/alexna-holdings/savva-backend:${SAVVA_VERSION:-latest}
    container_name: savva-backend
    restart: unless-stopped
    env_file: .env
    depends_on:
      ipfs:
        condition: service_healthy
    ports:
      - "${PORT:-8080}:8080"
    volumes:
      - ./data:/data
      # Optional: mount a private key file and set PROCESSOR_KEY_FILE
      # in .env to point at this path inside the container.
      - ./secrets:/run/secrets:ro
```

Crea **`.env`** (rellenarás los valores en el paso 2):

```sh
# ----------------------------------------------------------------------
# REQUIRED — fill these in before `docker compose up`.
# ----------------------------------------------------------------------

# Public hostname this instance serves (no scheme, no path).
DOMAIN=mysavva.example.com

# Wallet address(es) that administer the domain (EIP-55 checksummed).
# To list multiple admins, separate with commas: 0xAaa...,0xBbb...
ADMIN_ADDRESS=0xYourAdminWalletAddress

# Postgres connection string. The DB must already exist; see step 3.
DB_CONNECTION_STRING=postgres://savva:savva@db.example.com:5432/savva?sslmode=disable

# IPFS API endpoint. By default this points at the `ipfs` service
# bundled in docker-compose.yml above. Override only if you want to
# point at an IPFS node you run elsewhere.
# IPFS_URL=http://ipfs:5001

# Blockchain RPC URL. The Monad public mainnet RPC works out of the box;
# swap for a private endpoint if you need higher throughput / reliability.
BLOCKCHAIN_RPC=https://rpc.monad.xyz

# Primary IPFS pin service. Required — see step 5 in the prereqs.
# PIN_SERVICE_URL: the IPFS Pinning Service API endpoint
# PIN_SERVICE_API_KEY: the JWT / bearer token from your account
# PIN_SERVICE_GATEWAY: the service's public gateway URL
PIN_SERVICE_URL=https://api.pinata.cloud/psa
PIN_SERVICE_API_KEY=
PIN_SERVICE_GATEWAY=https://gateway.pinata.cloud/ipfs/

# Strongly recommended: a SECOND pin service for redundancy. The
# bundle supports up to ten (PIN_SERVICE_2_*, PIN_SERVICE_3_*, ...).
# PIN_SERVICE_2_URL=https://api.web3.storage/pins
# PIN_SERVICE_2_API_KEY=
# PIN_SERVICE_2_GATEWAY=https://w3s.link/ipfs/

# Processor signing key. OPTIONAL — leave empty to boot a node without
# processor capability. Set later when you want to handle paid /
# encrypted content. EITHER paste the raw hex key here, OR mount a
# file at ./secrets/processor.key and set PROCESSOR_KEY_FILE below.
PROCESSOR_KEY=
# PROCESSOR_KEY_FILE=/run/secrets/processor.key

# ----------------------------------------------------------------------
# OPTIONAL — sensible defaults are baked in. Uncomment to override.
# ----------------------------------------------------------------------

# On-chain Config contract. Default is Monad mainnet; change for other chains.
# CONFIG_CONTRACT=0xEeDf3fd85b8C955160CBee10FB45e02add055e39

# Where the bundled IPFS node stores its data on the host. Defaults to
# ./ipfs-data alongside this file. Point at a different disk for
# production deployments — the datastore grows with pinned content.
# IPFS_DATA_PATH=./ipfs-data

# Telegram bot for the domain (optional). Set both TOKEN and NAME to
# enable; leave either blank to disable. TOKEN comes from BotFather,
# NAME is the bot's @-username without the @. The bot ID is auto-
# derived from the token's "<id>:<secret>" prefix.
# TELEGRAM_BOT_TOKEN=123456789:ABCdef-the-rest-of-your-token
# TELEGRAM_BOT_NAME=YourSavvaBot

# Image version to pull (matches a release tag).
# SAVVA_VERSION=latest

# Host port exposed by docker compose. The container always listens
# on 8080 internally; this only changes the port your host binds to.
# PORT=8080

# Verbosity: trace, debug, info, warn, error.
# VERBOSITY=info

# Block to start indexing from on a fresh DB.
# INITIAL_BLOCK=0

# Size limits.
# MAX_FILE_SIZE=50MB
# MAX_POST_SIZE=10MB
# MAX_USER_DISK_SPACE=1GB

# Public website URL for the domain (defaults to https://${DOMAIN}).
# DOMAIN_WEBSITE=https://mysavva.example.com
```

Eso es todo el paquete de instalación: dos archivos en un directorio.

### 2. Rellena `.env`

Abre `.env` y sustituye los valores de marcador de posición. Siete campos son obligatorios:

- `DOMAIN`, `ADMIN_ADDRESS`, `DB_CONNECTION_STRING`, `BLOCKCHAIN_RPC`
- `PIN_SERVICE_URL`, `PIN_SERVICE_API_KEY`, `PIN_SERVICE_GATEWAY` (desde la cuenta de tu servicio de pin)

`PROCESSOR_KEY` es opcional y puede añadirse más tarde. `IPFS_URL` por defecto apunta al servicio IPFS incluido. Todo lo que esté debajo del separador `OPTIONAL` tiene un valor por defecto razonable y puede quedar comentado.

Sobre el puerto. El contenedor siempre escucha internamente en `8080` — eso está hardcodeado en la imagen. El mapeo de Compose `${PORT:-8080}:8080` lo publica en el host en el puerto `8080` por defecto, por lo que `curl http://localhost:8080/info` funciona sin más. Ajusta `PORT=` en `.env` sólo si quieres un puerto *host* distinto (por ejemplo `PORT=9000` cuando 8080 ya está ocupado). Tu reverse proxy habla con el puerto `8080` del contenedor en cualquier caso.

Si prefieres no pegar una clave privada en un archivo, móntala como secreto:

```sh
mkdir -p secrets
echo "0xYourProcessorPrivateKey" > secrets/processor.key
chmod 600 secrets/processor.key
```

…y en `.env`:

```sh
PROCESSOR_KEY=
PROCESSOR_KEY_FILE=/run/secrets/processor.key
```

La carpeta `secrets/` se monta de solo lectura dentro del contenedor por el `docker-compose.yml` por defecto. El contenedor lee la clave desde el disco al iniciarse; el valor nunca aparece en `docker inspect` ni en listados de procesos.

### 3. Inicializa la base de datos

Hay dos maneras de poblar la base de datos. **Se recomienda encarecidamente restaurar desde un snapshot.**

#### Opción A (recomendada) — restaurar desde un snapshot público

SAVVA publica snapshots diarios de PostgreSQL en [savva.app/public_files/](https://savva.app/public_files/), uno por cadena, nombrados así:

```
savva-db-backup-monad-2026-05-03.sql.gz
savva-db-backup-pls-2026-05-03.sql.gz
```

Elige la cadena que estás indexando (`monad` es la predeterminada en esta guía) y la fecha más reciente. El volcado es SQL gzippado plano — restaúralo con `psql`:

```sh
# Pick the latest snapshot for your chain.
SNAP=https://savva.app/public_files/savva-db-backup-monad-2026-05-03.sql.gz

# Empty target database must already exist and match $DB_CONNECTION_STRING.
curl -L "$SNAP" | gunzip -c | psql "$DB_CONNECTION_STRING"
```

Cuando el backend arranca, continúa exactamente donde quedó el snapshot — normalmente unas pocas horas por detrás del tip — y termina de sincronizar en minutos en lugar de horas.

#### Opción B — inicializar un esquema vacío y resincrodar desde el génesis

Útil si ejecutas en una cadena personalizada, quieres verificación independiente o simplemente quieres observar el indexador trabajando:

```sh
docker compose run --rm savva-backend -initdb
```

Esto crea todas las tablas que el backend necesita y establece la versión del esquema. El primer `docker compose up -d` después de esto empieza a indexar desde `INITIAL_BLOCK` configurado hacia adelante — espera una sincronización inicial larga.

### 4. Arráncalo

```sh
docker compose up -d
```

El contenedor hace pull (≈100 MB), lee `.env`, genera su propio YAML de configuración y comienza a indexar la blockchain. Observa los logs:

```sh
docker compose logs -f savva-backend
```

Un arranque sano se ve algo así:

```
INF Config: Blockchain RPC configured
INF Config: Processor key configured
INF Connected to DB
INF SAVVA Backend. v:1.0.25
```

…seguido por líneas sobre el listener de blockchain alcanzando el estado. Si ves errores en su lugar, consulta [Resolución de problemas](#troubleshooting).

### 5. Verifica

El backend escucha en el puerto `8080`. Desde la misma máquina:

```sh
curl http://localhost:8080/info
```

Deberías obtener una respuesta JSON describiendo el sistema: direcciones de contratos, tu dominio, la versión, gateways IPFS, etc. Eso indica un nodo SAVVA funcionando.

## Ponerlo en Internet Público

La imagen no termina TLS — eso es deliberado. Diferentes operadores quieren cosas distintas (Cloudflare, Caddy, nginx, Traefik, Tailscale Funnel) y el paquete no elige por ti. Lo mínimo es algo que:

- Escuche en `:443`, termine TLS y haga proxy al `:8080` del contenedor.
- Reenvíe la actualización WebSocket para el endpoint `/ws`.
- Enrute `/api/*` y las URLs de descubrimiento SEO (`/robots.txt`, `/sitemap*.xml`) al backend.

Caddy con `reverse_proxy 127.0.0.1:8080` es una elección razonable de dos líneas si no tienes preferencia. Para una configuración nginx de grado producción completa, consulta el ejemplo en [`_shared/installation/nginx.conf.example`](/dev_docs/_shared/installation/nginx.conf.example) — es la misma configuración usada para cualquier sitio de la plataforma SAVVA.

## Configurar los activos de tu dominio (el paquete UI)

Un backend SAVVA por sí solo no incluye una UI — sirve la API y espera que el reverse proxy sirva el cliente web SolidJS desde un paquete alojado en IPFS. Una vez que el backend esté en funcionamiento:

1. Compila (o bifurca) el proyecto [savva-ui-solidjs](https://github.com/AlexNa-Holdings/savva-ui-solidjs), fija (pin) la salida de la build en IPFS y obtén el CID resultante.
2. Desde un cliente SAVVA firmado por tu wallet de administrador, llama al comando admin `setDomainAssetsCID` con el CID. El backend descarga el paquete, lo almacena bajo `data/domain_assets/` y lo sirve desde allí.

El CID **no** forma parte del YAML de configuración — se establece en tiempo de ejecución y se persiste en la base de datos. Puedes cambiar las UIs sin reiniciar el backend.

## Actualizar a una nueva versión

Las releases se publican como imágenes Docker etiquetadas:

```sh
# Pin a specific version (recommended for production):
echo "SAVVA_VERSION=1.0.26" >> .env
docker compose pull
docker compose up -d

# Or just track latest:
docker compose pull && docker compose up -d
```

Las migraciones de esquema se aplican automáticamente al inicio. Observa las notas de la release para cualquier versión que aumente el esquema por si hay algún paso manual.

## Resolución de problemas

**`ERROR: required env var X is not set`** — falta un campo obligatorio en `.env`. El error nombra la variable.

**`dial tcp: connection refused` en la BD** — el contenedor no puede alcanzar Postgres. Si tu BD corre en el mismo host que Docker, usa `host.docker.internal` (Mac/Windows) o la IP LAN de tu máquina, no `localhost`. `localhost` dentro del contenedor significa el propio contenedor.

**`http: server gave HTTP response to HTTPS client`** para la URL de IPFS — el esquema es incorrecto: `http://` para un endpoint HTTPS o viceversa. Revisa la URL.

**Los logs muestran `RPC error` repetidamente** — la URL RPC es incorrecta, está limitada por tasa, o el chain ID no coincide. El `CONFIG_CONTRACT` por defecto es para Monad; si te conectas a otra cadena, establece `CONFIG_CONTRACT` en `.env` con la dirección correcta para esa cadena.

**El contenedor arranca pero no ocurre nada durante mucho tiempo** — eso es normal si usaste la Opción B en el paso 3 (esquema vacío). El backend está sincronizando el historial de la blockchain desde `INITIAL_BLOCK` hacia adelante, lo cual puede llevar horas en una cadena con mucho historial. Observa `docker compose logs -f`; verás subir los números de bloque. Si no quieres esperar, detén el contenedor, elimina la base de datos y restaura desde un snapshot público (Opción A).

Si te encuentras con algo no cubierto aquí, contáctate a través de los canales de soporte de SAVVA con la salida de `docker compose logs` y tu `.env` saneado (oculta la clave del procesador).

## Acerca del almacenamiento IPFS

Hay dos capas de pinning funcionando en una instalación SAVVA:

1. **El nodo Kubo incluido** (el servicio `ipfs:` en Compose) guarda cada archivo subido localmente. Es rápido, gratuito e inmediatamente accesible — pero es un único punto de fallo. Si ese disco falla, la copia local se pierde.
2. **Tu servicio de pin externo** (configurado mediante `PIN_SERVICE_*` en `.env`) toma también una copia. El backend pide al servicio de pin que fije cada nuevo CID justo después de añadirlo al nodo local, de modo que el contenido de tu comunidad se replica de forma durable y sigue siendo accesible a través de la gateway pública del servicio incluso cuando tu propio nodo esté offline.

La combinación de "local rápido + externo durable" es la razón de la existencia de ambas mitades. **No omitas el servicio de pin externo** a menos que estés levantando un nodo de prueba desechable — la pérdida de pines es irreversible.

El datastore IPFS incluido merece el mismo trato que cualquier otro directorio de estado en crecimiento. A diferencia de una base de datos Postgres (un esquema fijo que sólo crece cuando añades dominios), **el datastore de IPFS crece en proporción al contenido de tu comunidad.** El paquete envía `process-all-domains: true` en la configuración renderizada, por lo que tu nodo indexa y fija posts de **todos los dominios en la red**, no sólo del tuyo. Eso es deliberado — mantiene el contenido disponible incluso cuando operadores de dominios individuales están offline — pero también significa que el crecimiento del datastore rastrea toda la plataforma, no sólo tu comunidad. Planea para ello como lo harías con cualquier otra carga de almacenamiento de pines:

- **Coloca el datastore en el disco que estés dispuesto a crecer.** `IPFS_DATA_PATH=` en `.env` controla la ruta en el host. Por defecto es `./ipfs-data` junto al archivo Compose; en producción, apúntalo a un disco o volumen dedicado (`/mnt/data1/ipfs`, un volumen EBS adjunto, etc.).
- **Monitorea el uso de disco.** No hay una alarma automática si el disco se llena. Vigila `du -sh ipfs-data/` (o donde lo hayas apuntado) y una alerta genérica de uso de disco.
- **Hazle backup como cualquier otro directorio de estado.** Parar el servicio `ipfs` y rsync del directorio de datos es el camino más sencillo.
- **Abre el puerto 4001 (TCP y UDP).** Ese es el puerto swarm de IPFS. Si está bloqueado por firewall, el contenido sigue fijándose localmente pero no se replica a la red IPFS más amplia. La mayoría de proveedores cloud requieren que lo abras explícitamente en el security group / firewall de la VPC.
- **Kubo por defecto no tiene límite MaxStorage.** Si quieres un techo duro con GC automático, edita `ipfs-data/config` después del primer arranque y establece `Datastore.StorageMax` a un tamaño como `"100GB"`.

Si ya operas un nodo IPFS y prefieres usar ese, configura `IPFS_URL=` en `.env` para apuntar a él y elimina el bloque `ipfs:` de `docker-compose.yml`. Al backend no le importa.

## Qué no está intencionadamente en la imagen

La imagen ejecuta solo el backend. La pila Compose añade el servicio IPFS, pero **PostgreSQL**, **TLS** y **el cliente web** siguen siendo tu responsabilidad:

- **PostgreSQL** — los operadores tienen opiniones fuertes sobre backups, réplicas y gestionado vs autoalojado. Incluirlo dificultaría todo eso.
- **TLS** — la elección del reverse proxy es tuya.
- **El cliente web** — distribuido vía IPFS y fijado por el administrador, no incorporado en la imagen del backend.

Una instalación "todo en una caja" que incluya también Postgres, Caddy y la UI podría publicarse más adelante como un archivo Compose separado para uso casual/hobby. El paquete actual está dirigido a personas que ejecutarán algo que pretenden mantener.