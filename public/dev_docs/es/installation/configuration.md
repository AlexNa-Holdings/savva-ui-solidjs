# Configuración

Opciones de configuración avanzadas para tu instalación de SAVVA.

## Descripción general

Este documento cubre la configuración avanzada más allá de la instalación básica.

## Configuración del bot de Telegram

SAVVA admite la integración con bots de Telegram para la autenticación de usuarios y notificaciones. Cada dominio puede tener su propio bot de Telegram.

### Creación de un bot de Telegram

1. **Abre Telegram** y busca `@BotFather`

2. **Crea un bot nuevo**:
   - Envía `/newbot` a BotFather
   - Introduce un nombre para mostrar para tu bot (p. ej., "SAVVA Network")
   - Introduce un nombre de usuario para tu bot (debe terminar con `bot`, p. ej., `savva_network_bot`)

3. **Guarda el token del bot**:
   - BotFather te proporcionará un token de API como: `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Mantén este token seguro: cualquiera que tenga este token puede controlar tu bot

4. **Configura los ajustes del bot** (opcional pero recomendado):
   - Envía `/setdescription` - añade una descripción de tu instancia SAVVA
   - Envía `/setabouttext` - añade información que se muestra en el perfil del bot
   - Envía `/setuserpic` - sube el logo de tu red como avatar del bot

### Configuración del backend

Añade la configuración del bot de Telegram a tu `/etc/savva.yml`:

```yaml
# Telegram Bot Configuration
telegram:
  bot-token: "7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Registrar el webhook

Después de configurar el backend, necesitas registrar la URL del webhook en Telegram. Esto indica a Telegram dónde enviar las actualizaciones cuando los usuarios interactúan con tu bot:

```bash
curl -F "url=https://yourdomain/api/telegram-bot/yourdomain" \
  https://api.telegram.org/bot7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/setWebhook
```

Reemplaza:
- `yourdomain` por tu dominio real (aparece dos veces en la URL)
- `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` por el token de tu bot

**Respuesta esperada:**
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Verifica el estado del webhook:**
```bash
curl https://api.telegram.org/bot<your_bot_token>/getWebhookInfo
```

### Cómo funciona

Una vez configurado, los usuarios pueden:
- Vincular su cuenta de Telegram con su perfil de SAVVA
- Recibir notificaciones sobre nuevos seguidores, comentarios y menciones
- Usar Telegram como método de autenticación adicional

### Notas de seguridad

- Nunca compartas públicamente el token de tu bot
- El token del bot en `savva.yml` debe tener permisos de archivo restringidos (`chmod 600`)
- Considera usar variables de entorno para el token en producción:
  ```yaml
  telegram:
    bot-token: ${TELEGRAM_BOT_TOKEN}
  ```