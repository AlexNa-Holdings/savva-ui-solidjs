# Zahtevi

Pre nego što instalirate SAVVA, proverite da vaše okruženje ispunjava sledeće zahteve.

## Zahtevi servera

### Hardver

- **CPU**: Preporučeno 2+ jezgra
- **RAM**: Minimum 4GB, preporučeno 8GB
- **Skladište**: 50GB+ SSD (povećava se sa sadržajem)
- **Mreža**: Stabilna internet konekcija sa javnom IP adresom

### Operativni sistem

- **Linux**: Ubuntu 20.04 LTS ili noviji (preporučeno)
- **Alternativa**: Debian 10+, CentOS 8+, ili bilo koja moderna Linux distribucija
- **macOS/Windows**: Moguće za razvoj, nije preporučeno za produkciju

## Zahtevi softvera

### 1. PostgreSQL baza podataka

**Zahtevana verzija**: PostgreSQL 14 ili noviji

Imate dve opcije:

**Opcija A: Upravljana usluga baze podataka** (Preporučeno za produkciju)

Preporučujemo **DigitalOcean Managed Databases** za produkcijske instalacije:

- **Prednosti**:
  - Automatske rezervne kopije i obnova do određene tačke u vremenu
  - Automatska ažuriranja i sigurnosne zakrpe
  - Visoka dostupnost i failover
  - Nadzor i obaveštenja
  - Nema administrativnog opterećenja baze podataka

- **Podešavanje**:
  1. Napravite DigitalOcean nalog na https://digitalocean.com
  2. Idite na Databases → Create Database
  3. Izaberite PostgreSQL 14 ili noviji
  4. Izaberite plan (počinje od $15/month)
  5. Izaberite region data centra (bliže vašem serveru)
  6. Zabeležite podatke za konekciju (host, port, username, password, database name)

**Opcija B: Samostalno hostovanje** (Za razvoj ili prilagođena okruženja)

Instalirajte PostgreSQL na svom serveru:

```bash
# Required version check
psql --version  # Should output: psql (PostgreSQL) 14.x or higher
```

Instalacija na Ubuntu:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. IPFS skladištenje

SAVVA zahteva i lokalni IPFS čvor i eksternu pinning uslugu za pouzdano skladištenje sadržaja.

**A. Lokalni IPFS čvor** (Obavezno)

Instalirajte i pokrenite lokalni IPFS čvor za rukovanje sadržajem:

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

Za produkciju, podesite IPFS kao systemd servis:
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

**B. Eksterna pinning usluga** (Obavezno)

Da biste obezbedili trajnost i dostupnost sadržaja, morate se pretplatiti na najmanje jednu IPFS pinning uslugu:

**Preporučene usluge:**

