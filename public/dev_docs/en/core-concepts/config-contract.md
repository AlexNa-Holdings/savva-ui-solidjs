# The Config Contract

The `Config` smart contract serves as the central, on-chain registry for all global system parameters in the SAVVA platform. Think of it as a decentralized key-value store that governs the behavior of all other contracts in the ecosystem.

A critical feature of the SAVVA platform is that the `Config` contract is controlled by the `Governance` contract. This means that any parameter can be changed through a community vote. Token holders can create proposals and vote to adjust fees, timelines, and other core mechanics, making the platform truly community-driven.

---

## How it Works

Parameters are stored and retrieved using `bytes32` keys. The frontend abstracts this away by providing a helper function, `getConfigParam`, which converts human-readable names (e.g., "min_staked_to_post") into the required on-chain format.

The contract has different functions for retrieving values based on their data type, primarily `getUInt` for numeric values and `getAddr` for contract addresses. The frontend automatically selects the correct function based on the parameter name.

---

## System Parameters

The following table details the global parameters currently managed by the `Config` contract.

| Name | Type | Units | Description |
| --- | --- | --- | --- |
| `authorShare` | Uint | percents * 100 | The author's share of the content fund (e.g., 100 = 1%). |
| `nftOwnerCut` | Uint | percents * 100 | The NFT owner's cut in percents * 100 (e.g., 100 = 1%). |
| `minContribution` | Uint | SAVVA | The minimum contribution to the content fund in SAVVA tokens. |
| `timeForRound` | Uint | seconds | The duration of a content fund round in seconds. |
| `winnerShare` | Uint | percents | The round prize's share of the fund in percents. |
| `minFundToShare` | Uint | SAVVA | The minimum fund amount required to share prizes, in SAVVA tokens. |
| `staking_withdraw_delay` | Uint | seconds | The staking cooldown period in seconds. |
| `contentNFT_mintPrice` | Uint | PLS | The price to mint a content NFT. |
| `pulsex_slippage` | Uint | percents | The slippage tolerance for PulseX swaps (reserve/amount min). |
| `min_staked_to_post` | Uint | SAVVA | The minimum staked SAVVA amount required to post content. |
| `sac_min_deposit` | Uint | PLS | The minimum deposit for the sacrifice phase. |
| `patron_payment_period` | Uint | seconds | The duration of a patron payment period in seconds. |
| `gov_proposal_price` | Uint | PLS | The price to create a new governance proposal. |
| `nft_auction_max_duration` | Uint | seconds | The maximum duration for an NFT auction in seconds. |
| `nft_auction_min_increment` | Uint | percents | The minimum bid increment for an NFT auction in percents. |
| `nft_auction_max_increment` | Uint | percents | The maximum bid increment for an NFT auction in percents. |
| `min_staked_for_nft_auction`| Uint | SAVVA | The minimum staked SAVVA required to create an NFT auction. |
| `authorsClubsGainReceiver` | Address | | The address that receives staking gains from Authors Clubs. |
| `min_staked_for_fundrasing` | Uint | SAVVA | The minimum staked SAVVA required to create a fundraiser. |
| `fundraising_bb_fee` | Uint | percents * 100 | The buyback fee for fundraisers in percents * 100 (e.g., 100 = 1%). |
| `contract_savvaToken` | Address | | SAVVA token contract address. |
| `contract_randomOracle` | Address | | Random oracle contract address (0 for none). |
| `contract_staking` | Address | | Staking contract address. |
| `contract_userProfile` | Address | | User Profile contract address. |
| `contract_contentNFT` | Address | | Content NFT contract address. |
| `contract_contentFund` | Address | | Content Fund contract address. |
| `contract_governance` | Address | | Governance contract address. |
| `contract_contentRegistry` | Address | | Content Registry contract address. |
| `contract_savvaFaucet` | Address | | SAVVA Faucet contract address. |
| `contract_nftMarketplace` | Address | | NFT Marketplace contract address. |
| `contract_promo` | Address | | Promo contract address. |
| `contract_buyBurn` | Address | | Buy & Burn contract address. |
| `contract_listMarket` | Address | | List Market contract address. |
| `contract_authorOfTheMonth` | Address | | Author of the Month contract address. |
| `pulsex_factory` | Address | | PulseX factory contract for Buy & Burn. |
| `pulsex_router` | Address | | PulseX router contract for Buy & Burn. |
| `WPLS` | Address | | Wrapped PLS (WPLS) contract address. |