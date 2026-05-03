# Solución de problemas

Problemas comunes y sus soluciones.

## Problemas del backend

### El backend no se inicia

**Síntoma**: El servicio no arranca

**Soluciones**:
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

### Errores de conexión a la base de datos

**Síntoma**: `connection refused` o `authentication failed`

**Soluciones**:
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

### Errores de conexión a IPFS

**Síntoma**: No se puede subir/obtener desde IPFS

**Soluciones**:
```bash
# Check IPFS daemon
ipfs swarm peers

# Restart IPFS
killall ipfs
ipfs daemon &

# Check API accessibility
curl http://localhost:5001/api/v0/version
```

### Alto uso de memoria

**Síntoma**: El backend consume demasiada memoria

**Soluciones**:
- Revisar la configuración del pool de conexiones
- Buscar fugas de memoria en los registros
- Reiniciar el servicio periódicamente
- Considerar aumentar la RAM del servidor

## Problemas de la UI

### Página en blanco / pantalla blanca

**Síntoma**: La página carga pero no muestra nada

**Soluciones**:
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

### Conexión a la API fallida

**Síntoma**: La UI no puede conectar con el backend

**Soluciones**:
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

### Wallet Web3 no conecta

**Síntoma**: No se puede conectar MetaMask u otras wallets

**Soluciones**:
- **Asegurar HTTPS**: Web3 requiere conexión segura
- **Comprobar la extensión de la wallet**: ¿Está instalada y desbloqueada?
- **Desajuste de red**: ¿La wallet está en la cadena equivocada?
- **Comprobar cabeceras CSP**: Pueden bloquear la inyección de la wallet

```bash
# Check Content-Security-Policy header
curl -I https://yourdomain.com | grep -i content-security
```

### Errores de compilación

**Síntoma**: `npm run build` falla

**Soluciones**:
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

## Problemas de red

### Errores de certificado SSL

**Síntoma**: HTTPS no funciona o aparecen advertencias de certificado

**Soluciones**:
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

### Problemas de resolución DNS

**Síntoma**: El dominio no resuelve

**Soluciones**:
```bash
# Check DNS propagation
dig yourdomain.com
nslookup yourdomain.com

# Verify A record
dig A yourdomain.com +short

# Check from multiple locations
# Use: https://dnschecker.org
```

### Firewall bloqueando conexiones

**Síntoma**: No se puede acceder a los servicios de forma remota

**Soluciones**:
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

## SEO / Descubrimiento

### `/robots.txt` devuelve 404 (o el predeterminado de nginx)

**Síntoma**: `curl -s https://yourdomain.com/robots.txt` devuelve la página 404 por defecto de nginx o un stub en lugar de un cuerpo real `User-agent: ...`.

**Soluciones**:
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

### La ruta de bots devuelve el contenedor SPA en lugar de HTML prerenderizado

**Síntoma**: `curl -sA "Googlebot" https://yourdomain.com/` devuelve el pequeño bundle `index.html` de la SPA en lugar de una página renderizada con `<title>`, `og:*` y el cuerpo del post.

**Soluciones**:
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

### La ruta humana devuelve HTML prerenderizado en lugar de la SPA

**Síntoma**: Un navegador normal entra por la ruta de bots y ve el HTML prerenderizado en lugar de la aplicación SolidJS.

**Soluciones**:
- La expresión regular de bots es demasiado amplia (por ejemplo, coincide con `mozilla` como subcadena). La regex `~*` debe usar nombres de proveedores con límites de palabra — copia la regex de `nginx.conf.example` exactamente.
- Falta la omisión de recursos estáticos. Confirma que `if ($uri ~ \.[a-zA-Z0-9]+$) { set $prerender 0; }` esté presente para que los bundles JS, imágenes y fuentes no se prerendericen.

### Los unfurls de enlaces muestran título/imagen incorrectos o sin vista previa

**Síntoma**: Pegar una URL de SAVVA en Telegram, X, Discord o Slack muestra un título obsoleto, el autor equivocado, sin miniatura o una imagen recortada de forma extraña.

**Soluciones**:
- Confirma que el UA del unfurler está en la regex de bots (por ejemplo `telegrambot|twitterbot|facebookexternalhit|discordbot|slackbot|whatsapp`).
- Las ediciones invalidan la caché por URL en el servidor, pero los terceros cachean agresivamente. Fuerza una actualización:
  - **Facebook / WhatsApp / Instagram**: pega la URL en <https://developers.facebook.com/tools/debug/> y haz clic en "Scrape Again".
  - **X / Twitter**: <https://cards-dev.twitter.com/validator>.
  - **Telegram / Discord**: normalmente se limpian en minutos; añadir una cadena de consulta inocua (p. ej. `?v=2`) evita la caché para una prueba puntual.

### El sitemap no incluye páginas

**Síntoma**: `/sitemap.xml` existe pero no lista un post, perfil, NPO o página de etiqueta que esperas.

**Soluciones**:
- Los sitemaps se regeneran en ciclo; los posts muy recientes pueden no estar en la instantánea más reciente. Espera un ciclo y vuelve a comprobar.
- Confirma que el post es público — los borradores y el contenido privado se excluyen intencionadamente.
- Confirma que la clave de dominio en `/etc/savva.yml` realmente posee el contenido. Los sitemaps son por dominio.

## Problemas de rendimiento

### Carga lenta de página

**Síntoma**: La UI tarda en cargar

**Soluciones**:
- Habilitar compresión Gzip en Nginx
- Configurar CDN (Cloudflare, etc.)
- Revisar tiempos de respuesta del backend
- Optimizar consultas a la base de datos
- Habilitar cacheo en el navegador

### Alto uso de CPU

**Síntoma**: CPU del servidor al 100%

**Soluciones**:
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

### Rendimiento de la base de datos

**Síntoma**: Consultas lentas

**Soluciones**:
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

## Mensajes de error comunes

### "connection refused"
- Servicio no en ejecución
- Firewall bloqueando el puerto
- Host/puerto incorrecto en la configuración

### "authentication failed"
- Contraseña incorrecta en la configuración
- El usuario no tiene permisos
- Comprobar permisos/grants en la base de datos

### Errores de "CORS policy"
- CORS del backend no configurado
- Origen incorrecto en allowed_origins
- La petición preflight falla

### "network error" en la UI
- Backend no accesible
- URL de la API incorrecta en la configuración de la UI
- Problemas con el certificado SSL

## Obtener ayuda

Si los problemas persisten:

1. **Revisar registros**:
   ```bash
   # Backend logs
   sudo journalctl -u savva-backend -n 100 -f

   # Nginx logs
   sudo tail -f /var/log/nginx/error.log

   # Browser console
   # Press F12 → Console
   ```

2. **Recopilar información**:
   - Mensajes de error
   - Especificaciones del servidor
   - Números de versión
   - Configuración (sanitizada)

3. **Soporte comunitario**:
   - Issues en GitHub
   - Foros de la comunidad SAVVA
   - Documentación para desarrolladores

4. **Comprobar actualizaciones**:
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

*Esta guía de solución de problemas se ampliará a medida que se documenten más incidencias.*