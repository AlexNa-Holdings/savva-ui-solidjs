# Guide d'installation - Vue d'ensemble

Ce guide vous accompagnera pour configurer votre propre réseau SAVVA depuis zéro. En suivant ces instructions, vous pourrez lancer une instance SAVVA complète avec à la fois le serveur backend et l'interface utilisateur frontend.

## Ce que vous allez déployer

Un réseau SAVVA complet se compose de :

1. **Backend Server** - Serveur API écrit en Go qui gère :
   - Authentification des utilisateurs et sessions
   - Stockage et récupération des posts
   - Intégration IPFS
   - Gestion de la base de données
   - Connexions WebSocket
   - Interaction avec la blockchain

2. **UI Website** - Frontend basé sur SolidJS qui fournit :
   - Interface utilisateur pour la création et la navigation de contenu
   - Intégration de portefeuilles Web3
   - Téléversements de fichiers sur IPFS
   - Interactions avec les contrats intelligents
   - Support multilingue

3. **Smart Contracts** (Optionnel) - Si vous lancez un nouveau réseau :
   - Contrat de token SAVVA
   - Contrat de staking
   - Contrat de gouvernance
   - Contrat NFT pour le contenu
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
5. Deployment
   ↓
6. Testing & Verification
```

## Aperçu des exigences

- **Server** : Serveur Linux (Ubuntu 20.04+ recommandé)
- **Database** : PostgreSQL 14+ (ou service de base de données géré)
- **IPFS** : Nœud IPFS local + service de pinning externe avec passerelle publique
- **Web Server** : Nginx ou Apache
- **Domain** : Nom de domaine avec certificat SSL
- **Blockchain** : Accès RPC à un réseau compatible Ethereum (WSS recommandé)

## Conformité de licence

**Important** : Lors du déploiement de SAVVA, vous devez respecter la licence GPL-3.0 avec les Termes additionnels SAVVA :

- Vous **devez** utiliser les contrats blockchain officiels SAVVA
- Vous **ne pouvez pas** créer de tokens alternatifs
- Vous **ne pouvez pas** modifier ou remplacer les contrats officiels SAVVA
- Vous **pouvez** introduire des contrats supplémentaires dans le système

Voir [Licence de l'interface utilisateur](../licenses/ui.md) et [Licence du backend](../licenses/backend.md) pour les détails.

## Support

En cas de problème :
- Consultez le [Dépannage](troubleshooting.md)
- Passez en revue les dépôts backend et UI
- Rejoignez la communauté SAVVA sur https://savva.app