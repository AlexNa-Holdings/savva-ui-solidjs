# Configuration

Options de configuration avancées pour votre installation SAVVA.

## Aperçu

Ce document couvre la configuration avancée au-delà de la configuration de base.

## Configuration du bot Telegram

SAVVA prend en charge l'intégration d'un bot Telegram pour l'authentification des utilisateurs et les notifications. Chaque domaine peut avoir son propre bot Telegram.

### Création d'un bot Telegram

1. **Ouvrez Telegram** et recherchez `@BotFather`

2. **Créez un nouveau bot** :
   - Envoyez `/newbot` à BotFather
   - Entrez un nom d'affichage pour votre bot (par ex., "SAVVA Network")
   - Choisissez un nom d'utilisateur pour votre bot (doit se terminer par `bot`, par ex. `savva_network_bot`)

3. **Enregistrez le jeton du bot** :
   - BotFather vous fournira un jeton API du type : `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Conservez ce jeton en lieu sûr — toute personne en possession de ce jeton peut contrôler votre bot

4. **Configurez les paramètres du bot** (optionnel mais recommandé) :
   - Envoyez `/setdescription` — ajoutez une description de votre instance SAVVA
   - Envoyez `/setabouttext` — ajoutez des informations affichées dans le profil du bot
   - Envoyez `/setuserpic` — téléversez le logo de votre réseau comme avatar du bot

### Configuration du backend

Ajoutez les paramètres du bot Telegram dans votre `/etc/savva.yml`:

```yaml
# Telegram Bot Configuration
telegram:
  bot-token: "7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Enregistrer le webhook

Après avoir configuré le backend, vous devez enregistrer l'URL du webhook auprès de Telegram. Cela indique à Telegram où envoyer les mises à jour lorsque les utilisateurs interagissent avec votre bot:

```bash
curl -F "url=https://yourdomain/api/telegram-bot/yourdomain" \
  https://api.telegram.org/bot7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/setWebhook
```

Remplacez :
- `yourdomain` par votre domaine réel (apparaît deux fois dans l'URL)
- `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` par votre jeton de bot

**Réponse attendue :**
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Vérifier l'état du webhook :**
```bash
curl https://api.telegram.org/bot<your_bot_token>/getWebhookInfo
```

### Comment ça fonctionne

Une fois configuré, les utilisateurs peuvent :
- Lier leur compte Telegram à leur profil SAVVA
- Recevoir des notifications concernant les nouveaux abonnés, commentaires et mentions
- Utiliser Telegram comme méthode d'authentification supplémentaire

### Notes de sécurité

- Ne partagez jamais votre jeton de bot publiquement
- Le jeton du bot dans `savva.yml` doit avoir des permissions de fichier restreintes (`chmod 600`)
- Envisagez d'utiliser des variables d'environnement pour le jeton en production :
  ```yaml
  telegram:
    bot-token: ${TELEGRAM_BOT_TOKEN}
  ```