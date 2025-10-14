# Enkriptovani postovi

Savva podržava end-to-end enkriptovane postove koje mogu da vide samo pretplatnici. Ova funkcija omogućava kreatorima da objavljuju ekskluzivan sadržaj za svoje plaćene pretplatnike, uz garanciju da ni platforma ni IPFS gateway-i ne mogu da pročitaju sadržaj.

## Pregled

Sistem enkripcije koristi višeslojni pristup:

1. **Reading Keys (ključevi za čitanje)**: Korisnici deterministički generišu X25519 parove ključeva iz potpisa novčanika
2. **Enkripcija posta**: Svaki post dobija jedinstveni ključ za enkripciju
3. **Distribucija ključeva**: Ključ posta se posebno enkriptuje za svakog podobnog primaoca
4. **Enkripcija sadržaja**: Sav sadržaj posta (tekst, slike, video, audio) se enkriptuje post ključem
5. **Streaming dekripcija**: Enkriptovani mediji se dekriptuju u toku reprodukcije koristeći Service Workere

## Reading Keys

### Šta je Reading Key?

Reading Key je X25519 par ključeva koji omogućava korisnicima da primaju i dekriptuju enkriptovane postove. Sastoji se od:
- **Javni ključ**: Objavljen na lancu u UserProfile ugovoru (vidljiv svima)
- **Privatni ključ**: Izveden deterministički iz potpisa korisnikovog novčanika (nikada ne napušta pregledač)
- **Nonce**: Nasumična vrednost korišćena za derivaciju ključa (objavljena na lancu)
- **Shema**: Identifikator šeme enkripcije (`x25519-xsalsa20-poly1305`)

### Proces generisanja ključa

Reading key-jevi se generišu deterministički iz potpisa novčanika koristeći sledeće korake:

1. **Generiši nasumični nonce**
   ```javascript
   const nonce = crypto.getRandomValues(new Uint8Array(10));
   // Example: "a1b2c3d4e5f6g7h8i9j0"
   ```

2. **Kreiraj EIP-712 Typed Data**
   ```javascript
   const typedData = {
     types: {
       EIP712Domain: [
         { name: "name", type: "string" },
         { name: "version", type: "string" }
       ],
       ReadingKey: [
         { name: "context", type: "string" },
         { name: "scheme", type: "string" },
         { name: "nonce", type: "string" }
       ]
     },
     primaryType: "ReadingKey",
     domain: {
       name: "SAVVA",
       version: "1"
     },
     message: {
       context: "SAVVA Reading Key",
       scheme: "x25519-xsalsa20-poly1305",
       nonce: nonce
     }
   };
   ```

3. **Zahtev za potpis iz novčanika**
   ```javascript
   const signature = await ethereum.request({
     method: "eth_signTypedData_v4",
     params: [userAddress, JSON.stringify(typedData)]
   });
   // Returns: 0x + 130 hex chars (r: 64, s: 64, v: 2)
   ```

4. **Ekstrakt r||s iz potpisa**
   ```javascript
   // Ignore the recovery byte 'v', use only r and s
   const rsBytes = signature.slice(2, 130); // 128 hex chars = 64 bytes
   ```

5. **Izvedi seed koristeći HKDF-SHA256**
   ```javascript
   const salt = "SAVVA Reading Key:salt";
   const info = `SAVVA Reading Key:x25519-xsalsa20-poly1305:${nonce}`;
   const seed = hkdf(sha256, rsBytes, salt, info, 32);
   ```

6. **Generiši X25519 par ključeva**
   ```javascript
   const secretKey = seed; // 32 bytes (clamped by x25519 library)
   const publicKey = x25519.getPublicKey(secretKey);
   ```

7. **Objavi javne informacije**
   ```javascript
   // Store in UserProfile contract:
   - reading_public_key: hex string (64 chars)
   - reading_key_scheme: "x25519-xsalsa20-poly1305"
   - reading_key_nonce: hex string (20 chars)
   ```

**Implementacija**: [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js)

### Prednosti derivacije ključa

Deterministički pristup derivaciji ima nekoliko prednosti:

