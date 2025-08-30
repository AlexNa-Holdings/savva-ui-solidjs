# Le Contrat de Configuration

Le contrat intelligent `Config` sert de registre central, sur la chaîne, pour tous les paramètres globaux du système sur la plateforme SAVVA. Pensez-y comme à un magasin de clés-valeurs décentralisé qui régit le comportement de tous les autres contrats de l'écosystème.

Une caractéristique essentielle de la plateforme SAVVA est que le contrat `Config` est contrôlé par le contrat `Governance`. Cela signifie que tout paramètre peut être modifié par un vote de la communauté. Les détenteurs de jetons peuvent créer des propositions et voter pour ajuster les frais, les délais et d'autres mécanismes fondamentaux, rendant la plateforme véritablement dirigée par la communauté.

---

## Comment ça fonctionne

Les paramètres sont stockés et récupérés à l'aide de clés `bytes32`. Le frontend abstrait cela en fournissant une fonction d'aide, `getConfigParam`, qui convertit les noms lisibles par l'homme (par exemple, "min_staked_to_post") dans le format requis sur la chaîne.

Le contrat a différentes fonctions pour récupérer des valeurs en fonction de leur type de données, principalement `getUInt` pour les valeurs numériques et `getAddr` pour les adresses de contrat. Le frontend sélectionne automatiquement la fonction correcte en fonction du nom du paramètre.

---

## Paramètres du Système

Le tableau suivant détaille les paramètres globaux actuellement gérés par le contrat `Config`.

| Nom | Type | Unités | Description |
| --- | --- | --- | --- |
| `authorShare` | Uint | pourcent * 100 | La part de l'auteur dans le fonds de contenu (par exemple, 100 = 1 %). |
| `nftOwnerCut` | Uint | pourcent * 100 | La part du propriétaire de l'NFT en pourcent * 100 (par exemple, 100 = 1 %). |
| `minContribution` | Uint | SAVVA | La contribution minimale au fonds de contenu en jetons SAVVA. |
| `timeForRound` | Uint | secondes | La durée d'un tour de fonds de contenu en secondes. |
| `winnerShare` | Uint | pourcent | La part du prix du tour dans le fonds en pourcent. |
| `minFundToShare` | Uint | SAVVA | Le montant minimum de fonds requis pour partager des prix, en jetons SAVVA. |
| `staking_withdraw_delay` | Uint | secondes | La période de refroidissement du staking en secondes. |
| `contentNFT_mintPrice` | Uint | PLS | Le prix pour frapper un NFT de contenu. |
| `pulsex_slippage` | Uint | pourcent | La tolérance de glissement pour les échanges PulseX (réserve/montant min). |
| `min_staked_to_post` | Uint | SAVVA | Le montant minimum de SAVVA staké requis pour publier du contenu. |
| `sac_min_deposit` | Uint | PLS | Le dépôt minimum pour la phase de sacrifice. |
| `patron_payment_period` | Uint | secondes | La durée d'une période de paiement de mécène en secondes. |
| `gov_proposal_price` | Uint | PLS | Le prix pour créer une nouvelle proposition de gouvernance. |
| `nft_auction_max_duration` | Uint | secondes | La durée maximale d'une enchère NFT en secondes. |
| `nft_auction_min_increment` | Uint | pourcent | L'augmentation minimale des enchères pour une enchère NFT en pourcent. |
| `nft_auction_max_increment` | Uint | pourcent | L'augmentation maximale des enchères pour une enchère NFT en pourcent. |
| `min_staked_for_nft_auction`| Uint | SAVVA | Le montant minimum de SAVVA staké requis pour créer une enchère NFT. |
| `authorsClubsGainReceiver` | Address | | L'adresse qui reçoit les gains de staking des Clubs d'Auteurs. |
| `min_staked_for_fundrasing` | Uint | SAVVA | Le montant minimum de SAVVA staké requis pour créer une collecte de fonds. |
| `fundraising_bb_fee` | Uint | pourcent * 100 | Les frais de rachat pour les collectes de fonds en pourcent * 100 (par exemple, 100 = 1 %). |
| `contract_savvaToken` | Address | | Adresse du contrat de jeton SAVVA. |
| `contract_randomOracle` | Address | | Adresse du contrat d'oracle aléatoire (0 pour aucun). |
| `contract_staking` | Address | | Adresse du contrat de staking. |
| `contract_userProfile` | Address | | Adresse du contrat de profil utilisateur. |
| `contract_contentNFT` | Address | | Adresse du contrat de NFT de contenu. |
| `contract_contentFund` | Address | | Adresse du contrat de fonds de contenu. |
| `contract_governance` | Address | | Adresse du contrat de gouvernance. |
| `contract_contentRegistry` | Address | | Adresse du contrat de registre de contenu. |
| `contract_savvaFaucet` | Address | | Adresse du contrat de robinet SAVVA. |
| `contract_nftMarketplace` | Address | | Adresse du contrat de marché NFT. |
| `contract_promo` | Address | | Adresse du contrat de promotion. |
| `contract_buyBurn` | Address | | Adresse du contrat d'achat et de brûlage. |
| `contract_listMarket` | Address | | Adresse du contrat de marché de liste. |
| `contract_authorOfTheMonth` | Address | | Adresse du contrat de l'Auteur du Mois. |
| `pulsex_factory` | Address | | Contrat de la fabrique PulseX pour l'achat et le brûlage. |
| `pulsex_router` | Address | | Contrat du routeur PulseX pour l'achat et le brûlage. |
| `WPLS` | Address | | Adresse du contrat Wrapped PLS (WPLS). |