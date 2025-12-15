# Troubleshooting

Common issues and their solutions.

## Backend Issues

### Backend Won't Start

**Symptom**: Service fails to start

**Solutions**:
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

### Database Connection Errors

**Symptom**: `connection refused` or `authentication failed`

**Solutions**:
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

### IPFS Connection Issues

**Symptom**: Cannot upload/fetch from IPFS

**Solutions**:
```bash
# Check IPFS daemon
ipfs swarm peers

# Restart IPFS
killall ipfs
ipfs daemon &

# Check API accessibility
curl http://localhost:5001/api/v0/version
```

### High Memory Usage

**Symptom**: Backend consuming too much memory

**Solutions**:
- Review connection pool settings
- Check for memory leaks in logs
- Restart service periodically
- Consider increasing server RAM

## UI Issues

### Blank Page / White Screen

**Symptom**: Page loads but shows nothing

**Solutions**:
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

### API Connection Failed

**Symptom**: UI can't connect to backend

**Solutions**:
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

### Web3 Wallet Not Connecting

**Symptom**: Cannot connect MetaMask or other wallets

**Solutions**:
- **Ensure HTTPS**: Web3 requires secure connection
- **Check wallet extension**: Is it installed and unlocked?
- **Network mismatch**: Wallet on wrong chain?
- **Check CSP headers**: May block wallet injection

```bash
# Check Content-Security-Policy header
curl -I https://yourdomain.com | grep -i content-security
```

### Build Errors

**Symptom**: `npm run build` fails

**Solutions**:
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

## Network Issues

### SSL Certificate Errors

**Symptom**: HTTPS not working or certificate warnings

**Solutions**:
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

### DNS Resolution Issues

**Symptom**: Domain not resolving

**Solutions**:
```bash
# Check DNS propagation
dig yourdomain.com
nslookup yourdomain.com

# Verify A record
dig A yourdomain.com +short

# Check from multiple locations
# Use: https://dnschecker.org
```

### Firewall Blocking Connections

**Symptom**: Cannot access services remotely

**Solutions**:
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

## Performance Issues

### Slow Page Load

**Symptom**: UI takes long to load

**Solutions**:
- Enable Gzip compression in Nginx
- Setup CDN (Cloudflare, etc.)
- Check backend response times
- Optimize database queries
- Enable browser caching

### High CPU Usage

**Symptom**: Server CPU at 100%

**Solutions**:
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

### Database Performance

**Symptom**: Slow queries

**Solutions**:
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

## Common Error Messages

### "connection refused"
- Service not running
- Firewall blocking port
- Wrong host/port in config

### "authentication failed"
- Wrong password in config
- User doesn't have permissions
- Check database grants

### "CORS policy" errors
- Backend CORS not configured
- Wrong origin in allowed_origins
- Preflight request failing

### "network error" in UI
- Backend not accessible
- Wrong API URL in UI config
- SSL certificate issues

## Getting Help

If issues persist:

1. **Check logs**:
   ```bash
   # Backend logs
   sudo journalctl -u savva-backend -n 100 -f

   # Nginx logs
   sudo tail -f /var/log/nginx/error.log

   # Browser console
   # Press F12 → Console
   ```

2. **Gather information**:
   - Error messages
   - Server specs
   - Version numbers
   - Configuration (sanitized)

3. **Community support**:
   - GitHub Issues
   - SAVVA community forums
   - Developer documentation

4. **Check updates**:
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

*This troubleshooting guide will be expanded as more issues are documented.*
