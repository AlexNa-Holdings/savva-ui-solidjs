# Vodič za instalaciju - Pregled

Ovaj vodič će vas provesti kroz podešavanje sopstvene SAVVA mreže od nule. Prateći ove instrukcije, moći ćete da pokrenete potpunu SAVVA instancu sa backend serverom i frontend korisničkim interfejsom.

## Šta ćete postaviti

Potpuna SAVVA mreža se sastoji od:

1. **Backend Server** - API server zasnovan na Go-u koji obrađuje:
   - Autentifikaciju korisnika i sesije
   - Skladištenje i dohvat objava
   - Integraciju sa IPFS-om
   - Upravljanje bazom podataka
   - WebSocket veze
   - Interakciju sa blockchain-om

2. **UI Website** - Frontend baziran na SolidJS koji obezbeđuje:
   - Korisnički interfejs za kreiranje i pregled sadržaja
   - Integraciju Web3 novčanika
   - Otpremanje fajlova na IPFS
   - Interakcije sa smart kontraktima
   - Višejezičnu podršku

3. Smart kontrakti:
   - SAVVA Token kontrakt
   - Staking kontrakt
   - Governance kontrakt
   - Content NFT kontrakt
   - I ostali...

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
5. Testing & Verification
```

## Pregled zahteva

- **Server**: Linux server (preporučeno Ubuntu 20.04+)
- **Baza podataka**: PostgreSQL 14+ (ili upravljana baza podataka)
- **IPFS**: Lokalni IPFS čvor + eksterni pinning servis sa javnim gateway-om
- **Web server**: Nginx ili Apache
- **Domen**: Naziv domena sa SSL sertifikatom
- **Blockchain**: RPC pristup Ethereum-kompatibilnoj mreži (preporučeno WSS)

## Poštovanje licence

**Važno**: Prilikom postavljanja SAVVA, morate se pridržavati GPL-3.0 licence sa SAVVA dodatnim uslovima:

- Morate koristiti oficijalne SAVVA blockchain kontrakte
- **Ne smete** kreirati alternativne tokene
- **Ne smete** menjati ili zamenjivati oficijalne SAVVA kontrakte
- **Možete** uvesti dodatne kontrakte u sistem

Pogledajte [UI licencu](../licenses/ui.md) i [Backend licencu](../licenses/backend.md) za detalje.

## Podrška

Ako naiđete na probleme:
- Proverite [Uputstva za rešavanje problema](troubleshooting.md)
- Pregledajte backend i UI repozitorijume
- Pridružite se SAVVA zajednici na https://savva.app