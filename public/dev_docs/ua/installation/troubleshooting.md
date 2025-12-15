# Усунення неполадок

Поширені проблеми та їх вирішення.

## Проблеми бекенду

### Бекенд не запускається

**Симптом**: Сервіс не запускається

**Рішення**:
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

### Помилки підключення до бази даних

**Симптом**: `connection refused` or `authentication failed`

**Рішення**:
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

### Проблеми підключення до IPFS

**Симптом**: Неможливо завантажити/отримати з IPFS

**Рішення**:
```bash
# Check IPFS daemon
ipfs swarm peers

# Restart IPFS
killall ipfs
ipfs daemon &

# Check API accessibility
curl http://localhost:5001/api/v0/version
```

### Високе використання пам'яті

**Симптом**: Бекенд споживає забагато пам'яті

**Рішення**:
- Перегляньте налаштування пулу з'єднань
- Перевірте логи на наявність витоків пам'яті
- Періодично перезапускайте сервіс
- Розгляньте можливість збільшення оперативної пам'яті сервера

## Проблеми інтерфейсу користувача

### Порожня сторінка / Білий екран

**Симптом**: Сторінка завантажується, але нічого не показує

**Рішення**:
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

### Не вдалося підключитися до API

**Симптом**: Інтерфейс не може підключитися до бекенду

**Рішення**:
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

### Гаманець Web3 не підключається

**Симптом**: Неможливо підключити MetaMask або інші гаманці

**Рішення**:
- **Переконайтеся в HTTPS**: Web3 вимагає безпечного з'єднання
- **Перевірте розширення гаманця**: чи встановлене і розблоковане?
- **Невідповідність мережі**: гаманець у неправильній мережі?
- **Перевірте заголовки CSP**: можуть блокувати ін’єкцію гаманця

```bash
# Check Content-Security-Policy header
curl -I https://yourdomain.com | grep -i content-security
```

### Помилки збірки

**Симптом**: `npm run build` не вдається

**Рішення**:
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

## Мережеві проблеми

### Помилки SSL-сертифіката

**Симптом**: HTTPS не працює або з'являються попередження про сертифікат

**Рішення**:
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

### Проблеми з DNS-резолюцією

**Симптом**: Домен не резолвиться

**Рішення**:
```bash
# Check DNS propagation
dig yourdomain.com
nslookup yourdomain.com

# Verify A record
dig A yourdomain.com +short

# Check from multiple locations
# Use: https://dnschecker.org
```

### Брандмауер блокує з'єднання

**Симптом**: Неможливо отримати доступ до сервісів віддалено

**Рішення**:
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

## Проблеми з продуктивністю

### Повільне завантаження сторінки

**Симптом**: Інтерфейс довго завантажується

**Рішення**:
- Увімкніть Gzip стиснення в Nginx
- Налаштуйте CDN (Cloudflare тощо)
- Перевірте час відповіді бекенду
- Оптимізуйте запити до бази даних
- Увімкніть кешування в браузері

### Високе завантаження CPU

**Симптом**: CPU сервера на 100%

**Рішення**:
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

### Продуктивність бази даних

**Симптом**: Повільні запити

**Рішення**:
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

## Поширені повідомлення про помилки

### "connection refused"
- Сервіс не запущено
- Брандмауер блокує порт
- Неправильний хост/порт у конфігурації

### "authentication failed"
- Невірний пароль у конфігурації
- Користувач не має прав
- Перевірте привілеї бази даних

### "CORS policy" errors
- CORS бекенду не налаштований
- Неправильний origin у allowed_origins
- Не вдається preflight-запит

### "network error" in UI
- Бекенд недоступний
- Неправильний URL API у конфігурації інтерфейсу
- Проблеми з SSL-сертифікатом

## Отримання допомоги

Якщо проблеми не зникають:

1. **Перевірте логи**:
   ```bash
   # Backend logs
   sudo journalctl -u savva-backend -n 100 -f

   # Nginx logs
   sudo tail -f /var/log/nginx/error.log

   # Browser console
   # Press F12 → Console
   ```

2. **Зберіть інформацію**:
   - Повідомлення про помилки
   - Характеристики сервера
   - Номери версій
   - Конфігурація (без конфіденційних даних)

3. **Підтримка спільноти**:
   - GitHub Issues
   - Форуми спільноти SAVVA
   - Документація для розробників

4. **Перевірте оновлення**:
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

*Цей довідник з усунення неполадок буде розширюватися по мірі документування нових проблем.*