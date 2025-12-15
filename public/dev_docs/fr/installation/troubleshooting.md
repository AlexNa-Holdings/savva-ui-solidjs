# Dépannage

Problèmes courants et leurs solutions.

## Problèmes du backend

### Le backend ne démarre pas

**Symptôme** : le service ne démarre pas

**Solutions** :
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

### Erreurs de connexion à la base de données

**Symptôme** : `connection refused` or `authentication failed`

**Solutions** :
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

### Problèmes de connexion à IPFS

**Symptôme** : Impossible d'envoyer/récupérer depuis IPFS

**Solutions** :
```bash
# Check IPFS daemon
ipfs swarm peers

# Restart IPFS
killall ipfs
ipfs daemon &

# Check API accessibility
curl http://localhost:5001/api/v0/version
```

### Utilisation mémoire élevée

**Symptôme** : Le backend consomme trop de mémoire

**Solutions** :
- Vérifier les paramètres du pool de connexions
- Rechercher des fuites de mémoire dans les logs
- Redémarrer le service périodiquement
- Envisager d'augmenter la RAM du serveur

## Problèmes de l'interface utilisateur (UI)

### Page blanche / écran blanc

**Symptôme** : la page se charge mais n'affiche rien

**Solutions** :
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

### Échec de la connexion à l'API

**Symptôme** : l'interface ne peut pas se connecter au backend

**Solutions** :
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

### Le portefeuille Web3 ne se connecte pas

**Symptôme** : Impossible de connecter MetaMask ou d'autres portefeuilles

**Solutions** :
- **S'assurer d'utiliser HTTPS** : Web3 nécessite une connexion sécurisée
- **Vérifier l'extension du portefeuille** : est-elle installée et déverrouillée ?
- **Réseau incorrect** : le portefeuille est-il sur la mauvaise chaîne ?
- **Vérifier les en-têtes CSP** : ils peuvent bloquer l'injection du portefeuille

```bash
# Check Content-Security-Policy header
curl -I https://yourdomain.com | grep -i content-security
```

### Erreurs de build

**Symptôme** : `npm run build` échoue

**Solutions** :
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

## Problèmes réseau

### Erreurs de certificat SSL

**Symptôme** : HTTPS ne fonctionne pas ou avertissements de certificat

**Solutions** :
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

### Problèmes de résolution DNS

**Symptôme** : le domaine ne se résout pas

**Solutions** :
```bash
# Check DNS propagation
dig yourdomain.com
nslookup yourdomain.com

# Verify A record
dig A yourdomain.com +short

# Check from multiple locations
# Use: https://dnschecker.org
```

### Pare-feu bloquant les connexions

**Symptôme** : Impossible d'accéder aux services à distance

**Solutions** :
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

## Problèmes de performance

### Chargement lent de la page

**Symptôme** : l'interface met du temps à se charger

**Solutions** :
- Activer la compression Gzip dans Nginx
- Configurer un CDN (Cloudflare, etc.)
- Vérifier les temps de réponse du backend
- Optimiser les requêtes de la base de données
- Activer la mise en cache côté navigateur

### Utilisation CPU élevée

**Symptôme** : CPU du serveur à 100 %

**Solutions** :
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

### Performance de la base de données

**Symptôme** : requêtes lentes

**Solutions** :
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

## Messages d'erreur courants

### "connection refused"
- Service non démarré
- Pare-feu bloquant le port
- Hôte/port incorrect dans la configuration

### "authentication failed"
- Mauvais mot de passe dans la configuration
- L'utilisateur n'a pas les permissions
- Vérifier les grants de la base de données

### "CORS policy" errors
- CORS du backend non configuré
- Origine incorrecte dans allowed_origins
- Requête preflight échouée

### "network error" in UI
- Backend inaccessible
- URL de l'API incorrecte dans la configuration de l'UI
- Problèmes de certificat SSL

## Obtenir de l'aide

Si les problèmes persistent :

1. **Vérifier les logs** :
   ```bash
   # Backend logs
   sudo journalctl -u savva-backend -n 100 -f

   # Nginx logs
   sudo tail -f /var/log/nginx/error.log

   # Browser console
   # Press F12 → Console
   ```

2. **Rassembler les informations** :
   - Messages d'erreur
   - Spécifications du serveur
   - Numéros de version
   - Configuration (sanitisée)

3. **Support communautaire** :
   - GitHub Issues
   - Forums de la communauté SAVVA
   - Documentation développeur

4. **Vérifier les mises à jour** :
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

*Ce guide de dépannage sera étoffé au fur et à mesure que d'autres problèmes seront documentés.*