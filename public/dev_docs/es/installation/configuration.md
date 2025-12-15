# Configuración

Opciones de configuración avanzadas para su instalación de SAVVA.

## Resumen

Este documento cubre la configuración avanzada más allá de la configuración básica.

## Configuración del bot de Telegram

SAVVA admite la integración con bots de Telegram para la autenticación de usuarios y notificaciones. Cada dominio puede tener su propio bot de Telegram.

### Creación de un bot de Telegram

1. **Abra Telegram** y busque `@BotFather`

2. **Cree un nuevo bot**:
   - Envíe `/newbot` a BotFather
   - Ingrese un nombre para mostrar para su bot (p. ej., "SAVVA Network")
   - Ingrese un nombre de usuario para su bot (debe terminar con `bot`, p. ej., `savva_network_bot`)

3. **Guarde el token del bot**:
   - BotFather le proporcionará un token de API como: `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Mantenga este token seguro: cualquiera que tenga este token puede controlar su bot

4. **Configure los ajustes del bot** (opcional pero recomendado):
   - Envíe `/setdescription` - agregue una descripción de su instancia SAVVA
   - Envíe `/setabouttext` - agregue información que se mostrará en el perfil del bot
   - Envíe `/setuserpic` - suba el logotipo de su red como avatar del bot

### Configuración del backend

Agregue los ajustes del bot de Telegram a su `/etc/savva.yml`:

```yaml
# Telegram Bot Configuration
telegram:
  bot-token: "7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Registrar webhook

Después de configurar el backend, necesita registrar la URL del webhook con Telegram. Esto indica a Telegram dónde enviar las actualizaciones cuando los usuarios interactúan con su bot:

```bash
curl -F "url=https://yourdomain/api/telegram-bot/yourdomain" \
  https://api.telegram.org/bot7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/setWebhook
```

Reemplace:
- `yourdomain` por su dominio real (aparece dos veces en la URL)
- `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` por su token de bot

**Respuesta esperada:**
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Verificar el estado del webhook:**
```bash
curl https://api.telegram.org/bot<your_bot_token>/getWebhookInfo
```

### Cómo funciona

Una vez configurado, los usuarios pueden:
- Vincular su cuenta de Telegram con su perfil de SAVVA
- Recibir notificaciones sobre nuevos seguidores, comentarios y menciones
- Usar Telegram como un método de autenticación adicional

### Notas de seguridad

- Nunca comparta públicamente su token de bot
- El token del bot en `savva.yml` debe tener permisos de archivo restringidos (`chmod 600`)
- Considere usar variables de entorno para el token en producción:
  ```yaml
  telegram:
    bot-token: ${TELEGRAM_BOT_TOKEN}
  ```

## Configuración del backend

### Optimización de la base de datos

**Próximamente**: Optimización de PostgreSQL para instancias de alto tráfico

### Configuración de IPFS

**Próximamente**: Estrategias de pinning de IPFS y optimización de gateways

### Caché

**Próximamente**: Integración con Redis para el almacenamiento en caché de sesiones

### Limitación de tasa

**Próximamente**: Configuración de limitación de tasa de la API

## Configuración de la interfaz de usuario

### Marca

**Próximamente**: Cómo personalizar colores, logotipos e imagen de marca

### Flags de funciones

**Próximamente**: Habilitar/deshabilitar funciones específicas

### Analítica

**Próximamente**: Integración de herramientas de analítica

## Configuración de blockchain

### Redes personalizadas

**Próximamente**: Conexión a redes EVM personalizadas

### Configuración de contratos

**Próximamente**: Configuración avanzada de interacción con contratos

## Optimización del rendimiento

### Configuración de CDN

**Próximamente**: Optimización de la entrega de recursos

### Índices de base de datos

**Próximamente**: Consultas de optimización de la base de datos

### Estrategias de caché

**Próximamente**: Caché en backend y frontend

## Configuración de seguridad

### SSL/TLS

**Próximamente**: Configuración avanzada de HTTPS

### Seguridad de la API

**Próximamente**: Configuración de JWT y mejores prácticas de seguridad

### Configuración de CORS

**Próximamente**: Ajuste fino de las políticas de CORS

## Monitorización y registro

### Gestión de registros

**Próximamente**: Configuración de registro centralizado

### Monitorización del rendimiento

**Próximamente**: Integración con APM

### Seguimiento de errores

**Próximamente**: Integración con Sentry o similar

---

*Esta sección está en construcción. Vuelva a consultar para actualizaciones.*