- ✅ **Reproduktivno**: Isti nonce + potpis uvek proizvode isti par ključeva
- ✅ **Nije potrebna skladištenje**: Tajni ključ se može ponovo izvesti po potrebi
- ✅ **Kontrola korisnika**: Korisnici mogu da odluče da li će skladištiti ključ u localStorage pregledača
- ✅ **Rotacija ključeva**: Moguće je generisati nove ključeve sa različitim nonce-ovima
- ✅ **Više uređaja**: Isti ključ na bilo kom uređaju sa istim novčanikom

### Skladištenje Reading Keys (opciono)

Korisnici opcionalno mogu da skladište svoj tajni ključ za čitanje u localStorage pregledača da bi izbegli ponovno potpisivanje svaki put kada gledaju enkriptovani sadržaj.

**Format skladištenja**:
```javascript
localStorage["savva_reading_keys"] = {
  "0xUserAddress": [
    {
      nonce: "a1b2c3d4e5f6g7h8i9j0",
      secretKey: "hex64chars...",
      publicKey: "hex64chars...",
      timestamp: 1234567890
    }
    // Multiple keys for key rotation
  ]
}
```

**Implementacija**: [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js)

### Objavljivanje Reading Keys

Da bi objavljivali enkriptovane postove ili primali enkriptovan sadržaj, korisnici moraju da objave svoj javni ključ za čitanje na blockchain:

```javascript
// User flow:
1. Generate reading key (signs EIP-712 message)
2. Publish to UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce
3. Transaction confirmed on-chain
4. Public key now discoverable by content creators
```

Javni ključ se čuva u pametnom ugovoru **UserProfile** i povezan je sa adresom korisnika i domenom.

## Kreiranje enkriptovanih postova

### Kada se postovi enkriptuju

Postovi se enkriptuju u sledećim scenarijima:

1. **Samo za pretplatnike**: Kreator izabere publiku "Subscribers Only"
2. **Komentari na enkriptovanim postovima**: Komentari nasleđuju enkripciju roditeljskog posta

### Proces enkripcije posta

#### Korak 1: Generisanje ključa za enkripciju posta

Svaki enkriptovani post dobija jedinstveni X25519 par ključeva:

```javascript
const postKey = {
  secretKey: randomBytes(32),  // Random secret key
  publicKey: x25519.getPublicKey(secretKey)
};
```

Ovaj ključ se koristi za enkripciju celog sadržaja za konkretan post.

**Implementacija**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:23-31)

#### Korak 2: Određivanje primaoca

Sistem pravi listu primalaca koji će moći da dekriptuju post.

##### Za uobičajene postove samo za pretplatnike:

1. **Preuzmi podobne pretplatnike**
   ```javascript
   // Query backend for users who:
   - Have active subscriptions (weeks > 0)
   - Meet minimum payment threshold
   - To the ACTOR (the account posting - could be user or NPO)
   ```

2. **Preuzmi Reading Keys**
   ```javascript
   // For each subscriber, fetch from UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce

   // Skip subscribers without reading keys
   ```

3. **Dodaj autorizovanog korisnika**
   ```javascript
   // Ensure the wallet owner can decrypt their own post
   if (!recipients.includes(authorizedUser)) {
     recipients.push(authorizedUser);
   }
   ```

4. **Dodaj Big Brothers** (moderatori domena)
   ```javascript
   // Fetch from domain configuration
   const bigBrothers = domain.big_brothers || [];

   // Add each big_brother to recipients if they have reading keys
   for (const address of bigBrothers) {
     const readingKey = await fetchReadingKey(address);
     if (readingKey) {
       recipients.push(address);
     }
   }
   ```

**Implementacija**: [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js)

##### Za komentare na enkriptovanim postovima:

```javascript
// Use the same recipients as the parent post
const parentEncryption = await fetchParentPostEncryption(parentCid);
const recipients = parentEncryption.recipients;

// Ensure commenter and big_brothers are included
```

**Implementacija**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:214-259)

#### Korak 3: Enkripcija sadržaja posta

Sav tekstualni sadržaj u descriptor-u se enkriptuje post tajnim ključem:

```javascript
// For each locale:
{
  title: encryptText(title, postSecretKey),
  text_preview: encryptText(preview, postSecretKey),
  tags: tags.map(t => encryptText(t, postSecretKey)),
  categories: categories.map(c => encryptText(c, postSecretKey))
}
```

