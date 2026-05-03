# Устранение неполадок

Распространенные проблемы и их решения.

## Проблемы с бэкендом

### Бэкенд не запускается

**Симптом**: Служба не запускается

**Решения**:
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

### Ошибки подключения к базе данных

**Симптом**: `connection refused` or `authentication failed`

**Решения**:
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

### Проблемы подключения к IPFS

**Симптом**: Невозможно загрузить/получить данные из IPFS

**Решения**:
```bash
# Check IPFS daemon
ipfs swarm peers

# Restart IPFS
killall ipfs
ipfs daemon &

# Check API accessibility
curl http://localhost:5001/api/v0/version
```

### Высокое использование памяти

**Симптом**: Бэкенд потребляет слишком много памяти

**Решения**:
- Проверьте настройки пула подключений
- Проверьте логи на утечки памяти
- Периодически перезапускайте службу
- Рассмотрите возможность увеличения оперативной памяти сервера

## Проблемы с UI

### Пустая страница / белый экран

**Симптом**: Страница загружается, но ничего не отображается

**Решения**:
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

### Не удалось подключиться к API

**Симптом**: UI не может подключиться к бэкенду

**Решения**:
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

### Кошелек Web3 не подключается

**Симптом**: Не удается подключить MetaMask или другие кошельки

**Решения**:
- **Обеспечьте HTTPS**: Web3 требует защищенного соединения
- **Проверьте расширение кошелька**: Установлено ли оно и разблокировано?
- **Несоответствие сети**: Кошелек подключен к неправильной сети?
- **Проверьте заголовки CSP**: Могут блокировать инъекцию кошелька

```bash
# Check Content-Security-Policy header
curl -I https://yourdomain.com | grep -i content-security
```

### Ошибки сборки

**Симптом**: `npm run build` fails

**Решения**:
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

## Сетевые проблемы

### Ошибки SSL-сертификата

**Симптом**: HTTPS не работает или выдаются предупреждения о сертификате

**Решения**:
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

### Проблемы разрешения DNS

**Симптом**: Домен не разрешается

**Решения**:
```bash
# Check DNS propagation
dig yourdomain.com
nslookup yourdomain.com

# Verify A record
dig A yourdomain.com +short

# Check from multiple locations
# Use: https://dnschecker.org
```

### Брандмауэр блокирует соединения

**Симптом**: Невозможно получить доступ к сервисам удаленно

**Решения**:
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

## SEO / проблемы обнаружения

### `/robots.txt` возвращает 404 (или стандартную страницу nginx)

**Симптом**: `curl -s https://yourdomain.com/robots.txt` возвращает стандартную 404-страницу nginx или заглушку вместо реального тела `User-agent: ...`.

**Решения**:
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

### Путь бота возвращает оболочку SPA вместо отрендеренного HTML

**Симптом**: `curl -sA "Googlebot" https://yourdomain.com/` возвращает маленький SPA-бандл `index.html` вместо отрендеренной страницы с `<title>`, `og:*` и телом поста.

**Решения**:
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

### Человеческий путь возвращает отрендеренный HTML вместо SPA

**Симптом**: Обычный браузер попадает на путь бота и видит предварительно отрендеренный HTML вместо приложения на SolidJS.

**Решения**:
- Регулярное выражение для ботов слишком жадное (например, совпадает с `mozilla` как подстрока). Регекс `~*` должен использовать имена поставщиков, ограниченные границами слов — скопируйте регекс из `nginx.conf.example` дословно.
- Отсутствует обход для статических ресурсов. Убедитесь, что присутствует `if ($uri ~ \.[a-zA-Z0-9]+$) { set $prerender 0; }`, чтобы JS-бандлы, изображения и шрифты не предварительно рендерились.

### Предпросмотр ссылки показывает неправильный заголовок / изображение / нет превью

**Симптом**: Вставка URL SAVVA в Telegram, X, Discord или Slack показывает устаревший заголовок, неверного автора, отсутствие миниатюры или неудачно обрезанное изображение.

**Решения**:
- Убедитесь, что UA сервиса предпросмотра включен в регекс ботов (например, `telegrambot|twitterbot|facebookexternalhit|discordbot|slackbot|whatsapp`).
- Изменения инвалидируют серверный кэш по URL, но сторонние сервисы предпросмотра кэшируют агрессивно. Принудительно обновите:
  - **Facebook / WhatsApp / Instagram**: вставьте URL в <https://developers.facebook.com/tools/debug/> и нажмите "Scrape Again".
  - **X / Twitter**: <https://cards-dev.twitter.com/validator>.
  - **Telegram / Discord**: обычно кэш очищается в течение нескольких минут; добавление безвредной строки запроса (например, `?v=2`) обходит кэш для одноразовой проверки.

### В карте сайта отсутствуют страницы

**Симптом**: `/sitemap.xml` существует, но не содержит ожидаемую запись о посте, профиле, NPO или странице тега.

**Решения**:
- Карта сайта генерируется по циклу; очень новые публикации могут еще не появиться в последнем снимке. Подождите один цикл и проверьте снова.
- Убедитесь, что пост публичный — черновики и приватный контент исключаются намеренно.
- Убедитесь, что ключ домена в `/etc/savva.yml` действительно владеет контентом. Карты сайта генерируются по доменам.

## Проблемы с производительностью

### Медленная загрузка страницы

**Симптом**: UI долго загружается

**Решения**:
- Включите Gzip-сжатие в Nginx
- Настройте CDN (Cloudflare и т.д.)
- Проверьте время отклика бэкенда
- Оптимизируйте запросы к базе данных
- Включите кэширование в браузере

### Высокая загрузка CPU

**Симптом**: ЦП сервера загружен на 100%

**Решения**:
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

### Производительность базы данных

**Симптом**: Медленные запросы

**Решения**:
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

## Распространенные сообщения об ошибках

### "connection refused"
- Служба не запущена
- Брандмауэр блокирует порт
- Неверный хост/порт в конфигурации

### "authentication failed"
- Неверный пароль в конфигурации
- У пользователя нет прав
- Проверьте привилегии в базе данных

### "CORS policy" errors
- CORS не настроен в бэкенде
- Неверный origin в allowed_origins
- Preflight-запрос не проходит

### "network error" in UI
- Бэкенд недоступен
- Неверный URL API в конфигурации UI
- Проблемы с SSL-сертификатом

## Получение помощи

Если проблемы не устраняются:

1. **Проверьте логи**:
   ```bash
   # Backend logs
   sudo journalctl -u savva-backend -n 100 -f

   # Nginx logs
   sudo tail -f /var/log/nginx/error.log

   # Browser console
   # Press F12 → Console
   ```

2. **Соберите информацию**:
   - Сообщения об ошибках
   - Характеристики сервера
   - Номера версий
   - Конфигурация (без чувствительных данных)

3. **Поддержка сообщества**:
   - GitHub Issues
   - SAVVA community forums
   - Документация для разработчиков

4. **Проверьте обновления**:
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

*Этот справочник по устранению неполадок будет расширяться по мере документирования новых проблем.*