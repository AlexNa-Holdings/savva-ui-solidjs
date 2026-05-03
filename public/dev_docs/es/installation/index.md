# Guía de instalación - Descripción general

Esta guía te mostrará cómo configurar tu propia red SAVVA desde cero. Siguiendo estas instrucciones, podrás lanzar una instancia completa de SAVVA con el servidor backend y la interfaz frontend.

## Qué desplegarás

Una red SAVVA completa consiste en:

1. **Servidor Backend** - servidor API basado en Go que se encarga de:
   - Autenticación de usuarios y sesiones
   - Almacenamiento y recuperación de publicaciones
   - Integración con IPFS
   - Gestión de base de datos
   - Conexiones WebSocket
   - Interacción con la blockchain

2. **Sitio web UI** - frontend basado en SolidJS que proporciona:
   - Interfaz de usuario para la creación y navegación de contenido
   - Integración con wallets Web3
   - Subida de archivos a IPFS
   - Interacciones con smart contracts
   - Soporte multilingüe
   - Superficie SEO: HTML renderizado en el servidor para motores de búsqueda (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple), rastreadores de IA (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, ...), y previsualizadores de enlaces (Telegram, X, Facebook, Discord, Slack, WhatsApp, ...), con `robots.txt` por dominio y sitemaps

3. **Contratos inteligentes**:
   - Contrato del token SAVVA
   - Contrato de staking
   - Contrato de gobernanza
   - Contrato de NFT de contenido
   - Y otros...

## Flujo de instalación

```
1. Prerequisites Setup
   ↓
2. Backend Server Installation
   ↓
3. UI Website Setup
   ↓
4. Configuration
   ↓
5. Testing & Verification
```

## Resumen de requisitos

- **Servidor**: servidor Linux (se recomienda Ubuntu 20.04+)
- **Base de datos**: PostgreSQL 14+ (o servicio de base de datos gestionado)
- **IPFS**: nodo IPFS local + servicio de pinning externo con gateway público
- **Servidor web**: Nginx o Apache
- **Dominio**: nombre de dominio con certificado SSL
- **Blockchain**: acceso RPC a una red compatible con Ethereum (se recomienda WSS)

## Cumplimiento de la licencia

**Importante**: Al desplegar SAVVA, debes cumplir con la licencia GPL-3.0 con los Términos Adicionales de SAVVA:

- **Debes** usar los contratos oficiales de la blockchain SAVVA
- **No puedes** crear tokens alternativos
- **No puedes** modificar o reemplazar los contratos oficiales de SAVVA
- **Puedes** introducir contratos adicionales en el sistema

Consulta [UI License](../licenses/ui.md) y [Backend License](../licenses/backend.md) para más detalles.

## Soporte

Si encuentras problemas:
- Consulta [Resolución de problemas](troubleshooting.md)
- Revisa los repositorios del backend y la UI
- Únete a la comunidad SAVVA en https://savva.app