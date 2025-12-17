# Resolución de problemas

Problemas comunes y sus soluciones.

## Problemas del backend

### El backend no inicia

**Síntoma**: El servicio no se inicia

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

**Síntoma**: `connection refused` or `authentication failed`

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

### Problemas de conexión con IPFS

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
- Buscar fugas de memoria en los logs
- Reiniciar el servicio periódicamente
- Considerar aumentar la memoria RAM del servidor

## Problemas de la interfaz (UI)

### Página en blanco / Pantalla blanca

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

**Síntoma**: La UI no puede conectarse al backend

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

### La cartera Web3 no se conecta

**Síntoma**: No se puede conectar MetaMask u otras carteras

**Soluciones**:
- **Asegurar HTTPS**: Web3 requiere conexión segura
- **Comprobar la extensión de la cartera**: ¿Está instalada y desbloqueada?
- **Coincidencia de red**: ¿La cartera está en la cadena equivocada?
- **Verificar encabezados CSP**: Pueden bloquear la inyección de la cartera

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

**Síntoma**: HTTPS no funciona o hay advertencias de certificado

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

**Síntoma**: No se pueden acceder a los servicios remotamente

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

## Problemas de rendimiento

### Carga lenta de la página

**Síntoma**: La UI tarda mucho en cargar

**Soluciones**:
- Habilitar compresión Gzip en Nginx
- Configurar un CDN (Cloudflare, etc.)
- Revisar los tiempos de respuesta del backend
- Optimizar consultas a la base de datos
- Habilitar caché en el navegador

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
- Revisar los grants de la base de datos

### Errores de "CORS policy"
- CORS del backend no está configurado
- Origen incorrecto en allowed_origins
- Fallo en la petición preflight

### "network error" en la UI
- Backend inaccesible
- URL de la API incorrecta en la configuración de la UI
- Problemas con el certificado SSL

## Obtener ayuda

Si los problemas persisten:

1. **Revisar logs**:
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

*Esta guía de resolución de problemas se ampliará a medida que se documenten más incidencias.*