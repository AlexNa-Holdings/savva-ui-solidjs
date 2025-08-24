# Web3 Authorization Flow

SAVVA platform koristi metodu autentifikacije bez lozinke zasnovanu na Web3. Korisnici se mogu "prijaviti" koristeći bilo koji EVM-kompatibilni novčanik jednostavno potpisujući jedinstvenu poruku koju pruža server. Ovaj proces verifikuje vlasništvo nad adresom i uspostavlja sigurnu sesiju koju upravlja kolačić u pretraživaču.

## Pregled toka

Proces autorizacije uključuje niz koraka koji se orkestriraju između frontend-a, korisničkog novčanika, blockchain-a i SAVVA backend-a.

1.  **Priprema jedinstvene poruke**: Frontend konstruira jedinstvenu poruku koju korisnik treba da potpiše. Ova poruka se sastoji od dva dela: dinamičke vrednosti iz pametnog ugovora i statične vrednosti iz backend-a.
2.  **Korisnik potpisuje poruku**: Korisnik dobija zahtev od svog novčanika (npr. MetaMask) da potpiše pripremljenu poruku.
3.  **Backend autentifikacija**: Frontend šalje korisničku adresu i dobijeni potpis backend-u na `/auth` endpoint.
4.  **Kolačić sesije**: Ako je potpis validan, backend odgovara sa `Set-Cookie` zaglavljem, uspostavljajući autentifikovanu sesiju.
5.  **Autentifikovani zahtevi**: Svi naredni API i WebSocket zahtevi iz pretraživača će sada automatski uključivati ovaj kolačić, identifikujući korisnika.
6.  **Preuzimanje korisničkog profila**: Kada je autentifikovan, frontend pravi WebSocket poziv na `/get-user` da preuzme potpune detalje korisničkog profila, kao što su njihov avatar i ime.

---

## Implementacija korak po korak

### 1. Priprema poruke za potpisivanje

Da bi se sprečili napadi ponovnog korišćenja i osiguralo da je svaki zahtev za prijavu jedinstven, poruka koja treba da se potpiše konstruisana je iz dva izvora:

-   Dinamički **`auth_modifier`** string pročitan iz `UserProfile` pametnog ugovora.
-   Statični **`auth_text_to_sign`** string koji pruža backend na `/info` endpoint.

Frontend prvo poziva `getString` funkciju na `UserProfile` ugovoru:

```javascript
// From: src/blockchain/auth.js

// Dobijanje instance UserProfile ugovora
const userProfileContract = await getSavvaContract(app, 'UserProfile');

// Priprema argumenata za poziv ugovora
const domainHex = toHexBytes32(""); // Domen je prazan za globalni modifikator
const keyHex = toHexBytes32("auth_modifier");

// Preuzimanje modifikatora (vraća bytes32 hex string)
const modifierHex = await userProfileContract.read.getString([
  account,      // Korisnička adresa
  domainHex,    // bytes32 reprezentacija ""
  keyHex        // bytes32 reprezentacija "auth_modifier"
]);

// Konvertovanje hex vrednosti u čitljiv string
const modifierString = hexToString(modifierHex, { size: 32 });
```

Zatim kombinuje ovaj `modifierString` sa tekstom sa `/info`:

```javascript
// Dobijanje teksta iz već učitanog /info odgovora
const textToSign = app.info().auth_text_to_sign;

// Kombinovanje u potrebnom redosledu
const messageToSign = textToSign + modifierString;
```

### 2\. Potpisivanje sa novčanikom

Koristeći `viem`, frontend zahteva korisnikov potpis za kombinovanu poruku. Ova akcija otvara prozor u korisnikovom novčaniku.

```javascript
// From: src/blockchain/auth.js

const walletClient = createWalletClient({
  chain: app.desiredChain(),
  transport: custom(window.ethereum)
});

const signature = await walletClient.signMessage({
  account,
  message: messageToSign,
});
```

Rezultantni `signature` je dugačak hex string (npr. `0x...`).

### 3\. Autentifikacija sa backend-om

Frontend zatim pravi `GET` zahtev na `/auth` endpoint, šaljući korisničku adresu, domen i novi potpis kao upitne parametre.

**Ključno**, `fetch` zahtev mora uključivati **`credentials: 'include'`** opciju. Ovo govori pretraživaču da obradi `Set-Cookie` zaglavlje u odgovoru, što je od suštinskog značaja za uspostavljanje sesije.

```javascript
// From: src/blockchain/auth.js

const authUrl = new URL(`${httpBase()}auth`);
authUrl.searchParams.set('user_addr', checksummedAccount);
authUrl.searchParams.set('domain', currentDomain);
authUrl.searchParams.set('signature', signature);

const authRes = await fetch(authUrl.toString(), { credentials: 'include' });
```

Ako je uspešno, odgovor backend-a će uključivati zaglavlje slično ovome:

```
Set-Cookie: auth=...; Path=/; HttpOnly; Secure; SameSite=Lax
```

### 4\. Izvršavanje autentifikovanih API poziva

Sa kolačićem sada postavljenim u pretraživaču, naredni API pozivi (kao što je provera admin privilegija) takođe moraju uključivati **`credentials: 'include'`** kako bi se osiguralo da se kolačić šalje sa zahtevom.

```javascript
// From: src/blockchain/auth.js

const isAdminUrl = new URL(`${httpBase()}is-admin`);
isAdminUrl.searchParams.set('address', checksummedAccount);
isAdminUrl.searchParams.set('domain', currentDomain);

const adminRes = await fetch(isAdminUrl.toString(), { credentials: 'include' });
const isAdminData = await adminRes.json(); // npr., {"result":"ok","admin":true}
const isAdmin = !!isAdminData?.admin;
```

### 5\. Preuzimanje korisničkog profila (putem WebSocket-a)

Pretraživač automatski šalje auth kolačić tokom nadogradnje WebSocket veze. Nakon uspešne prijave, aplikacijska `login` funkcija pravi `wsCall` na `get-user` metodu da preuzme puni korisnički profil.

```javascript
// From: src/context/useAppAuth.js (u login funkciji)

const userProfile = await getWsApi().call('get-user', {
  domain: coreUserData.domain,
  user_addr: checksummedAccount,
});
```

Primer odgovora sa `/get-user` može izgledati ovako:

```json
{
  "name": "alexna",
  "avatar": "QmbXwxPzs2veVYFbm7yybfK3rBMxEebuhAcWh3tuKdDTbq?filename=.png",
  "staked": 42529097734827650000000000,
  "n_followers": 9,
  "banned": false
}
```

-----

## Čuvanje sesije

Konačni korisnički objekat, koji je kombinacija osnovnih podataka (`address`, `domain`, `isAdmin`) i profila preuzetog sa `/get-user`, čuva se u globalnom `AppContext` i trajno se čuva u `localStorage`. Ovo omogućava automatsko obnavljanje sesije kada se korisnik ponovo poseti aplikaciju.

## Proces odjave

Proces odjave obrće ove korake:

1.  `POST` zahtev se šalje na `/logout` API endpoint da bi se onemogućila sesija na serveru i obrisao kolačić.
2.  Korisnički podaci se uklanjaju iz globalnog stanja i `localStorage`.
3.  WebSocket veza se prisiljava da `ponovo poveže`, uspostavljajući novu, neautentifikovanu sesiju.

-----

## Referenca koda

  - **Glavna orkestracija**: `src/blockchain/auth.js`
  - **Upravljanje stanjem i post-prijava tok**: `src/context/useAppAuth.js`