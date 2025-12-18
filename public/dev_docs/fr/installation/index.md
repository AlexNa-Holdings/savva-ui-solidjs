# Installation Guide - Aperçu

Ce guide vous expliquera comment configurer votre propre réseau SAVVA depuis zéro. En suivant ces instructions, vous pourrez lancer une instance complète de SAVVA comprenant à la fois le serveur backend et l'interface utilisateur frontend.

## Ce que vous allez déployer

Un réseau SAVVA complet se compose de :

1. **Backend Server** - Serveur API écrit en Go qui gère :
   - Authentification des utilisateurs et gestion des sessions
   - Stockage et récupération des publications
   - Intégration IPFS
   - Gestion de la base de données
   - Connexions WebSocket
   - Interaction avec la blockchain

2. **UI Website** - Frontend basé sur SolidJS qui offre :
   - Interface utilisateur pour la création et la navigation de contenu
   - Intégration de portefeuilles Web3
   - Téléversement de fichiers sur IPFS
   - Interactions avec des smart contracts
   - Prise en charge multilingue

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

- **Server** : serveur Linux (Ubuntu 20.04+ recommandé)
- **Database** : PostgreSQL 14+ (ou service de base de données géré)
- **IPFS** : nœud IPFS local + service de pinning externe avec passerelle publique
- **Web Server** : Nginx ou Apache
- **Domain** : nom de domaine avec certificat SSL
- **Blockchain** : accès RPC à un réseau compatible Ethereum (WSS recommandé)

## Conformité de la licence

**Important** : Lors du déploiement de SAVVA, vous devez respecter la licence GPL-3.0 avec les Conditions supplémentaires SAVVA :

- Vous **devez** utiliser les contrats blockchain officiels de SAVVA
- Vous **ne pouvez pas** créer des jetons alternatifs
- Vous **ne pouvez pas** modifier ou remplacer les contrats officiels de SAVVA
- Vous **pouvez** introduire des contrats supplémentaires dans le système

Voir [Licence de l'UI](../licenses/ui.md) et [Licence du backend](../licenses/backend.md) pour plus de détails.

## Support

Si vous rencontrez des problèmes :
- Consultez [Dépannage](troubleshooting.md)
- Consultez les dépôts backend et UI
- Rejoignez la communauté SAVVA sur https://savva.app