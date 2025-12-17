# El contrato Config

El contrato inteligente `Config` sirve como el registro central en cadena para todos los parámetros globales del sistema en la plataforma SAVVA. Piénsalo como un almacén descentralizado de clave-valor que gobierna el comportamiento de todos los demás contratos en el ecosistema.

Una característica crítica de la plataforma SAVVA es que el contrato `Config` está controlado por el contrato `Governance`. Esto significa que cualquier parámetro puede ser cambiado mediante una votación comunitaria. Los poseedores de tokens pueden crear propuestas y votar para ajustar tarifas, plazos y otras mecánicas centrales, haciendo que la plataforma sea verdaderamente gobernada por la comunidad.

---

## Cómo funciona

Los parámetros se almacenan y recuperan usando claves `bytes32`. El frontend abstrae esto proporcionando una función auxiliar, `getConfigParam`, que convierte nombres legibles por humanos (p. ej., "min_staked_to_post") al formato requerido en cadena.

El contrato tiene diferentes funciones para recuperar valores según su tipo de dato, principalmente `getUInt` para valores numéricos y `getAddr` para direcciones de contratos. El frontend selecciona automáticamente la función correcta según el nombre del parámetro.

---

## Parámetros del sistema

La siguiente tabla detalla los parámetros globales que actualmente gestiona el contrato `Config`.

| Nombre | Tipo | Unidades | Descripción |
| --- | --- | --- | --- |
| `authorShare` | Uint | porcientos * 100 | La parte del autor del fondo de contenido (p. ej., 100 = 1%). |
| `nftOwnerCut` | Uint | porcientos * 100 | La parte del propietario del NFT en porcientos * 100 (p. ej., 100 = 1%). |
| `minContribution` | Uint | SAVVA | La contribución mínima al fondo de contenido en tokens SAVVA. |
| `timeForRound` | Uint | segundos | La duración de una ronda del fondo de contenido en segundos. |
| `winnerShare` | Uint | porcientos | La porción del premio de la ronda del fondo en porcientos. |
| `minFundToShare` | Uint | SAVVA | La cantidad mínima del fondo requerida para repartir premios, en tokens SAVVA. |
| `staking_withdraw_delay` | Uint | segundos | El período de enfriamiento (cooldown) de staking en segundos. |
| `contentNFT_mintPrice` | Uint | PLS | El precio para acuñar un NFT de contenido. |
| `pulsex_slippage` | Uint | porcientos | La tolerancia de deslizamiento para swaps en PulseX (reserva/importe mínimo). |
| `min_staked_to_post` | Uint | SAVVA | La cantidad mínima de SAVVA en stake requerida para publicar contenido. |
| `sac_min_deposit` | Uint | PLS | El depósito mínimo para la fase de sacrificio. |
| `patron_payment_period` | Uint | segundos | La duración de un período de pago de patrocinador en segundos. |
| `gov_proposal_price` | Uint | PLS | El precio para crear una nueva propuesta de gobernanza. |
| `nft_auction_max_duration` | Uint | segundos | La duración máxima para una subasta de NFT en segundos. |
| `nft_auction_min_increment` | Uint | porcientos | El incremento mínimo de puja para una subasta de NFT en porcientos. |
| `nft_auction_max_increment` | Uint | porcientos | El incremento máximo de puja para una subasta de NFT en porcientos. |
| `min_staked_for_nft_auction`| Uint | SAVVA | La cantidad mínima de SAVVA en stake requerida para crear una subasta de NFT. |
| `authorsClubsGainReceiver` | Address | | La dirección que recibe las ganancias de staking de Authors Clubs. |
| `min_staked_for_fundrasing` | Uint | SAVVA | La cantidad mínima de SAVVA en stake requerida para crear una recaudación de fondos. |
| `fundraising_bb_fee` | Uint | porcientos * 100 | La tarifa de buyback para recaudaciones de fondos en porcientos * 100 (p. ej., 100 = 1%). |
| `contract_savvaToken` | Address | | Dirección del contrato del token SAVVA. |
| `contract_randomOracle` | Address | | Dirección del contrato del oráculo aleatorio (0 para ninguno). |
| `contract_staking` | Address | | Dirección del contrato de staking. |
| `contract_userProfile` | Address | | Dirección del contrato de Perfil de Usuario. |
| `contract_contentNFT` | Address | | Dirección del contrato de Content NFT. |
| `contract_contentFund` | Address | | Dirección del contrato del Content Fund. |
| `contract_governance` | Address | | Dirección del contrato de Governance. |
| `contract_contentRegistry` | Address | | Dirección del contrato del Content Registry. |
| `contract_savvaFaucet` | Address | | Dirección del contrato del SAVVA Faucet. |
| `contract_nftMarketplace` | Address | | Dirección del contrato del NFT Marketplace. |
| `contract_promo` | Address | | Dirección del contrato de Promo. |
| `contract_buyBurn` | Address | | Dirección del contrato de Buy & Burn. |
| `contract_listMarket` | Address | | Dirección del contrato de List Market. |
| `contract_authorOfTheMonth` | Address | | Dirección del contrato Author of the Month. |
| `pulsex_factory` | Address | | Contrato factory de PulseX para Buy & Burn. |
| `pulsex_router` | Address | | Contrato router de PulseX para Buy & Burn. |
| `WPLS` | Address | | Dirección del contrato Wrapped PLS (WPLS). |