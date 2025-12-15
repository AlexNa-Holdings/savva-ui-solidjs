# Otklanjanje problema

Uobičajeni problemi i njihova rešenja.

## Problemi sa backend-om

### Backend se ne pokreće

**Simptom**: Servis ne može da se pokrene

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

### Greške pri povezivanju sa bazom

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

### Problemi sa povezivanjem na IPFS

**Simptom**: Ne može da se upload-uje/učita sa IPFS-a

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

### Visoka potrošnja memorije

**Simptom**: Backend troši previše memorije

**Rešenja**:
- Proverite podešavanja connection pool-a
- Tražite curenja memorije u logovima
- Periodično restartujte servis
- Razmotrite povećanje RAM-a na serveru

## Problemi sa UI

### Prazna stranica / beli ekran

**Simptom**: Stranica se učitava ali ne prikazuje ništa

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

### Konekcija sa API-jem nije uspela

**Simptom**: UI se ne može povezati sa backend-om

**Rešenja**:
```bash
# 1. Check VITE_BACKEND_URL in build
cat dist/assets/index-*.js | grep -o 'https://api[^"]*'

# 2. Test backend health
curl https://api.yourdomain.com/health

# 3. Check CORS settings in backend
# Ensure UI domain is in allowed_origins

# 4. Verify Nginx proxy
curl -I https://api.yourdomain.com
```

### Web3 novčanik se ne povezuje

**Simptom**: Ne može da se poveže MetaMask ili drugi novčanici

**Rešenja**:
- **Obezbedite HTTPS**: Web3 zahteva sigurnu konekciju
- **Proverite ekstenziju novčanika**: Da li je instalirana i otključana?
- **Neusklađenost mreže**: Novčanik na pogrešnom lancu?
- **Proverite CSP zaglavlja**: Mogu blokirati injektovanje novčanika

```bash
# Check Content-Security-Policy header
curl -I https://yourdomain.com | grep -i content-security
```

### Greške pri build-u

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

### Vatrozid blokira konekcije

**Simptom**: Ne može da se pristupi servisima iz daljine

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

## Problemi sa performansama

### Sporo učitavanje stranice

**Simptom**: UI se dugo učitava

**Rešenja**:
- Omogućite Gzip kompresiju u Nginx-u
- Postavite CDN (Cloudflare, itd.)
- Proverite vreme odgovora backenda
- Optimizujte upite ka bazi podataka
- Omogućite keširanje u pregledaču

### Visoko opterećenje CPU-a

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
- Vatrozid blokira port
- Pogrešan host/port u konfiguraciji

### "authentication failed"
- Pogrešna lozinka u konfiguraciji
- Korisnik nema dozvole
- Proverite grants u bazi

### "CORS policy" greške
- Backend nije konfigurisan za CORS
- Pogrešan origin u allowed_origins
- Preflight zahtev ne prolazi

### "network error" u UI
- Backend nije dostupan
- Pogrešan API URL u UI konfiguraciji
- Problemi sa SSL sertifikatom

## Dobijanje pomoći

Ako problemi potraju:

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

*Ovaj vodič za otklanjanje problema biće proširen kako se budu dokumentovali novi problemi.*