**Format enkripcije**: `nonce:ciphertext` (oba heksadecimalno kodirana)

**Algoritam**: XSalsa20-Poly1305 (autentifikovana enkripcija)

#### Korak 4: Enkripcija ključa posta za svakog primaoca

Za svakog primaoca enkriptuje se tajni ključ posta koristeći njihov javni čitajući ključ:

```javascript
for (const recipient of recipients) {
  // Generate ephemeral keypair for this recipient
  const ephemeralKey = x25519.utils.randomPrivateKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralKey);

  // Compute shared secret using ECDH
  const sharedSecret = x25519.getSharedSecret(
    ephemeralKey,
    recipient.publicKey
  );

  // Encrypt post secret key with shared secret
  const nonce = randomBytes(24);
  const cipher = xsalsa20poly1305(sharedSecret, nonce);
  const encryptedKey = cipher.encrypt(postSecretKey);

  // Store for this recipient
  encryption.keys.push({
    address: recipient.address,
    encrypted_key: bytesToHex(encryptedKey),
    ephemeral_public_key: bytesToHex(ephemeralPublicKey),
    nonce: bytesToHex(nonce)
  });
}
```

Ovo koristi konstrukciju **X25519 + XSalsa20-Poly1305** (slično NaCl `crypto_box`).

**Implementacija**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:97-122)

#### Korak 5: Enkripcija fajlova (slike, video, audio)

Svi otpremeljeni fajlovi se enkriptuju pre slanja na IPFS:

##### Mali fajlovi (< 1 MB)
```javascript
// Simple encryption: nonce + encrypted data
const nonce = randomBytes(24);
const cipher = xsalsa20poly1305(postSecretKey, nonce);
const encrypted = cipher.encrypt(fileData);

const encryptedFile = new Uint8Array(24 + encrypted.length);
encryptedFile.set(nonce, 0);
encryptedFile.set(encrypted, 24);
```

##### Veliki fajlovi (≥ 1 MB)
```javascript
// Chunked encryption for streaming (256 KB chunks)
// Header format:
{
  magic: "SAVVA_EC",
  version: 1,
  chunkSize: 262144,  // 256 KB
  totalChunks: n,
  originalSize: bytes
}

// Each chunk independently encrypted:
for each chunk {
  nonce = randomBytes(24);
  cipher = xsalsa20poly1305(postSecretKey, nonce);
  encryptedChunk = nonce + cipher.encrypt(chunk);
}
```

Ovo omogućava **streaming dekripciju** — video snimci mogu da počnu da se reprodukuju pre nego što je ceo fajl dekriptovan.

**Implementacija**: [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js), [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js)

#### Korak 6: Izgradi metadata enkripcije

Descriptor sadrži metadata o enkripciji:

```yaml
savva_spec_version: "2.0"
data_cid: QmXXX...
encrypted: true
locales:
  en:
    title: "48c3a1b2:9f8d7e6c5a4b3e2d1c0f9e8d7c6b5a4e3d2c1b0a..."
    text_preview: "a1b2c3d4:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b..."
    tags:
      - "nonce1:encrypted_tag1"
      - "nonce2:encrypted_tag2"
    categories:
      - "nonce3:encrypted_category1"
    data_path: en/data.md
    chapters:
      - title: "nonce4:encrypted_chapter_title"
        data_path: en/chapters/1.md

encryption:
  type: "x25519-xsalsa20-poly1305"
  reading_key_nonce: "abc123..."  # Publisher's reading key nonce
  reading_public_key: "def456..." # Publisher's reading public key
  keys:
    - address: "0xSubscriber1"
      encrypted_key: "789ghi..."
      ephemeral_public_key: "jkl012..."
      nonce: "mno345..."
    - address: "0xSubscriber2"
      encrypted_key: "678pqr..."
      ephemeral_public_key: "stu901..."
      nonce: "vwx234..."
    # ... one entry per recipient
```

**Implementacija**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:167-211)

## Big Brothers (moderatori domena)

