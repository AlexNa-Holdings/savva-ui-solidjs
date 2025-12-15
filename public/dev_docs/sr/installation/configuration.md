# Konfiguracija

Napredne opcije konfiguracije za vašu SAVVA instalaciju.

## Pregled

Ovaj dokument pokriva naprednu konfiguraciju izvan osnovnog podešavanja.

## Podešavanje Telegram bota

SAVVA podržava integraciju Telegram bota za autentifikaciju korisnika i obaveštenja. Svaki domen može imati sopstvenog Telegram bota.

### Kreiranje Telegram bota

1. **Otvorite Telegram** i potražite `@BotFather`

2. **Kreirajte novog bota**:
   - Pošaljite `/newbot` BotFather-u
   - Unesite prikazano ime za vašeg bota (npr. "SAVVA Network")
   - Unesite korisničko ime za vašeg bota (mora završavati sa `bot`, npr. `savva_network_bot`)

3. **Sačuvajte bot token**:
   - BotFather će obezbediti API token kao: `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Čuvajte ovaj token sigurnim — svako ko ima ovaj token može kontrolisati vašeg bota

4. **Konfigurišite podešavanja bota** (opciono, ali preporučeno):
   - Pošaljite `/setdescription` — dodajte opis vaše SAVVA instance
   - Pošaljite `/setabouttext` — dodajte informacije prikazane u profilu bota
   - Pošaljite `/setuserpic` — otpremite logo vaše mreže kao avatar bota

### Konfiguracija backend-a

Dodajte podešavanja Telegram bota u vaš `/etc/savva.yml`:

```yaml
# Telegram Bot Configuration
telegram:
  bot-token: "7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Registracija webhook-a

Nakon konfiguracije backend-a, potrebno je registrovati webhook URL kod Telegram-a. Time se Telegram-u govori gde da šalje ažuriranja kada korisnici komuniciraju sa vašim botom:

```bash
curl -F "url=https://yourdomain/api/telegram-bot/yourdomain" \
  https://api.telegram.org/bot7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/setWebhook
```

Zamenite:
- `yourdomain` sa vašim stvarnim domenom (javlja se dva puta u URL-u)
- `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` sa tokenom vašeg bota

**Očekivani odgovor:**
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Proverite status webhook-a:**
```bash
curl https://api.telegram.org/bot<your_bot_token>/getWebhookInfo
```

### Kako to radi

Kada je konfigurisan, korisnici mogu:
- Povezati svoj Telegram nalog sa svojim SAVVA profilom
- Primati obaveštenja o novim pratiocima, komentarima i pominjanjima
- Koristiti Telegram kao dodatni metod autentifikacije

### Bezbednosne napomene

- Nikada ne delite javno token bota
- Token bota u `savva.yml` treba imati ograničene dozvole fajla (`chmod 600`)
- Razmotrite korišćenje promenljivih okruženja za token u produkciji:
  ```yaml
  telegram:
    bot-token: ${TELEGRAM_BOT_TOKEN}
  ```

## Konfiguracija backend-a

### Podešavanje baze podataka

**Uskoro**: Optimizacija PostgreSQL-a za instance sa velikim saobraćajem

### Konfiguracija IPFS-a

**Uskoro**: Strategije pinovanja IPFS-a i optimizacija gateway-a

### Keširanje

**Uskoro**: Integracija Redis-a za keširanje sesija

### Ograničavanje zahteva

**Uskoro**: Konfiguracija ograničenja API zahteva

## Konfiguracija UI-a

### Brendiranje

**Uskoro**: Kako prilagoditi boje, logo i brending

### Feature flagovi

**Uskoro**: Omogućavanje/onemogućavanje specifičnih funkcija

### Analitika

**Uskoro**: Integracija alata za analitiku

## Konfiguracija blockchain-a

### Prilagođene mreže

**Uskoro**: Povezivanje sa prilagođenim EVM mrežama

### Konfiguracija ugovora

**Uskoro**: Napredna podešavanja za interakciju sa ugovorima

## Optimizacija performansi

### Podešavanje CDN-a

**Uskoro**: Optimizacija isporuke resursa

### Indeksi baze podataka

**Uskoro**: Upiti za optimizaciju baze podataka

### Strategije keširanja

**Uskoro**: Keširanje na backend-u i frontend-u

## Konfiguracija bezbednosti

### SSL/TLS

**Uskoro**: Napredna HTTPS konfiguracija

### Bezbednost API-ja

**Uskoro**: Konfiguracija JWT-a i najbolje prakse bezbednosti

### CORS podešavanja

**Uskoro**: Fino podešavanje CORS politika

## Monitoring i logovanje

### Upravljanje logovima

**Uskoro**: Podesavanje centralizovanog logovanja

### Monitoring performansi

**Uskoro**: Integracija APM-a

### Praćenje grešaka

**Uskoro**: Integracija Sentry-ja ili sličnog

---

*Ovo poglavlje je u izradi. Vratite se kasnije za ažuriranja.*