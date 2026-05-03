# Otklanjanje problema

Česti problemi i njihova rešenja.

## Problemi sa backend-om

### Backend neće da se pokrene

**Simptom**: Servis ne uspeva da se pokrene

**Rešenja**:
```bash
# Check logs
sudo journalctl -u savva-backend -n 100

# Common causes:
# 1. Database connection failed
sudo systemctl status postgresql
psql -h localhost -U savva_user -d savva

# 2. Port already in use
sudo lsof -i :8080

# 3. Config file error
./savva-backend --validate-config
```

### Greške pri konekciji ka bazi

**Simptom**: `connection refused` ili `authentication failed`

**Rešenja**:
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -h localhost -U savva_user -d savva

# Check pg_hba.conf
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Ensure: local all savva_user md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Problemi sa konekcijom ka IPFS-u

**Simptom**: Ne može da se otpremi/preuzme sa IPFS-a

**Rešenja**:
```bash
# Check IPFS daemon
ipfs swarm peers

# Restart IPFS
killall ipfs
ipfs daemon &

# Check API accessibility
curl http://localhost:5001/api/v0/version
```

### Velika upotreba memorije

**Simptom**: Backend troši previše memorije

**Rešenja**:
- Pregledajte podešavanja connection pool-a
- Proverite logove na tragove curenja memorije
- Periodično restartujte servis
- Razmislite o povećanju RAM-a servera

## Problemi sa UI-jem

### Prazna stranica / beli ekran

**Simptom**: Stranica se učita ali ne prikazuje ništa

**Rešenja**:
```bash
# 1. Check browser console for errors
# Press F12 → Console tab

# 2. Verify SPA routing in Nginx
sudo nano /etc/nginx/sites-available/savva-ui
# Ensure: try_files $uri $uri/ /index.html;

# 3. Check file permissions
ls -la /var/www/savva-ui
sudo chown -R www-data:www-data /var/www/savva-ui

# 4. Rebuild and redeploy
npm run build
sudo cp -r dist/* /var/www/savva-ui/
```

### Konekcija ka API-ju nije uspela

**Simptom**: UI ne može da se poveže na backend

**Rešenja**:
```bash
# 1. Check VITE_BACKEND_URL in build
cat dist/assets/index-*.js | grep -o 'https://api[^"]*'

# 2. Test backend health
curl https://api.yourdomain.com/api/info

# 3. Check CORS settings in backend
# Ensure UI domain is in allowed_origins

# 4. Verify Nginx proxy
curl -I https://api.yourdomain.com
```

### Web3 novčanik se ne povezuje

**Simptom**: Ne može da se poveže MetaMask ili drugi novčanici

**Rešenja**:
- **Obavezno HTTPS**: Web3 zahteva sigurnu vezu
- **Proverite ekstenziju novčanika**: Da li je instalirana i otključana?
- **Neusklađenost mreže**: Novčanik na pogrešnom lancu?
- **Proverite CSP zaglavlja**: Mogu blokirati injektovanje novčanika

```bash
# Check Content-Security-Policy header
curl -I https://yourdomain.com | grep -i content-security
```

### Greške pri izgradnji (build)

**Simptom**: `npm run build` ne uspeva

**Rešenja**:
```bash
# 1. Clear cache
rm -rf node_modules package-lock.json dist
npm install

# 2. Check Node.js version
node --version  # Must be v18+
nvm use 18

# 3. Check for syntax errors
npm run build 2>&1 | tee build.log

# 4. Try with more memory
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

## Mrežni problemi

### Greške sa SSL sertifikatom

**Simptom**: HTTPS ne radi ili su upozorenja o sertifikatu

**Rešenja**:
```bash
# Renew Let's Encrypt certificate
sudo certbot renew

# Force renewal
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates

# Test SSL configuration
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com
```

### Problemi sa DNS rezolucijom

**Simptom**: Domen se ne razrešava

**Rešenja**:
```bash
# Check DNS propagation
dig yourdomain.com
nslookup yourdomain.com

# Verify A record
dig A yourdomain.com +short

# Check from multiple locations
# Use: https://dnschecker.org
```

### Firewall blokira konekcije

**Simptom**: Ne može da se pristupi servisima sa udaljenih lokacija

**Rešenja**:
```bash
# Check UFW status
sudo ufw status

# Allow required ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check iptables
sudo iptables -L -n

# Verify port is listening
sudo netstat -tlnp | grep :443
```

## SEO / problemi sa otkrivanjem

### `/robots.txt` vraća 404 (ili nginx podrazumevani)

**Simptom**: `curl -s https://yourdomain.com/robots.txt` vraća nginx-ovu podrazumevanu 404 stranicu ili stub umesto stvarnog sadržaja `User-agent: ...`.

**Rešenja**:
```bash
# 1. Confirm the SEO discovery rewrites are in your server block,
#    ABOVE the `location /` block:
#       location = /robots.txt   { rewrite ^ /api/robots.txt?domain=$default_domain last; }
#       location = /sitemap.xml  { rewrite ^ /api/sitemap.xml?domain=$default_domain last; }
#       location ~ ^/sitemap-.*\.xml$ { rewrite ^(/sitemap-[^?]+) /api$1?domain=$default_domain last; }
sudo nano /etc/nginx/sites-available/yourdomain.com

# 2. Confirm the backend serves the endpoint directly.
curl -s http://localhost:7000/api/robots.txt?domain=yourdomain.com | head
# Empty/404 here means the backend is too old - upgrade savva-backend
# to a version that ships /api/robots.txt and /api/sitemap*.xml.

# 3. Confirm $default_domain matches a key under `domains:` in /etc/savva.yml.
grep -A1 "^domains:" /etc/savva.yml
grep "set \$default_domain" /etc/nginx/sites-available/yourdomain.com
```