Big Brothers su specijalne adrese konfigurisane na nivou domena koje automatski dobijaju pristup **svim enkriptovanim postovima** na tom domenu. Ovo omogućava moderaciju sadržaja uz održavanje end-to-end enkripcije.

### Konfiguracija

Big Brothers se konfigurišu u fajlu `config.json`:

```javascript
{
  "domains": [
    {
      "name": "example.com",
      "big_brothers": [
        "0x1234567890123456789012345678901234567890",
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      ]
      // ...
    }
  ]
}
```

### Kako Big Brothers funkcionišu

1. **Automatsko uključivanje**: Prilikom kreiranja enkriptovanog posta, sistem:
   - Preuzima `big_brothers` iz konfiguracije domena
   - Preuzima reading key-jeve za svakog big brother-a
   - Dodaje ih u listu primalaca
   - Enkriptuje ključ posta za svakog big brother-a

2. **Dedupliciranje**: Ako je big brother već pretplatnik, ne dodaje se dva puta

3. **Graceful Failure**: Ako big brother nema reading key, preskače se (zapisuje se u log, ali ne blokira objavljivanje)

**Implementacija**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:280-322)

### Upotrebe

- **Moderacija sadržaja**: Pregled enkriptovanih postova radi kršenja pravila
- **Korisnička podrška**: Pomoć korisnicima sa problemima oko enkriptovanog sadržaja
- **Pravne obaveze**: Pristup organima reda uz odgovarajuću autorizaciju
- **Backup pristup**: Vlasnici domena zadržavaju pristup sadržaju

## Dekriptovanje postova

### Automatski tok dekripcije

Kada korisnik pogleda enkriptovani post:

1. **Proveri da li je post enkriptovan**
   ```javascript
   if (post.content.encrypted && !post._decrypted) {
     // Post is encrypted and not yet decrypted
   }
   ```

2. **Proveri podobnost korisnika**
   ```javascript
   const canDecrypt = encryption.keys.some(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );
   ```

3. **Preuzmi tajni ključ za čitanje**
   ```javascript
   // Option 1: Retrieve from localStorage
   const storedKey = findStoredSecretKey(userAddress, nonce);

   // Option 2: Re-derive from wallet signature
   if (!storedKey) {
     const signature = await signReadingKeyMessage(userAddress, nonce);
     const secretKey = deriveKeyFromSignature(signature, nonce);
   }
   ```

4. **Dekriptuj tajni ključ posta**
   ```javascript
   // Find encrypted key for this user
   const keyEntry = encryption.keys.find(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );

   // Compute shared secret using ECDH
   const sharedSecret = x25519.getSharedSecret(
     userSecretKey,
     keyEntry.ephemeral_public_key
   );

   // Decrypt the post secret key
   const cipher = xsalsa20poly1305(sharedSecret, keyEntry.nonce);
   const postSecretKey = cipher.decrypt(keyEntry.encrypted_key);
   ```

5. **Dekriptuj metadata**
   ```javascript
   // Decrypt title, preview, tags, categories
   post.title = decryptText(post.title, postSecretKey);
   post.text_preview = decryptText(post.text_preview, postSecretKey);
   post.tags = post.tags.map(t => decryptText(t, postSecretKey));
   ```

6. **Postavi kontekst enkripcije**
   ```javascript
   // For automatic media decryption
   setEncryptedPostContext({ dataCid, postSecretKey });
   swManager.setEncryptionContext(dataCid, postSecretKey);
   ```

7. **Dekriptuj medije u toku reprodukcije**
   ```javascript
   // Service Worker intercepts all IPFS requests
   // For URLs matching dataCid:
   - Fetch encrypted file
   - Detect encryption format (simple or chunked)
   - Decrypt chunks as needed
   - Stream decrypted bytes to browser

   // Result: videos play immediately, seeking works
   ```

**Implementacija**: [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js), [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx:263-291)

### Streaming dekripcija medija

Enkriptovani medijski fajlovi (video, audio) se dekriptuju u toku reprodukcije koristeći Service Workere:

