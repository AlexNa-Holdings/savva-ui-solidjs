# Guía de instalación - Resumen

Esta guía te llevará paso a paso para configurar tu propia red SAVVA desde cero. Siguiendo estas instrucciones, podrás lanzar una instancia completa de SAVVA con el servidor backend y la interfaz frontend.

## Qué desplegarás

Una red SAVVA completa consiste en:

1. **Servidor Backend** - Servidor API basado en Go que gestiona:
   - Autenticación de usuarios y sesiones
   - Almacenamiento y recuperación de publicaciones
   - Integración con IPFS
   - Gestión de la base de datos
   - Conexiones WebSocket
   - Interacción con la blockchain

2. **Sitio web de la UI** - Frontend basado en SolidJS que proporciona:
   - Interfaz de usuario para creación y navegación de contenido
   - Integración de billeteras Web3
   - Subida de archivos a IPFS
   - Interacciones con contratos inteligentes
   - Soporte multilenguaje

3. **Contratos inteligentes** :
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

- **Servidor**: Linux (se recomienda Ubuntu 20.04+)
- **Base de datos**: PostgreSQL 14+ (o servicio de base de datos gestionado)
- **IPFS**: Nodo IPFS local + servicio de pinning externo con gateway público
- **Servidor web**: Nginx o Apache
- **Dominio**: Nombre de dominio con certificado SSL
- **Blockchain**: Acceso RPC a una red compatible con Ethereum (se recomienda WSS)

## Cumplimiento de la licencia

**Importante**: Al desplegar SAVVA, debes cumplir con la licencia GPL-3.0 con los Términos adicionales de SAVVA:

- Debes usar los contratos oficiales de la blockchain SAVVA
- No puedes crear tokens alternativos
- No puedes modificar o reemplazar los contratos oficiales de SAVVA
- Puedes introducir contratos adicionales en el sistema

Consulta [Licencia de la UI](../licenses/ui.md) y [Licencia del backend](../licenses/backend.md) para más detalles.

## Soporte

Si encuentras problemas:
- Revisa [Solución de problemas](troubleshooting.md)
- Revisa los repositorios del backend y de la UI
- Únete a la comunidad SAVVA en https://savva.app