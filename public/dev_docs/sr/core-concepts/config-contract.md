# Konfiguracioni Ugovor

`Config` pametan ugovor služi kao centralni, on-chain registar za sve globalne sistemske parametre na SAVVA platformi. Zamislite ga kao decentralizovanu skladišnu jedinicu ključeva i vrednosti koja upravlja ponašanjem svih drugih ugovora u ekosistemu.

Kritična karakteristika SAVVA platforme je da `Config` ugovor kontroliše `Governance` ugovor. To znači da se bilo koji parametar može promeniti putem glasanja zajednice. Vlasnici tokena mogu kreirati predloge i glasati za prilagođavanje taksi, vremenskih okvira i drugih osnovnih mehanizama, čineći platformu zaista vođenom od strane zajednice.

---

## Kako to funkcioniše

Parametri se čuvaju i preuzimaju koristeći `bytes32` ključeve. Frontend to apstrahuje pružanjem pomoćne funkcije, `getConfigParam`, koja konvertuje imena koja su čitljiva ljudima (npr., "min_staked_to_post") u potrebni on-chain format.

Ugovor ima različite funkcije za preuzimanje vrednosti na osnovu njihovog tipa podataka, prvenstveno `getUInt` za numeričke vrednosti i `getAddr` za adrese ugovora. Frontend automatski bira ispravnu funkciju na osnovu imena parametra.

---

## Sistemski Parametri

Sledeća tabela detaljno prikazuje globalne parametre koje trenutno upravlja `Config` ugovor.

| Ime | Tip | Jedinice | Opis |
| --- | --- | --- | --- |
| `authorShare` | Uint | procenat * 100 | Udeo autora u fondu sadržaja (npr., 100 = 1%). |
| `nftOwnerCut` | Uint | procenat * 100 | Udeo vlasnika NFT-a u procentima * 100 (npr., 100 = 1%). |
| `minContribution` | Uint | SAVVA | Minimalni doprinos fondu sadržaja u SAVVA tokenima. |
| `timeForRound` | Uint | sekunde | Trajanje runde fonda sadržaja u sekundama. |
| `winnerShare` | Uint | procenat | Udeo nagrade runde iz fonda u procentima. |
| `minFundToShare` | Uint | SAVVA | Minimalni iznos fonda potreban za deljenje nagrada, u SAVVA tokenima. |
| `staking_withdraw_delay` | Uint | sekunde | Period hlađenja za staking u sekundama. |
| `contentNFT_mintPrice` | Uint | PLS | Cena za mintovanje sadržajnog NFT-a. |
| `pulsex_slippage` | Uint | procenat | Tolerancija na klizanje za PulseX zamene (rezerva/minimalni iznos). |
| `min_staked_to_post` | Uint | SAVVA | Minimalni ulog SAVVA potreban za postavljanje sadržaja. |
| `sac_min_deposit` | Uint | PLS | Minimalni depozit za fazu žrtvovanja. |
| `patron_payment_period` | Uint | sekunde | Trajanje perioda plaćanja donatora u sekundama. |
| `gov_proposal_price` | Uint | PLS | Cena za kreiranje novog predloga za upravljanje. |
| `nft_auction_max_duration` | Uint | sekunde | Maksimalno trajanje za NFT aukciju u sekundama. |
| `nft_auction_min_increment` | Uint | procenat | Minimalno povećanje ponude za NFT aukciju u procentima. |
| `nft_auction_max_increment` | Uint | procenat | Maksimalno povećanje ponude za NFT aukciju u procentima. |
| `min_staked_for_nft_auction`| Uint | SAVVA | Minimalni ulog SAVVA potreban za kreiranje NFT aukcije. |
| `authorsClubsGainReceiver` | Adresa | | Adresa koja prima dobitke od stakinga iz Autorskih klubova. |
| `min_staked_for_fundrasing` | Uint | SAVVA | Minimalni ulog SAVVA potreban za kreiranje prikupljanja sredstava. |
| `fundraising_bb_fee` | Uint | procenat * 100 | Taksa za otkup za prikupljanje sredstava u procentima * 100 (npr., 100 = 1%). |
| `contract_savvaToken` | Adresa | | Adresa ugovora za SAVVA token. |
| `contract_randomOracle` | Adresa | | Adresa ugovora za nasumičnu orakulu (0 za nijednu). |
| `contract_staking` | Adresa | | Adresa ugovora za staking. |
| `contract_userProfile` | Adresa | | Adresa ugovora za korisnički profil. |
| `contract_contentNFT` | Adresa | | Adresa ugovora za sadržajni NFT. |
| `contract_contentFund` | Adresa | | Adresa ugovora za fond sadržaja. |
| `contract_governance` | Adresa | | Adresa ugovora za upravljanje. |
| `contract_contentRegistry` | Adresa | | Adresa ugovora za registar sadržaja. |
| `contract_savvaFaucet` | Adresa | | Adresa ugovora za SAVVA Faucet. |
| `contract_nftMarketplace` | Adresa | | Adresa ugovora za NFT tržište. |
| `contract_promo` | Adresa | | Adresa ugovora za promociju. |
| `contract_buyBurn` | Adresa | | Adresa ugovora za kupovinu i spaljivanje. |
| `contract_listMarket` | Adresa | | Adresa ugovora za tržište lista. |
| `contract_authorOfTheMonth` | Adresa | | Adresa ugovora za autora meseca. |
| `pulsex_factory` | Adresa | | PulseX fabrika ugovora za kupovinu i spaljivanje. |
| `pulsex_router` | Adresa | | PulseX ruter ugovora za kupovinu i spaljivanje. |
| `WPLS` | Adresa | | Adresa ugovora za Wrapped PLS (WPLS). |