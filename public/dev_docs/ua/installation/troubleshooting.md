# Усунення неполадок

Поширені проблеми та їх рішення.

## Проблеми бекенда

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

**Симптом**: Бекенд споживає занадто багато пам'яті

**Рішення**:
- Перегляньте налаштування пулу з'єднань
- Перевірте логи на предмет витоків пам'яті
- Періодично перезапускайте сервіс
- Розгляньте можливість збільшити ОЗП сервера

## Проблеми інтерфейсу (UI)

### Порожня сторінка / білий екран

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

### Помилка підключення до API

**Симптом**: UI не може підключитися до бекенда

**Рішення**:
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

### Гаманець Web3 не підключається

**Симптом**: Неможливо підключити MetaMask або інші гаманці

**Рішення**:
- **Переконайтесь у HTTPS**: Web3 вимагає безпечного з'єднання
- **Перевірте розширення гаманця**: Воно встановлене і розблоковане?
- **Неправильна мережа**: Гаманець підключений до іншої мережі?
- **Перевірте заголовки CSP**: Можуть блокувати ін’єкцію гаманця

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

**Симптом**: HTTPS не працює або виникають попередження про сертифікат

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

### Проблеми з розв'язуванням DNS

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

## Проблеми SEO / індексації

### `/robots.txt` повертає 404 (або стандартну сторінку nginx)

**Симптом**: `curl -s https://yourdomain.com/robots.txt` повертає стандартну 404 сторінку nginx або заглушку замість фактичного вмісту з `User-agent: ...`.

**Рішення**:
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

### Бот отримує SPA shell замість відрендереного HTML

**Симптом**: `curl -sA "Googlebot" https://yourdomain.com/` повертає невеликий SPA-бандл `index.html` замість відрендереної сторінки з `<title>`, `og:*` та тілом поста.

**Рішення**:
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

### Людина отримує відрендерений HTML замість SPA

**Симптом**: Звичайний браузер попадає на шлях для ботів і бачить prerendered HTML замість програми на SolidJS.

**Рішення**:
- Регекс для ботів занадто жадібний (наприклад, збігається з `mozilla` як підрядком). Регекс `~*` має використовувати словобоундні імена постачальників — скопіюйте регекс з `nginx.conf.example` без змін.
- Відсутній обхід для статичних ресурсів. Переконайтесь, що присутній блок `if ($uri ~ \.[a-zA-Z0-9]+$) { set $prerender 0; }`, щоб JS-бандли, зображення та шрифти не проходили prerender.

### Попередній перегляд посилання показує неправильний заголовок / зображення / відсутній прев'ю

**Симптом**: Вставка URL SAVVA в Telegram, X, Discord або Slack показує застарілий заголовок, неправильного автора, відсутню мініатюру або невдало обрізане зображення.

**Рішення**:
- Переконайтесь, що UA для unfurler включено в регекс для ботів (наприклад, `telegrambot|twitterbot|facebookexternalhit|discordbot|slackbot|whatsapp`).
- Зміни інвалідовують кеш на сервері за URL, але сторонні сервіс-переглядачі кешують агресивно. Примусово оновіть:
  - **Facebook / WhatsApp / Instagram**: вставте URL у <https://developers.facebook.com/tools/debug/> і натисніть "Scrape Again".
  - **X / Twitter**: <https://cards-dev.twitter.com/validator>.
  - **Telegram / Discord**: зазвичай оновлюється за кілька хвилин; додавання марного параметра запиту (наприклад, `?v=2`) обійде кеш для одноразової перевірки.

### У sitemap відсутні сторінки

**Симптом**: `/sitemap.xml` існує, але не містить очікуваної публікації, профілю, НПО або сторінки тегу.

**Рішення**:
- Мапи сайту генеруються циклічно; дуже свіжі пости можуть ще не потрапити в останній знімок. Зачекайте один цикл і перевірте знову.
- Переконайтесь, що пост публічний — чернетки та приватний контент виключені навмисно.
- Перевірте, що ключ домену в `/etc/savva.yml` дійсно володіє цим контентом. Sitemap формуються по доменах.

## Проблеми продуктивності

### Повільне завантаження сторінки

**Симптом**: UI довго завантажується

**Рішення**:
- Увімкніть Gzip-компресію в Nginx
- Налаштуйте CDN (Cloudflare тощо)
- Перевірте час відповіді бекенда
- Оптимізуйте запити до бази даних
- Увімкніть кешування в браузері

### Високе навантаження на CPU

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
- Неправильний пароль у конфігурації
- Користувач не має прав
- Перевірте права в базі даних

### "CORS policy" errors
- CORS бекенду не налаштований
- Неправильний origin у allowed_origins
- Не проходить preflight-запит

### "network error" in UI
- Бекенд недоступний
- Неправильний URL API в конфігурації UI
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
   - Специфікації сервера
   - Номери версій
   - Конфігурація (без чутливих даних)

3. **Підтримка спільноти**:
   - GitHub Issues
   - Спільнота SAVVA
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

*Цей посібник з усунення неполадок буде доповнюватися по мірі документування нових проблем.*