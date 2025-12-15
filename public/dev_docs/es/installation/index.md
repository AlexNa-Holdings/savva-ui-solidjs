# Guía de instalación - Resumen

Esta guía te acompañará en la configuración de tu propia red SAVVA desde cero. Siguiendo estas instrucciones, podrás poner en marcha una instancia completa de SAVVA con el servidor backend y la interfaz de usuario (UI).

## Qué desplegarás

Una red SAVVA completa consiste en:

1. **Servidor backend** - Servidor API basado en Go que se encarga de:
   - Autenticación de usuarios y sesiones
   - Almacenamiento y recuperación de publicaciones
   - Integración con IPFS
   - Gestión de la base de datos
   - Conexiones WebSocket
   - Interacción con la blockchain

2. **Sitio web (UI)** - Frontend basado en SolidJS que proporciona:
   - Interfaz de usuario para la creación y navegación de contenido
   - Integración con billeteras Web3
   - Subida de archivos a IPFS
   - Interacciones con contratos inteligentes
   - Soporte multilingüe

3. **Contratos inteligentes** (Opcional) - Si lanzas una nueva red:
   - Contrato del token SAVVA
   - Contrato de staking
   - Contrato de gobernanza
   - Contrato NFT de contenido
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
5. Deployment
   ↓
6. Testing & Verification
```

## Resumen de requisitos

- **Servidor**: Servidor Linux (se recomienda Ubuntu 20.04+)
- **Base de datos**: PostgreSQL 14+ (o servicio de base de datos gestionado)
- **IPFS**: Nodo IPFS local + servicio de pinning externo con gateway público
- **Servidor web**: Nginx o Apache
- **Dominio**: Nombre de dominio con certificado SSL
- **Blockchain**: Acceso RPC a una red compatible con Ethereum (se recomienda WSS)

## Cumplimiento de licencia

**Importante**: Al desplegar SAVVA, debes cumplir con la licencia GPL-3.0 y los Términos Adicionales de SAVVA:

- **Debes** usar los contratos oficiales de blockchain de SAVVA
- **No puedes** crear tokens alternativos
- **No puedes** modificar o reemplazar los contratos oficiales de SAVVA
- **Puedes** introducir contratos adicionales en el sistema

Consulta [Licencia de la UI](../licenses/ui.md) y [Licencia del backend](../licenses/backend.md) para más detalles.

## Soporte

Si encuentras problemas:
- Consulta [Solución de problemas](troubleshooting.md)
- Revisa los repositorios del backend y de la UI
- Únete a la comunidad SAVVA en https://savva.app