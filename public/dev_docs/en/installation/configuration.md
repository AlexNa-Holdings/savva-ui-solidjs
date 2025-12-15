# Configuration

Advanced configuration options for your SAVVA installation.

## Overview

This document covers advanced configuration beyond the basic setup.

## Telegram Bot Setup

SAVVA supports Telegram bot integration for user authentication and notifications. Each domain can have its own Telegram bot.

### Creating a Telegram Bot

1. **Open Telegram** and search for `@BotFather`

2. **Create a new bot**:
   - Send `/newbot` to BotFather
   - Enter a display name for your bot (e.g., "SAVVA Network")
   - Enter a username for your bot (must end with `bot`, e.g., `savva_network_bot`)

3. **Save the bot token**:
   - BotFather will provide an API token like: `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Keep this token secure - anyone with this token can control your bot

4. **Configure bot settings** (optional but recommended):
   - Send `/setdescription` - add a description of your SAVVA instance
   - Send `/setabouttext` - add info shown in bot profile
   - Send `/setuserpic` - upload your network's logo as bot avatar

### Backend Configuration

Add the Telegram bot settings to your `/etc/savva.yml`:

```yaml
# Telegram Bot Configuration
telegram:
  bot-token: "7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Register Webhook

After configuring the backend, you need to register the webhook URL with Telegram. This tells Telegram where to send updates when users interact with your bot:

```bash
curl -F "url=https://yourdomain/api/telegram-bot/yourdomain" \
  https://api.telegram.org/bot7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/setWebhook
```

Replace:
- `yourdomain` with your actual domain (appears twice in the URL)
- `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` with your bot token

**Expected response:**
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Verify webhook status:**
```bash
curl https://api.telegram.org/bot<your_bot_token>/getWebhookInfo
```

### How It Works

Once configured, users can:
- Link their Telegram account to their SAVVA profile
- Receive notifications about new followers, comments, and mentions
- Use Telegram as an additional authentication method

### Security Notes

- Never share your bot token publicly
- The bot token in `savva.yml` should have restricted file permissions (`chmod 600`)
- Consider using environment variables for the token in production:
  ```yaml
  telegram:
    bot-token: ${TELEGRAM_BOT_TOKEN}
  ```

## Backend Configuration

### Database Tuning

**Coming soon**: PostgreSQL optimization for high-traffic instances

### IPFS Configuration

**Coming soon**: IPFS pinning strategies and gateway optimization

### Caching

**Coming soon**: Redis integration for session caching

### Rate Limiting

**Coming soon**: API rate limiting configuration

## UI Configuration

### Branding

**Coming soon**: How to customize colors, logos, and branding

### Feature Flags

**Coming soon**: Enabling/disabling specific features

### Analytics

**Coming soon**: Integrating analytics tools

## Blockchain Configuration

### Custom Networks

**Coming soon**: Connecting to custom EVM networks

### Contract Configuration

**Coming soon**: Advanced contract interaction settings

## Performance Optimization

### CDN Setup

**Coming soon**: Optimizing asset delivery

### Database Indexes

**Coming soon**: Database optimization queries

### Caching Strategies

**Coming soon**: Backend and frontend caching

## Security Configuration

### SSL/TLS

**Coming soon**: Advanced HTTPS configuration

### API Security

**Coming soon**: JWT configuration and security best practices

### CORS Settings

**Coming soon**: Fine-tuning CORS policies

## Monitoring & Logging

### Log Management

**Coming soon**: Centralized logging setup

### Performance Monitoring

**Coming soon**: APM integration

### Error Tracking

**Coming soon**: Sentry or similar integration

---

*This section is under construction. Check back for updates.*