```javascript
// Service Worker intercepts fetch
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.includes(dataCid)) {
    // This is an encrypted resource
    event.respondWith(streamDecrypt(event.request));
  }
});

async function streamDecrypt(request) {
  // Fetch encrypted file
  const response = await fetch(request);
  const encrypted = await response.arrayBuffer();

  // Check format
  if (isChunkedFormat(encrypted)) {
    // Decrypt specific chunks for Range request
    const range = parseRangeHeader(request.headers.get('range'));
    const chunks = getChunksForRange(range);

    // Decrypt only needed chunks
    const decrypted = chunks.map(i => decryptChunk(encrypted, i));

    return new Response(decrypted, {
      status: 206,
      headers: { 'Content-Range': ... }
    });
  } else {
    // Decrypt entire file
    const decrypted = decryptSimple(encrypted);
    return new Response(decrypted);
  }
}
```

Pogledajte [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) za detaljnu dokumentaciju o sistemu streaming enkripcije.

## Bezbednosne napomene

### Algoritmi enkripcije

- **X25519**: Elliptic Curve Diffie-Hellman (bezbednost 256 bita)
- **XSalsa20-Poly1305**: Autentifikovana enkripcija (AEAD)
- **HKDF-SHA256**: Funkcija za derivaciju ključa
- **EIP-712**: Strukturisano potpisivanje podataka

### Upravljanje ključevima

✅ **Sigurno**:
- Privatni ključevi nikada ne napuštaju pregledač
- Ključevi derivirani deterministički iz potpisa novčanika
- Service Worker radi u istom originu
- Konteksti enkripcije imaju TTL (30 minuta)
- Ključevi se brišu pri navigaciji sa stranice

⚠️ **Ograničenja**:
- Ranljivost na XSS napade (ključevi u memoriji)
- Ekstenzije pregledача sa punim pristupom mogu da ukradu ključeve
- Nema zaštite protiv fizičkog pristupa uređaju
- IPFS gateway-i vide enkriptovane podatke (ali ih ne mogu dekriptovati)

### Model pretnji

**Zaštićeno protiv**:
- ✅ Špijuniranja od strane IPFS gateway-a
- ✅ Man-in-the-middle napada (HTTPS + AEAD)
- ✅ Manipulacije podacima (Poly1305 autentikacija)
- ✅ Replay napada (jedinstveni nonce-ovi po poruci)

**Nije zaštićeno protiv**:
- ❌ Zlonamernih ekstenzija pregledča
- ❌ XSS ranjivosti u aplikaciji
- ❌ Kompromitovanih korisničkih uređaja
- ❌ Korisnika koji dele svoje tajne ključeve

### Najbolje prakse

1. **Uvek koristite HTTPS** u produkciji
2. **Skladištite ključeve bezbedno** - localStorage je opciono, nije obavezno
3. **Brišite kontekste** pri napuštanju stranice
4. **Validirajte primaoce** pre enkriptovanja
5. **Koristite jake lozinke** za backup novčanika
6. **Redovno audituјte Big Brothers**
7. **Pratite logove pristupa** za sumnjive aktivnosti

## Fajlovi implementacije

### Osnovna enkripcija
- [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js) - Generisanje i upravljanje reading ključevima
- [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js) - Skladištenje reading ključeva u pregledaču
- [`src/x/crypto/readingKeyEncryption.js`](../../../../src/x/crypto/readingKeyEncryption.js) - X25519 + XSalsa20-Poly1305 enkripcija
- [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js) - Enkripcija sadržaja posta
- [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js) - Dekripcija sadržaja posta
- [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js) - Enkripcija fajlova (simple + chunked)
- [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js) - Chunked enkripcija za velike fajlove

### Upravljanje primaocima
- [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js) - Preuzimanje pretplatnika sa reading ključevima
- [`src/x/crypto/fetchParentPostEncryption.js`](../../../../src/x/crypto/fetchParentPostEncryption.js) - Dobijanje primalaca roditeljskog posta

### Tok objavljivanja
- [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx) - Kreiranje descriptor-a sa enkripcijom
- [`src/x/editor/wizard_steps/StepUploadIPFS.jsx`](../../../../src/x/editor/wizard_steps/StepUploadIPFS.jsx) - Enkripcija fajlova pre otpremanja

### Tok pregleda
- [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx) - Pregled posta sa automatskom dekripcijom
- [`src/ipfs/encryptedFetch.js`](../../../../src/ipfs/encryptedFetch.js) - IPFS fetch sa dekripcijom