### Putanja za bot vraća SPA shell umesto renderovanog HTML-a

**Simptom**: `curl -sA "Googlebot" https://yourdomain.com/` vraća mali `index.html` SPA bundle umesto renderovane stranice sa `<title>`, `og:*` i sadržajem posta.

**Rešenja**:
```bash
# 1. Make sure the bot detection regex in `location /` matches the modern
#    list (googlebot|bingbot|...|gptbot|claudebot|perplexitybot|...).
#    The 2018-era regex misses every AI crawler.

# 2. Make sure the rewrite uses the new form WITH `last`:
#       rewrite (.*) /api/render$1?domain=$default_domain&prerender&$args last;
#    NOT the older form with $scheme://$host$uri or `break`. The backend
#    no longer accepts the old shape, and `break` skips the /api proxy.

# 3. Confirm the backend renders directly.
curl -s "http://localhost:7000/api/render/?domain=yourdomain.com&prerender" | head
```

### Putanja za ljude vraća renderovan HTML umesto SPA-e

**Simptom**: Normalni pregledač pogađa bot putanju i vidi prerenderovan HTML umesto SolidJS aplikacije.

**Rešenja**:
- Regex za botove je previše gulest (npr. poklapa se sa `mozilla` kao podnizom). `~*` regex mora koristiti ograničene nazive dobavljača — kopirajte regex iz `nginx.conf.example` bez izmena.
- Nedostaje zaobilaženje statičkih fajlova. Potvrdite da je prisutno `if ($uri ~ \.[a-zA-Z0-9]+$) { set $prerender 0; }` tako da se JS bundle-i, slike i fontovi ne prerenderuju.

### Pregled linka prikazuje pogrešan naslov / sliku / nema pregleda

**Simptom**: Lepljenje SAVVA URL-a u Telegram, X, Discord ili Slack prikazuje zastareli naslov, pogrešnog autora, nema thumbnail ili slika je nepravilno isečena.

**Rešenja**:
- Potvrdite da je UA unfurlera u bot regexu (npr. `telegrambot|twitterbot|facebookexternalhit|discordbot|slackbot|whatsapp`).
- Izmene poništavaju keš po URL-u server-side, ali treće strane keširaju agresivno. Primorajte osvežavanje:
  - **Facebook / WhatsApp / Instagram**: nalepite URL u <https://developers.facebook.com/tools/debug/> i kliknite "Scrape Again".
  - **X / Twitter**: <https://cards-dev.twitter.com/validator>.
  - **Telegram / Discord**: obično se očisti u roku od nekoliko minuta; dodavanje bezopasnog query stringa (npr. `?v=2`) zaobilazi keš za jednokratni test.

### Sitemap nema stranice

**Simptom**: `/sitemap.xml` postoji ali ne navodi post, profil, NPO ili tag stranicu koju očekujete.

**Rešenja**:
- Sitemap-ovi se regenerišu ciklički; vrlo nedavni postovi možda još nisu u poslednjem snimku. Sačekajte jedan ciklus i proverite ponovo.
- Potvrdite da je post javan — draftovi i privatni sadržaji su namerno izuzeti.
- Potvrdite da vaš domen kao ključ u `/etc/savva.yml` zaista poseduje sadržaj. Sitemap-ovi su po domenu.

## Problemi sa performansama

### Sporo učitavanje stranice

**Simptom**: UI se dugo učitava

**Rešenja**:
- Omogućite Gzip kompresiju u Nginx-u
- Postavite CDN (Cloudflare, itd.)
- Proverite vreme odgovora backenda
- Optimizujte upite baze podataka
- Omogućite keširanje u pregledaču

### Visoka upotreba CPU-a

**Simptom**: CPU servera na 100%

**Rešenja**:
```bash
# Identify process
top
htop

# Check backend logs for errors
sudo journalctl -u savva-backend -n 100

# Review database queries
# Check PostgreSQL slow query log

# Consider scaling horizontally
```

### Performanse baze podataka

**Simptom**: Spori upiti

**Rešenja**:
```sql
-- Check slow queries
SELECT pid, query, state, query_start
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- Analyze tables
ANALYZE;

-- Reindex if needed
REINDEX DATABASE savva;
```

## Uobičajene poruke o grešci

### "connection refused"
- Servis nije pokrenut
- Firewall blokira port
- Pogrešan host/port u konfiguraciji

### "authentication failed"
- Pogrešna lozinka u konfiguraciji
- Korisnik nema dozvole
- Proverite grant-ove u bazi

### "CORS policy" greške
- Backend CORS nije konfigurisan
- Pogrešan origin u allowed_origins
- Preflight zahtev ne prolazi

### "network error" u UI-ju
- Backend nije dostupan
- Pogrešan API URL u UI konfiguraciji
- Problemi sa SSL sertifikatom

## Traženje pomoći

Ako se problemi nastave:

1. **Proverite logove**:
   ```bash
   # Backend logs
   sudo journalctl -u savva-backend -n 100 -f

   # Nginx logs
   sudo tail -f /var/log/nginx/error.log

   # Browser console
   # Press F12 → Console
   ```

2. **Prikupite informacije**:
   - Poruke o grešci
   - Specifikacije servera
   - Brojevi verzija
   - Konfiguracija (sanitizovana)

3. **Podrška zajednice**:
   - GitHub Issues
   - SAVVA community forums
   - Dokumentacija za developere

4. **Proverite ažuriranja**:
   ```bash
   # Backend
   cd savva-backend
   git fetch
   git log --oneline HEAD..origin/main

   # UI
   cd savva-ui-solidjs
   git fetch
   git log --oneline HEAD..origin/main
   ```

---

*Ovaj vodič za otklanjanje problema biće proširen kako se budu beležili novi problemi.*