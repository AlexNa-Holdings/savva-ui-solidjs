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
   - Unesite korisničko ime za vašeg bota (mora se završiti sa `bot`, npr. `savva_network_bot`)

3. **Sačuvajte token bota**:
   - BotFather će obezbediti API token kao: `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Čuvajte ovaj token bezbednim — svako ko ima ovaj token može kontrolisati vašeg bota

4. **Konfigurišite podešavanja bota** (opciono ali preporučeno):
   - Pošaljite `/setdescription` - dodajte opis vaše SAVVA instance
   - Pošaljite `/setabouttext` - dodajte informacije prikazane u profilu bota
   - Pošaljite `/setuserpic` - otpremite logo vaše mreže kao avatar bota

### Konfiguracija backend-a

Dodajte podešavanja Telegram bota u vaš `/etc/savva.yml`:

```yaml
# Telegram Bot Configuration
telegram:
  bot-token: "7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Registracija webhook-a

Nakon konfiguracije backend-a, potrebno je registrovati webhook URL kod Telegrama. Ovo govori Telegramu gde da šalje ažuriranja kada korisnici komuniciraju sa vašim botom:

```bash
curl -F "url=https://yourdomain/api/telegram-bot/yourdomain" \
  https://api.telegram.org/bot7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/setWebhook
```

Zamenite:
- `yourdomain` vašim stvarnim domenom (pojavljuje se dva puta u URL-u)
- `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` vašim tokenom bota

**Očekivani odgovor:**
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Proverite status webhook-a:**
```bash
curl https://api.telegram.org/bot<your_bot_token>/getWebhookInfo
```

### Kako to radi

Kada je podešeno, korisnici mogu:
- Povezati svoj Telegram nalog sa svojim SAVVA profilom
- Primati obaveštenja o novim pratiocima, komentarima i pominjanjima
- Koristiti Telegram kao dodatni metod autentifikacije

### Napomene o bezbednosti

- Nikada ne delite javno token vašeg bota
- Token bota u `savva.yml` treba imati ograničene dozvole fajla (`chmod 600`)
- Razmislite o korišćenju promenljivih okruženja za token u produkciji:
  ```yaml
  telegram:
    bot-token: ${TELEGRAM_BOT_TOKEN}
  ```