### Streaming dekripcija
- [`src/x/crypto/serviceWorkerManager.js`](../../../../src/x/crypto/serviceWorkerManager.js) - Upravljanje Service Worker-om
- [`public/crypto-sw.js`](../../../../public/crypto-sw.js) - Service Worker za streaming dekripciju
- [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) - Detaljna dokumentacija o streaming enkripciji

## Tok korisničkog iskustva

### Za kreatore sadržaja

1. **Prvo podešavanje**
   - Generiši Reading Key (potpiši EIP-712 poruku)
   - Objavi na blockchain
   - Opcionalno sačuvaj u pregledaču

2. **Objavljivanje enkriptovanog posta**
   - Napiši sadržaj u editoru
   - Izaberi publiku "Subscribers Only"
   - Sistem automatski:
     - Preuzima podobne pretplatnike
     - Generiše ključ za enkripciju posta
     - Enkriptuje sadržaj
     - Enkriptuje fajlove
     - Otprema na IPFS
     - Objavljuje descriptor na blockchain

3. **Pregled sopstvenih enkriptovanih postova**
   - Automatski dekriptuje koristeći sačuvan ili ponovo izveden ključ
   - Mediji se reprodukuju neprimetno

### Za pretplatnike

1. **Prvo podešavanje**
   - Generiši Reading Key
   - Objavi na blockchain
   - Pretplati se na kreatora

2. **Pregled enkriptovanih postova**
   - Otvori enkriptovani post
   - Sistem proverava podobnost
   - Preuzima ili ponovo izvodi tajni ključ
   - Automatski dekriptuje post
   - Mediji se reprodukuju uz streaming dekripciju

3. **Opcije skladištenja ključeva**
   - Sačuvaj u pregledaču: Nema potrebe za ponovnim potpisivanjem
   - Ne čuvaj: Potpisuj poruku svaki put (bezbednije)

### Za Big Brothers (moderatore)

1. **Podešavanje**
   - Generiši Reading Key
   - Admin domena doda adresu u listu `big_brothers`
   - Automatski uključeni u sve enkriptovane postove

2. **Moderacija**
   - Pristup svim enkriptovanim sadržajima na domenu
   - Pregled radi kršenja pravila
   - Preduzimanje odgovarajućih mera

## Otklanjanje poteškoća

### "No Reading Key Found"
- Korisnik još nije generisao reading key
- Prompt za generisanje i objavljivanje

### "Failed to Decrypt Post"
- Korisnikov reading key nije na listi primalaca
- Proveriti status pretplate
- Verifikovati konfiguraciju big_brothers

### "Media Not Playing"
- Service Worker nije registrovan (zahteva HTTPS)
- Kontekst enkripcije nije postavljen
- Proveriti konzolu pregledača za greške

### "No Eligible Subscribers"
- Nema pretplatnika koji su objavili reading key
- Obavestiti pretplatnike da generišu reading key
- Proveriti minimalni prag plaćanja

## Buduća poboljšanja

- **Rotacija ključeva**: Podrška za više aktivnih reading ključeva po korisniku
- **Backup & Recovery**: Enkriptovani backup ključa sa recovery frazom
- **Hardverski novčanici**: Derivacija reading ključeva sa Ledger/Trezor
- **Selektivno deljenje**: Privremeni pristupi za pojedinačne postove
- **Analitika**: Privatna metrike za enkriptovani sadržaj
- **WebAuthn podrška**: Reading key-jevi izvedeni iz WebAuthn kredencijala

## Povezana dokumentacija

- [Publishing Posts](/docs/core-concepts/publishing-posts) - Opšti tok objavljivanja postova
- [Showing Posts](/docs/core-concepts/showing-posts) - Prikaz i renderovanje postova
- [User Profile](/docs/core-concepts/user-profile) - UserProfile ugovor i korisnički podaci
- [Streaming Encryption](../../../../STREAMING_ENCRYPTION.md) - Detaljna dokumentacija o streaming dekripciji (izvorni kod)
- [Content Format](/docs/features/content-format) - Specifikacija formata descriptor-a