# Configuration

Options de configuration avancées pour votre installation SAVVA.

## Aperçu

Ce document couvre la configuration avancée au-delà de l'installation de base.

## Configuration du bot Telegram

SAVVA prend en charge l'intégration d'un bot Telegram pour l'authentification des utilisateurs et les notifications. Chaque domaine peut avoir son propre bot Telegram.

### Création d'un bot Telegram

1. **Ouvrez Telegram** et recherchez `@BotFather`

2. **Créez un nouveau bot** :
   - Envoyez `/newbot` à BotFather
   - Entrez un nom d'affichage pour votre bot (par ex. : "SAVVA Network")
   - Entrez un nom d'utilisateur pour votre bot (doit se terminer par `bot`, par ex. `savva_network_bot`)

3. **Sauvegardez le token du bot** :
   - BotFather fournira un token API comme : `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Gardez ce token en sécurité — toute personne disposant de ce token peut contrôler votre bot

4. **Configurez les paramètres du bot** (optionnel mais recommandé) :
   - Envoyez `/setdescription` - ajoutez une description de votre instance SAVVA
   - Envoyez `/setabouttext` - ajoutez des infos affichées dans le profil du bot
   - Envoyez `/setuserpic` - téléchargez le logo de votre réseau comme avatar du bot

### Configuration backend

Ajoutez les paramètres du bot Telegram à votre `/etc/savva.yml` :

```yaml
# Telegram Bot Configuration
telegram:
  bot-token: "7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Enregistrer le webhook

Après avoir configuré le backend, vous devez enregistrer l'URL du webhook auprès de Telegram. Cela indique à Telegram où envoyer les mises à jour lorsque les utilisateurs interagissent avec votre bot :

```bash
curl -F "url=https://yourdomain/api/telegram-bot/yourdomain" \
  https://api.telegram.org/bot7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/setWebhook
```

Remplacez :
- `yourdomain` par votre domaine réel (apparaît deux fois dans l'URL)
- `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` par votre token de bot

**Réponse attendue :**
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Vérifier le statut du webhook :**
```bash
curl https://api.telegram.org/bot<your_bot_token>/getWebhookInfo
```

### Comment ça fonctionne

Une fois configuré, les utilisateurs peuvent :
- Lier leur compte Telegram à leur profil SAVVA
- Recevoir des notifications concernant les nouveaux abonnés, commentaires et mentions
- Utiliser Telegram comme méthode d'authentification supplémentaire

### Notes de sécurité

- Ne partagez jamais votre token de bot publiquement
- Le token du bot dans `savva.yml` doit avoir des permissions de fichier restreintes (`chmod 600`)
- En production, envisagez d'utiliser des variables d'environnement pour le token :
  ```yaml
  telegram:
    bot-token: ${TELEGRAM_BOT_TOKEN}
  ```

## Configuration backend

### Optimisation de la base de données

**Bientôt** : optimisation PostgreSQL pour des instances à fort trafic

### Configuration IPFS

**Bientôt** : stratégies de pinning IPFS et optimisation des passerelles

### Mise en cache

**Bientôt** : intégration Redis pour la mise en cache des sessions

### Limitation de débit

**Bientôt** : configuration du rate limiting de l'API

## Configuration de l'interface utilisateur

### Branding

**Bientôt** : comment personnaliser couleurs, logos et image de marque

### Feature Flags

**Bientôt** : activation/désactivation de fonctionnalités spécifiques

### Analytics

**Bientôt** : intégration des outils d'analytics

## Configuration blockchain

### Réseaux personnalisés

**Bientôt** : connexion à des réseaux EVM personnalisés

### Configuration des contrats

**Bientôt** : paramètres avancés d'interaction avec les contrats

## Optimisation des performances

### Configuration CDN

**Bientôt** : optimisation de la livraison des ressources

### Indexs de base de données

**Bientôt** : requêtes d'optimisation de base de données

### Stratégies de mise en cache

**Bientôt** : mise en cache backend et frontend

## Configuration de sécurité

### SSL/TLS

**Bientôt** : configuration HTTPS avancée

### Sécurité de l'API

**Bientôt** : configuration JWT et bonnes pratiques de sécurité

### Paramètres CORS

**Bientôt** : ajustement fin des politiques CORS

## Surveillance et journalisation

### Gestion des logs

**Bientôt** : configuration de journalisation centralisée

### Surveillance des performances

**Bientôt** : intégration APM

### Suivi des erreurs

**Bientôt** : intégration Sentry ou équivalent

---

*Cette section est en construction. Revenez pour des mises à jour.*