# Guide d'installation - Aperçu

Ce guide vous expliquera comment configurer votre propre réseau SAVVA depuis zéro. En suivant ces instructions, vous pourrez lancer une instance complète de SAVVA comprenant à la fois le serveur backend et l'interface frontend.

## Ce que vous déploierez

Un réseau SAVVA complet se compose de :

1. **Serveur Backend** - Serveur API basé sur Go qui gère :
   - Authentification des utilisateurs et sessions
   - Stockage et récupération des posts
   - Intégration IPFS
   - Gestion de la base de données
   - Connexions WebSocket
   - Interaction avec la blockchain

2. **Site UI** - Frontend basé sur SolidJS qui fournit :
   - Interface utilisateur pour la création et la navigation de contenu
   - Intégration de portefeuilles Web3
   - Téléversements de fichiers vers IPFS
   - Interactions avec des contrats intelligents
   - Support multilingue
   - SEO : HTML rendu côté serveur pour les moteurs de recherche (Google, Bing, Yandex, Baidu, DuckDuckGo, Apple), les crawlers IA (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, ...), et les générateurs d'aperçu de liens (Telegram, X, Facebook, Discord, Slack, WhatsApp, ...), avec par domaine `robots.txt` et sitemaps

3. **Contrats intelligents** :
   - Contrat du token SAVVA
   - Contrat de staking
   - Contrat de gouvernance
   - Contrat NFT de contenu
   - Et d'autres...

## Flux d'installation

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

## Aperçu des exigences

- **Serveur** : Serveur Linux (Ubuntu 20.04+ recommandé)
- **Base de données** : PostgreSQL 14+ (ou service de base de données géré)
- **IPFS** : Nœud IPFS local + service de pinning externe avec passerelle publique
- **Serveur Web** : Nginx ou Apache
- **Domaine** : Nom de domaine avec certificat SSL
- **Blockchain** : Accès RPC à un réseau compatible Ethereum (recommandé : `WSS`)

## Conformité de licence

**Important** : Lors du déploiement de SAVVA, vous devez respecter la licence GPL-3.0 avec les Conditions supplémentaires de SAVVA :

- Vous **devez** utiliser les contrats blockchain officiels de SAVVA
- Vous **ne pouvez pas** créer des tokens alternatifs
- Vous **ne pouvez pas** modifier ou remplacer les contrats officiels de SAVVA
- Vous **pouvez** introduire des contrats additionnels dans le système

Voir [Licence UI](../licenses/ui.md) et [Licence du backend](../licenses/backend.md) pour les détails.

## Support

Si vous rencontrez des problèmes :
- Consultez [Dépannage](troubleshooting.md)
- Vérifiez les dépôts du backend et de l'UI
- Rejoignez la communauté SAVVA sur https://savva.app