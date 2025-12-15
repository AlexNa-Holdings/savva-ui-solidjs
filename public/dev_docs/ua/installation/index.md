# Посібник з встановлення — Огляд

Цей посібник проведе вас крок за кроком по налаштуванню власної мережі SAVVA з нуля. Дотримуючись цих інструкцій, ви зможете запустити повноцінний екземпляр SAVVA з серверною частиною (бекенд) і фронтенд‑інтерфейсом.

## Що ви розгорнете

Повна мережа SAVVA складається з:

1. **Backend Server** - Go-based API server that handles:
   - User authentication and sessions
   - Post storage and retrieval
   - IPFS integration
   - Database management
   - WebSocket connections
   - Blockchain interaction

2. **UI Website** - SolidJS-based frontend that provides:
   - User interface for content creation and browsing
   - Web3 wallet integration
   - IPFS file uploads
   - Smart contract interactions
   - Multi-language support

3. **Smart Contracts** (Optional) - If launching a new network:
   - SAVVA Token contract
   - Staking contract
   - Governance contract
   - Content NFT contract
   - And others...

## Installation Flow

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

## Огляд вимог

- **Server**: Linux server (Ubuntu 20.04+ recommended)
- **Database**: PostgreSQL 14+ (or managed database service)
- **IPFS**: Local IPFS node + external pinning service with public gateway
- **Web Server**: Nginx or Apache
- **Domain**: Domain name with SSL certificate
- **Blockchain**: RPC access to Ethereum-compatible network (WSS recommended)

## Дотримання ліцензії

**Важливо**: При розгортанні SAVVA ви повинні дотримуватися ліцензії GPL-3.0 з додатковими умовами SAVVA:

- Ви **повинні** використовувати офіційні контракти блокчейна SAVVA
- Ви **не можете** створювати альтернативні токени
- Ви **не можете** змінювати або замінювати офіційні контракти SAVVA
- Ви **можете** додавати додаткові контракти до системи

Див. [Ліцензія UI](../licenses/ui.md) та [Ліцензія бекенду](../licenses/backend.md) для деталей.

## Підтримка

Якщо у вас виникли проблеми:
- Перевірте [Усунення неполадок](troubleshooting.md)
- Перегляньте репозиторії бекенду та UI
- Приєднуйтесь до спільноти SAVVA на https://savva.app