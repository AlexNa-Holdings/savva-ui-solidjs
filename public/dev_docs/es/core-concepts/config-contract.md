# El contrato Config

El contrato inteligente `Config` sirve como el registro central en la cadena para todos los parámetros globales del sistema en la plataforma SAVVA. Piénsalo como un almacén descentralizado de pares clave-valor que gobierna el comportamiento de todos los demás contratos del ecosistema.

Una característica crítica de la plataforma SAVVA es que el contrato `Config` está controlado por el contrato `Governance`. Esto significa que cualquier parámetro puede modificarse mediante una votación comunitaria. Los poseedores de tokens pueden crear propuestas y votar para ajustar tarifas, plazos y otras mecánicas centrales, haciendo que la plataforma sea verdaderamente impulsada por la comunidad.

---

## Cómo funciona

Los parámetros se almacenan y recuperan usando claves `bytes32`. El frontend abstrae esto proporcionando una función auxiliar, `getConfigParam`, que convierte nombres legibles por humanos (p. ej., "min_staked_to_post") al formato requerido en la cadena.

El contrato dispone de diferentes funciones para recuperar valores según su tipo de dato, principalmente `getUInt` para valores numéricos y `getAddr` para direcciones de contratos. El frontend selecciona automáticamente la función correcta según el nombre del parámetro.

---

## Parámetros del sistema

La siguiente tabla detalla los parámetros globales gestionados actualmente por el contrato `Config`.

| Nombre | Tipo | Unidades | Descripción |
| --- | --- | --- | --- |
| `authorShare` | Uint | porcentajes * 100 | La participación del autor en el fondo de contenido (p. ej., 100 = 1%). |
| `nftOwnerCut` | Uint | porcentajes * 100 | La participación del propietario del NFT en porcentajes * 100 (p. ej., 100 = 1%). |
| `minContribution` | Uint | SAVVA | La contribución mínima al fondo de contenido en tokens SAVVA. |
| `timeForRound` | Uint | segundos | La duración de una ronda del fondo de contenido en segundos. |
| `winnerShare` | Uint | porcentajes | La participación del premio de la ronda en el fondo en porcentajes. |
| `minFundToShare` | Uint | SAVVA | La cantidad mínima de fondo requerida para repartir premios, en tokens SAVVA. |
| `staking_withdraw_delay` | Uint | segundos | El período de espera para retiros de staking en segundos. |
| `contentNFT_mintPrice` | Uint | PLS | El precio para acuñar un NFT de contenido. |
| `pulsex_slippage` | Uint | porcentajes | La tolerancia de slippage para intercambios en PulseX (reserva/cantidad mínima). |
| `min_staked_to_post` | Uint | SAVVA | La cantidad mínima de SAVVA en stake requerida para publicar contenido. |
| `sac_min_deposit` | Uint | PLS | El depósito mínimo para la fase de sacrificio. |
| `patron_payment_period` | Uint | segundos | La duración de un período de pago de mecenas en segundos. |
| `gov_proposal_price` | Uint | PLS | El precio para crear una nueva propuesta de gobernanza. |
| `nft_auction_max_duration` | Uint | segundos | La duración máxima de una subasta NFT en segundos. |
| `nft_auction_min_increment` | Uint | porcentajes | El incremento mínimo de puja para una subasta NFT en porcentajes. |
| `nft_auction_max_increment` | Uint | porcentajes | El incremento máximo de puja para una subasta NFT en porcentajes. |
| `min_staked_for_nft_auction`| Uint | SAVVA | La cantidad mínima de SAVVA en stake requerida para crear una subasta NFT. |
| `authorsClubsGainReceiver` | Address | | La dirección que recibe las ganancias de staking de los Authors Clubs. |
| `min_staked_for_fundrasing` | Uint | SAVVA | La cantidad mínima de SAVVA en stake requerida para crear una recaudación de fondos. |
| `fundraising_bb_fee` | Uint | porcentajes * 100 | La tarifa de recompra para recaudaciones en porcentajes * 100 (p. ej., 100 = 1%). |
| `contract_savvaToken` | Address | | Dirección del contrato del token SAVVA. |
| `contract_randomOracle` | Address | | Dirección del contrato de oráculo aleatorio (0 si no hay). |
| `contract_staking` | Address | | Dirección del contrato de staking. |
| `contract_userProfile` | Address | | Dirección del contrato de Perfil de Usuario. |
| `contract_contentNFT` | Address | | Dirección del contrato de NFT de contenido. |
| `contract_contentFund` | Address | | Dirección del contrato del Fondo de Contenido. |
| `contract_governance` | Address | | Dirección del contrato de Gobernanza. |
| `contract_contentRegistry` | Address | | Dirección del contrato de Registro de Contenido. |
| `contract_savvaFaucet` | Address | | Dirección del contrato SAVVA Faucet. |
| `contract_nftMarketplace` | Address | | Dirección del contrato del Marketplace de NFT. |
| `contract_promo` | Address | | Dirección del contrato Promo. |
| `contract_buyBurn` | Address | | Dirección del contrato Buy & Burn. |
| `contract_listMarket` | Address | | Dirección del contrato List Market. |
| `contract_authorOfTheMonth` | Address | | Dirección del contrato Autor del Mes. |
| `pulsex_factory` | Address | | Dirección del contrato factory de PulseX para Buy & Burn. |
| `pulsex_router` | Address | | Dirección del contrato router de PulseX para Buy & Burn. |
| `WPLS` | Address | | Dirección del contrato Wrapped PLS (WPLS). |