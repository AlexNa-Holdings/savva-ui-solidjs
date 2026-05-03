# Vodič za instalaciju - Pregled

Ovaj vodič će vas provesti kroz podešavanje sopstvene SAVVA mreže od nule. Prateći ove instrukcije, moći ćete da pokrenete kompletnu SAVVA instancu sa backend serverom i frontend korisničkim interfejsom.

## Šta ćete postaviti

Kompletna SAVVA mreža se sastoji od:

1. **Backend Server** - API server napisan u Go-u koji se bavi:
   - Autentifikacijom korisnika i sesijama
   - Čuvanjem i dohvatom objava
   - Integracijom sa IPFS-om
   - Upravljaњем bazom podataka
   - WebSocket konekcijama
   - Interakcijom sa blockchain-om

2. **UI Website** - Frontend zasnovan na SolidJS koji obezbeđuje:
   - Korisnički interfejs za kreiranje i pregled sadržaja
   - Integraciju Web3 novčanika
   - Otpremanje fajlova na IPFS
   - Interakcije sa pametnim ugovorima
   - Podršku za više jezika
   - SEO sloj: serverom renderovani HTML za pretraživače (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple), AI crawlere (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, ...), i alate za prikazivanje linkova (Telegram, X, Facebook, Discord, Slack, WhatsApp, ...), sa per-domen `robots.txt` i sitemap fajlovima

3. **Pametni ugovori** :
   - SAVVA Token ugovor
   - Staking ugovor
   - Governance ugovor
   - Content NFT ugovor
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
5. Testing & Verification
```

## Pregled zahteva

- **Server**: Linux server (preporučuje se Ubuntu 20.04+)
- **Baza podataka**: PostgreSQL 14+ (ili upravljana baza podataka)
- **IPFS**: Lokalni IPFS čvor + eksterni pinning servis sa javnim gateway-jem
- **Web Server**: Nginx ili Apache
- **Domen**: Naziv domena sa SSL sertifikatom
- **Blockchain**: RPC pristup mreži kompatibilnoj sa Ethereum-om (preporučeno WSS)

## Usklađenost sa licencom

**Važno**: Prilikom postavljanja SAVVA, morate poštovati licencu GPL-3.0 sa SAVVA dodatnim uslovima:

- Vi **morate** koristiti zvanične SAVVA blockchain ugovore
- Vi **ne smete** praviti alternativne tokene
- Vi **ne smete** menjati ili zamenjivati zvanične SAVVA ugovore
- Vi **možete** uvesti dodatne ugovore u sistem

Pogledajte [UI License](../licenses/ui.md) i [Backend License](../licenses/backend.md) za detalje.

## Podrška

Ako naiđete na probleme:
- Proverite [Troubleshooting](troubleshooting.md)
- Pregledajte repozitorijume backend-a i UI-a
- Pridružite se SAVVA zajednici na https://savva.app