1. **Pinata** (https://pinata.cloud)
   - Besplatni sloj: 1GB skladišta
   - Dostupni plaćeni planovi
   - Jednostavna API integracija
   - **Javni gateway**: `https://gateway.pinata.cloud/ipfs/`

2. **Web3.Storage** (https://web3.storage)
   - Besplatni sloj dostupan
   - Izgrađeno na Filecoin-u
   - Jednostavan API
   - **Javni gateway**: `https://w3s.link/ipfs/`

3. **Filebase** (https://filebase.com)
   - S3-kompatibilan API
   - IPFS pinning uključen
   - Geo-redundantno skladište
   - **Javni gateway**: `https://ipfs.filebase.io/ipfs/`

4. **NFT.Storage** (https://nft.storage)
   - Besplatno za NFT sadržaje
   - Ograničeno na NFT upotrebe
   - **Javni gateway**: `https://nftstorage.link/ipfs/`

Važno: Izaberite uslugu koja obezbeđuje javni IPFS gateway URL. Ovaj gateway omogućava korisnicima pristup sadržaju čak i ako nemaju instaliran IPFS.

**Koraci podešavanja:**

1. Napravite nalog kod odabrane pinning usluge
2. Generišite API ključ
3. Zabeležite javni gateway URL
4. Konfigurišite backend sa:
   - API akreditivima pinning usluge
   - Javnim gateway URL-om za preuzimanje sadržaja
5. Testirajte konekciju pre puštanja u produkciju

Zašto su oba potrebna:

- **Lokalni IPFS čvor**: Brzo otpremanje/preuzimanje sadržaja, lokalni keš, učešće u mreži
- **Pinning usluga**: Garantuje trajnost sadržaja, redundanciju i visoku dostupnost čak i kada je vaš server offline

### 3. Web server (produkcija)

Za produkcijsko okruženje:

**Nginx** (Preporučeno):
```bash
sudo apt install nginx
```

**Apache** (Alternativa):
```bash
sudo apt install apache2
```

### 4. SSL sertifikat

Za HTTPS (obavezno u produkciji):

**Korišćenje Let's Encrypt** (Besplatno):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Zahtevi za blockchain

### Web3 provajder

Potrebno je da imate pristup blockchain mreži kompatibilnoj sa Ethereum-om. SAVVA podržava i HTTP(S) i WebSocket (WSS) konekcije.

Tipovi konekcije:

- **HTTPS RPC**: `https://rpc.example.com` - Standardna HTTP konekcija
- **WSS RPC**: `wss://rpc.example.com` - **Preporučeno** za brže procesiranje događaja i real-time ažuriranja

Preporučeno: Koristite WSS za produkciju da omogućite:
- Praćenje događaja na blockchain-u u realnom vremenu
- Brže potvrde transakcija
- Manju latenciju za interakcije korisnika

**Opcija A: Provajderi čvorova kao usluga** (Preporučeno)

Preporučujemo korišćenje **AllNodes** ili sličnih upravljanih provajdera čvorova:

1. **AllNodes** (https://www.allnodes.com)
   - Podržava PulseChain, Ethereum i druge EVM lance
   - I HTTPS i WSS endpoint-ovi
   - Visoka dostupnost i redundancija
   - Planovi počinju od ~20$/mesečno

2. **Alternative**:
   - **Infura** (https://infura.io) - Ethereum, Polygon, Arbitrum
   - **Alchemy** (https://alchemy.com) - Više lanaca
   - **QuickNode** (https://quicknode.com) - Široka podrška lanaca
   - **GetBlock** (https://getblock.io) - Više protokola

Koraci podešavanja:
1. Napravite nalog kod odabranog provajdera
2. Kreirajte novi node/endpoint za vaš lanac (npr. PulseChain)
3. Nabavite i HTTPS i WSS URL-ove endpoint-a
4. Konfigurišite backend da koristi WSS endpoint za optimalne performanse

**Opcija B: Samostalno hostovan čvor**

Pokrenite sopstveni blockchain čvor za maksimalnu kontrolu:

- **Prednosti**: Potpuna kontrola, bez zavisnosti od treće strane, bez limita zahteva
- **Nedostaci**: Zahteva značajne resurse, stalno održavanje
- **Skladište**: 500GB+ SSD (povećava se vremenom)
- **Vreme sinhronizacije**: Nekoliko sati do nekoliko dana u zavisnosti od lanca

Za PulseChain:
```bash
# Example: Running a PulseChain node with go-pulse
# See official PulseChain documentation for detailed setup
```

Zahtevi mreže:
- RPC endpoint URL (HTTPS ili WSS)
- **Preporučeno**: WSS endpoint za brže procesiranje događaja
- Privatni ključ za deploy ugovora (ako se deploy-uju novi ugovori)
- Nativni tokeni za gas naknade (PLS za PulseChain, ETH za Ethereum, itd.)

Napomena: Svi neophodni SAVVA pametni ugovori su već deploy-ovani na PulseChain. Pogledajte [Zvanične adrese ugovora](../licenses/official-contracts.md) za kompletan spisak.

## Mrežna konfiguracija

### Firewall portovi

Otvorite sledeće portove:

- **80**: HTTP (preusmerava na HTTPS)
- **443**: HTTPS (UI)
- **8080**: Backend API (može biti samo interno)
- **4001**: IPFS Swarm (ako pokrećete lokalni IPFS)
- **5001**: IPFS API (samo localhost)
- **8545**: Ethereum RPC (ako pokrećete lokalni čvor)

Primer koristeći `ufw`:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8080/tcp  # Or keep internal
sudo ufw enable
```

### DNS konfiguracija

Uputite svoj domen na server:
- **A Record**: `yourdomain.com` → IP adresa servera
- **A Record**: `www.yourdomain.com` → IP adresa servera (opciono)

Napomena: Backend API se servisira sa istog domena na putanji `/api` (npr. `https://yourdomain.com/api`), tako da nije potreban poseban poddomen.

## Lista provere

Pre nego što nastavite, proverite sve zahteve:

- Server sa odgovarajućim resursima (2+ CPU jezgra, 4GB+ RAM, 50GB+ SSD)
- PostgreSQL 14+ instaliran i pokrenut (ili upravljana baza konfigurisana)
- IPFS čvor pokrenut kao systemd servis
- IPFS pinning usluga konfigurisana sa javnim gateway-om
- Nginx ili Apache web server instaliran
- Ime domena sa konfigurisanim DNS-om
- SSL sertifikat dobijen
- Pristup blockchain RPC-ju konfigurisano (po mogućstvu WSS)
- Firewall portovi otvoreni