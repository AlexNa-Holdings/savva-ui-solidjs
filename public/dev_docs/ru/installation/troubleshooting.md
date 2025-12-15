# Устранение неполадок

Распространенные проблемы и их решения.

## Проблемы с бэкендом

### Бэкенд не запускается

**Симптом**: Сервис не запускается

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

**Симптом**: `connection refused` или `authentication failed`

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

**Симптом**: Не удается загрузить/получить данные из IPFS

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

### Высокое потребление памяти

**Симптом**: Бэкенд потребляет слишком много памяти

**Решения**:
- Проверьте настройки пула соединений
- Проверьте логи на наличие утечек памяти
- Периодически перезапускайте сервис
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
curl https://api.yourdomain.com/health

# 3. Check CORS settings in backend
# Ensure UI domain is in allowed_origins

# 4. Verify Nginx proxy
curl -I https://api.yourdomain.com
```

### Кошелек Web3 не подключается

**Симптом**: Невозможно подключить MetaMask или другие кошельки

**Решения**:
- **Обеспечьте HTTPS**: Web3 требует защищённого соединения
- **Проверьте расширение кошелька**: установлено и разблокировано ли оно?
- **Несоответствие сети**: кошелек в другой сети?
- **Проверьте заголовки CSP**: могут блокировать внедрение кошелька

```bash
# Check Content-Security-Policy header
curl -I https://yourdomain.com | grep -i content-security
```

### Ошибки сборки

**Симптом**: не удаётся выполнить `npm run build`

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

**Симптом**: HTTPS не работает или возникают предупреждения о сертификате

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

### Проблемы с разрешением DNS

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

## Проблемы с производительностью

### Медленная загрузка страницы

**Симптом**: UI долго загружается

**Решения**:
- Включите сжатие Gzip в Nginx
- Настройте CDN (Cloudflare и т.п.)
- Проверьте время отклика бэкенда
- Оптимизируйте запросы к базе данных
- Включите кэширование в браузере

### Высокая загрузка CPU

**Симптом**: ЦП сервера 100%

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

## Частые сообщения об ошибках

### "connection refused"
- Сервис не запущен
- Брандмауэр блокирует порт
- Неправильный хост/порт в конфигурации

### "authentication failed"
- Неверный пароль в конфигурации
- У пользователя нет прав
- Проверьте привилегии в базе данных

### "CORS policy" errors
- CORS на бэкенде не настроен
- Неправильный origin в allowed_origins
- Предварительный (preflight) запрос не проходит

### "network error" in UI
- Бэкенд недоступен
- Неправильный URL API в конфигурации UI
- Проблемы с SSL-сертификатом

## Получение помощи

Если проблемы сохраняются:

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
   - Конфигурация (санитизированная)

3. **Сообщество**:
   - GitHub Issues
   - Форумы сообщества SAVVA
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

*Это руководство по устранению неполадок будет расширяться по мере документирования новых проблем.*