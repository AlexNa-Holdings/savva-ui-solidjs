# Installation Guide - Overview

Ovaj vodič će vas provesti kroz postavljanje sopstvene SAVVA mreže od nule. Prateći ove instrukcije, bićete u mogućnosti da pokrenete kompletnu SAVVA instancu sa backend serverom i frontend UI.

## Šta ćete postaviti

Kompletna SAVVA mreža se sastoji od:

1. **Backend server** - API server napisan u Go koji obavlja:
   - Autentifikaciju korisnika i sesije
   - Skladištenje i preuzimanje postova
   - Integraciju sa IPFS-om
   - Upravljanje bazom podataka
   - WebSocket veze
   - Interakciju sa blokčejnom

2. **UI veb-sajt** - Frontend zasnovan na SolidJS koji obezbeđuje:
   - Korisnički interfejs za kreiranje i pregled sadržaja
   - Integraciju Web3 novčanika
   - Upload fajlova na IPFS
   - Interakcije sa pametnim ugovorima
   - Podršku za više jezika

3. **Pametni ugovori** (opciono) - Ako pokrećete novu mrežu:
   - SAVVA token ugovor
   - Staking ugovor
   - Ugovor za upravljanje (governance)
   - Ugovor za Content NFT
   - I drugi...

## Tok instalacije

```
1. Prerequisites Setup
   ↓
2. Backend Server Installation
   ↓
3. UI Website Setup
   ↓
4. Configuration
   ↓
5. Deployment
   ↓
6. Testing & Verification
```

## Pregled zahteva

- **Server**: Linux server (preporučeno Ubuntu 20.04+)
- **Baza podataka**: PostgreSQL 14+ (ili upravljana usluga baze podataka)
- **IPFS**: Lokalni IPFS čvor + eksterni pinning servis sa javnim gateway-jem
- **Web server**: Nginx ili Apache
- **Domen**: Ime domena sa SSL sertifikatom
- **Blokčejn**: RPC pristup Ethereum-kompatibilnoj mreži (preporučen WSS)

## Usklađenost sa licencom

**Važno**: Prilikom deploy-ovanja SAVVA, morate se pridržavati GPL-3.0 licence sa SAVVA dodatnim uslovima:

- Vi **morate** koristiti zvanične SAVVA blokčejn ugovore
- Vi **ne smete** kreirati alternativne tokene
- Vi **ne smete** menjati ili zamenjivati zvanične SAVVA ugovore
- Vi **možete** uvesti dodatne ugovore u sistem

Pogledajte [UI licenca](../licenses/ui.md) i [Backend licenca](../licenses/backend.md) za detalje.

## Podrška

Ako naiđete na probleme:
- Proverite [Troubleshooting](troubleshooting.md)
- Pregledajte backend i UI repozitorijume
- Pridružite se SAVVA zajednici na https://savva.app