# Encrypted Posts

Savva supports end-to-end encrypted posts that can only be viewed by subscribers. This feature enables creators to publish exclusive content for their paying subscribers while ensuring that neither the platform nor IPFS gateways can read the content.

## Overview

The encryption system uses a multi-layered approach:

1. **Reading Keys**: Users generate X25519 keypairs deterministically from wallet signatures
2. **Post Encryption**: Each post gets a unique encryption key
3. **Key Distribution**: The post key is encrypted separately for each eligible recipient
4. **Content Encryption**: All post content (text, images, videos, audio) is encrypted with the post key
5. **Streaming Decryption**: Encrypted media is decrypted on-the-fly using Service Workers

## Reading Keys

### What is a Reading Key?

A Reading Key is an X25519 keypair that allows users to receive and decrypt encrypted posts. It consists of:
- **Public Key**: Published on-chain in the UserProfile contract (visible to everyone)
- **Private Key**: Derived deterministically from the user's wallet signature (never leaves the browser)
- **Nonce**: A random value used for key derivation (published on-chain)
- **Scheme**: The encryption scheme identifier (`x25519-xsalsa20-poly1305`)

### Key Generation Process

Reading keys are generated deterministically from wallet signatures using the following steps:

1. **Generate Random Nonce**
   ```javascript
   const nonce = crypto.getRandomValues(new Uint8Array(10));
   // Example: "a1b2c3d4e5f6g7h8i9j0"
   ```

2. **Create EIP-712 Typed Data**
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

3. **Request Wallet Signature**
   ```javascript
   const signature = await ethereum.request({
     method: "eth_signTypedData_v4",
     params: [userAddress, JSON.stringify(typedData)]
   });
   // Returns: 0x + 130 hex chars (r: 64, s: 64, v: 2)
   ```

4. **Extract r||s from Signature**
   ```javascript
   // Ignore the recovery byte 'v', use only r and s
   const rsBytes = signature.slice(2, 130); // 128 hex chars = 64 bytes
   ```

5. **Derive Seed Using HKDF-SHA256**
   ```javascript
   const salt = "SAVVA Reading Key:salt";
   const info = `SAVVA Reading Key:x25519-xsalsa20-poly1305:${nonce}`;
   const seed = hkdf(sha256, rsBytes, salt, info, 32);
   ```

6. **Generate X25519 Keypair**
   ```javascript
   const secretKey = seed; // 32 bytes (clamped by x25519 library)
   const publicKey = x25519.getPublicKey(secretKey);
   ```

7. **Publish Public Information**
   ```javascript
   // Store in UserProfile contract:
   - reading_public_key: hex string (64 chars)
   - reading_key_scheme: "x25519-xsalsa20-poly1305"
   - reading_key_nonce: hex string (20 chars)
   ```

**Implementation**: [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js)

### Key Derivation Benefits

The deterministic derivation approach has several advantages:

- ✅ **Reproducible**: Same nonce + signature always produces the same keypair
- ✅ **No Storage Required**: Secret key can be re-derived when needed
- ✅ **User Control**: Users can choose whether to store the key in browser localStorage
- ✅ **Key Rotation**: Generate new keys with different nonces
- ✅ **Multi-Device**: Same key on any device with the same wallet

### Storing Reading Keys (Optional)

Users can optionally store their reading secret key in browser localStorage to avoid re-signing every time they view encrypted content.

**Storage Format**:
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

**Implementation**: [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js)

### Publishing Reading Keys

To publish encrypted posts or receive encrypted content, users must publish their reading public key to the blockchain:

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

The public key is stored in the **UserProfile** smart contract and associated with the user's address and domain.

## Creating Encrypted Posts

### When Posts Are Encrypted

Posts are encrypted in the following scenarios:

1. **Subscriber-Only Posts**: Creator selects "Subscribers Only" audience
2. **Comments on Encrypted Posts**: Comments inherit the parent post's encryption

### Post Encryption Process

#### Step 1: Generate Post Encryption Key

Each encrypted post gets a unique X25519 keypair:

```javascript
const postKey = {
  secretKey: randomBytes(32),  // Random secret key
  publicKey: x25519.getPublicKey(secretKey)
};
```

This key is used to encrypt all content for this specific post.

**Implementation**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:23-31)

#### Step 2: Determine Recipients

The system builds a list of recipients who will be able to decrypt the post.

##### For Regular Subscriber-Only Posts:

1. **Fetch Eligible Subscribers**
   ```javascript
   // Query backend for users who:
   - Have active subscriptions (weeks > 0)
   - Meet minimum payment threshold
   - To the ACTOR (the account posting - could be user or NPO)
   ```

2. **Fetch Reading Keys**
   ```javascript
   // For each subscriber, fetch from UserProfile contract:
   - reading_public_key
   - reading_key_scheme
   - reading_key_nonce

   // Skip subscribers without reading keys
   ```

3. **Add Authorized User**
   ```javascript
   // Ensure the wallet owner can decrypt their own post
   if (!recipients.includes(authorizedUser)) {
     recipients.push(authorizedUser);
   }
   ```

4. **Add Big Brothers** (Domain Moderators)
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

**Implementation**: [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js)

##### For Comments on Encrypted Posts:

```javascript
// Use the same recipients as the parent post
const parentEncryption = await fetchParentPostEncryption(parentCid);
const recipients = parentEncryption.recipients;

// Ensure commenter and big_brothers are included
```

**Implementation**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:214-259)

#### Step 3: Encrypt Post Content

All text content in the descriptor is encrypted with the post secret key:

```javascript
// For each locale:
{
  title: encryptText(title, postSecretKey),
  text_preview: encryptText(preview, postSecretKey),
  tags: tags.map(t => encryptText(t, postSecretKey)),
  categories: categories.map(c => encryptText(c, postSecretKey))
}
```

**Encryption Format**: `nonce:ciphertext` (both hex-encoded)

**Algorithm**: XSalsa20-Poly1305 (authenticated encryption)

#### Step 4: Encrypt Post Key for Each Recipient

For each recipient, encrypt the post secret key using their reading public key:

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

This uses the **X25519 + XSalsa20-Poly1305** construction (similar to NaCl's `crypto_box`).

**Implementation**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:97-122)

#### Step 5: Encrypt Files (Images, Videos, Audio)

All uploaded files are encrypted before being sent to IPFS:

##### Small Files (< 1 MB)
```javascript
// Simple encryption: nonce + encrypted data
const nonce = randomBytes(24);
const cipher = xsalsa20poly1305(postSecretKey, nonce);
const encrypted = cipher.encrypt(fileData);

const encryptedFile = new Uint8Array(24 + encrypted.length);
encryptedFile.set(nonce, 0);
encryptedFile.set(encrypted, 24);
```

##### Large Files (≥ 1 MB)
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

This enables **streaming decryption** - videos can start playing before the entire file is decrypted.

**Implementation**: [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js), [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js)

#### Step 6: Build Encryption Metadata

The descriptor includes encryption metadata:

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

**Implementation**: [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js:167-211)

## Big Brothers (Domain Moderators)

Big Brothers are special addresses configured at the domain level that automatically get access to **all encrypted posts** in that domain. This enables content moderation while maintaining end-to-end encryption.

### Configuration

Big Brothers are configured in the `config.json` file:

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

### How Big Brothers Work

1. **Automatic Inclusion**: When creating an encrypted post, the system:
   - Fetches `big_brothers` from domain configuration
   - Fetches reading keys for each big brother
   - Adds them to the recipient list
   - Encrypts the post key for each big brother

2. **Deduplication**: If a big brother is already a subscriber, they're not duplicated

3. **Graceful Failure**: If a big brother doesn't have a reading key, they're skipped (logged but doesn't block publishing)

**Implementation**: [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx:280-322)

### Use Cases

- **Content Moderation**: Review encrypted posts for policy violations
- **Customer Support**: Help users with encrypted content issues
- **Legal Compliance**: Law enforcement access with proper authorization
- **Backup Access**: Domain owners maintaining access to content

## Decrypting Posts

### Automatic Decryption Flow

When a user views an encrypted post:

1. **Check Post Encryption**
   ```javascript
   if (post.content.encrypted && !post._decrypted) {
     // Post is encrypted and not yet decrypted
   }
   ```

2. **Check User Eligibility**
   ```javascript
   const canDecrypt = encryption.keys.some(
     k => k.address.toLowerCase() === userAddress.toLowerCase()
   );
   ```

3. **Get Reading Secret Key**
   ```javascript
   // Option 1: Retrieve from localStorage
   const storedKey = findStoredSecretKey(userAddress, nonce);

   // Option 2: Re-derive from wallet signature
   if (!storedKey) {
     const signature = await signReadingKeyMessage(userAddress, nonce);
     const secretKey = deriveKeyFromSignature(signature, nonce);
   }
   ```

4. **Decrypt Post Secret Key**
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

5. **Decrypt Metadata**
   ```javascript
   // Decrypt title, preview, tags, categories
   post.title = decryptText(post.title, postSecretKey);
   post.text_preview = decryptText(post.text_preview, postSecretKey);
   post.tags = post.tags.map(t => decryptText(t, postSecretKey));
   ```

6. **Set Encryption Context**
   ```javascript
   // For automatic media decryption
   setEncryptedPostContext({ dataCid, postSecretKey });
   swManager.setEncryptionContext(dataCid, postSecretKey);
   ```

7. **Decrypt Media On-The-Fly**
   ```javascript
   // Service Worker intercepts all IPFS requests
   // For URLs matching dataCid:
   - Fetch encrypted file
   - Detect encryption format (simple or chunked)
   - Decrypt chunks as needed
   - Stream decrypted bytes to browser

   // Result: videos play immediately, seeking works
   ```

**Implementation**: [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js), [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx:263-291)

### Streaming Media Decryption

Encrypted media files (videos, audio) are decrypted on-the-fly using Service Workers:

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

See [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) for detailed documentation on the streaming encryption system.

## Security Considerations

### Encryption Algorithms

- **X25519**: Elliptic Curve Diffie-Hellman (256-bit security)
- **XSalsa20-Poly1305**: Authenticated encryption (AEAD)
- **HKDF-SHA256**: Key derivation function
- **EIP-712**: Structured data signing

### Key Management

✅ **Secure**:
- Private keys never leave the browser
- Keys derived deterministically from wallet signatures
- Service Worker runs in same origin
- Encryption contexts have TTL (30 minutes)
- Keys cleared on page navigation

⚠️ **Limitations**:
- Vulnerable to XSS attacks (keys in memory)
- Browser extensions with full access can steal keys
- No protection against physical device access
- IPFS gateways see encrypted data (but can't decrypt)

### Threat Model

**Protected Against**:
- ✅ IPFS gateway snooping
- ✅ Man-in-the-middle attacks (HTTPS + AEAD)
- ✅ Data tampering (Poly1305 authentication)
- ✅ Replay attacks (unique nonces per message)

**NOT Protected Against**:
- ❌ Malicious browser extensions
- ❌ XSS vulnerabilities in the application
- ❌ Compromised user devices
- ❌ Users sharing their secret keys

### Best Practices

1. **Always Use HTTPS** in production
2. **Store Keys Securely** - localStorage is optional, not required
3. **Clear Contexts** when navigating away
4. **Validate Recipients** before encrypting
5. **Use Strong Passwords** for wallet backup
6. **Audit Big Brothers** regularly
7. **Monitor Access Logs** for suspicious activity

## Implementation Files

### Core Encryption
- [`src/x/crypto/readingKey.js`](../../../../src/x/crypto/readingKey.js) - Reading key generation and management
- [`src/x/crypto/readingKeyStorage.js`](../../../../src/x/crypto/readingKeyStorage.js) - Browser storage for reading keys
- [`src/x/crypto/readingKeyEncryption.js`](../../../../src/x/crypto/readingKeyEncryption.js) - X25519 + XSalsa20-Poly1305 encryption
- [`src/x/crypto/postEncryption.js`](../../../../src/x/crypto/postEncryption.js) - Post content encryption
- [`src/x/crypto/postDecryption.js`](../../../../src/x/crypto/postDecryption.js) - Post content decryption
- [`src/x/crypto/fileEncryption.js`](../../../../src/x/crypto/fileEncryption.js) - File encryption (simple + chunked)
- [`src/x/crypto/chunkedEncryption.js`](../../../../src/x/crypto/chunkedEncryption.js) - Chunked encryption for large files

### Recipient Management
- [`src/x/crypto/fetchEligibleSubscribers.js`](../../../../src/x/crypto/fetchEligibleSubscribers.js) - Fetch subscribers with reading keys
- [`src/x/crypto/fetchParentPostEncryption.js`](../../../../src/x/crypto/fetchParentPostEncryption.js) - Get parent post recipients

### Publishing Flow
- [`src/x/editor/wizard_steps/StepUploadDescriptor.jsx`](../../../../src/x/editor/wizard_steps/StepUploadDescriptor.jsx) - Descriptor creation with encryption
- [`src/x/editor/wizard_steps/StepUploadIPFS.jsx`](../../../../src/x/editor/wizard_steps/StepUploadIPFS.jsx) - File encryption before upload

### Viewing Flow
- [`src/x/pages/PostPage.jsx`](../../../../src/x/pages/PostPage.jsx) - Post viewing with auto-decryption
- [`src/ipfs/encryptedFetch.js`](../../../../src/ipfs/encryptedFetch.js) - IPFS fetching with decryption

### Streaming Decryption
- [`src/x/crypto/serviceWorkerManager.js`](../../../../src/x/crypto/serviceWorkerManager.js) - Service Worker management
- [`public/crypto-sw.js`](../../../../public/crypto-sw.js) - Service Worker for streaming decryption
- [STREAMING_ENCRYPTION.md](../../../../STREAMING_ENCRYPTION.md) - Detailed streaming encryption docs

## User Experience Flow

### For Content Creators

1. **First Time Setup**
   - Generate Reading Key (sign EIP-712 message)
   - Publish to blockchain
   - Optionally store in browser

2. **Publishing Encrypted Post**
   - Write content in editor
   - Select "Subscribers Only" audience
   - System automatically:
     - Fetches eligible subscribers
     - Generates post encryption key
     - Encrypts content
     - Encrypts files
     - Uploads to IPFS
     - Publishes descriptor to blockchain

3. **Viewing Own Encrypted Posts**
   - Auto-decrypts using stored or re-derived key
   - Media streams seamlessly

### For Subscribers

1. **First Time Setup**
   - Generate Reading Key
   - Publish to blockchain
   - Subscribe to creator

2. **Viewing Encrypted Posts**
   - Open encrypted post
   - System checks eligibility
   - Retrieves or re-derives secret key
   - Decrypts post automatically
   - Media plays with streaming decryption

3. **Key Storage Options**
   - Store in browser: No re-signing required
   - Don't store: Sign message each time (more secure)

### For Big Brothers (Moderators)

1. **Setup**
   - Generate Reading Key
   - Domain admin adds address to `big_brothers` list
   - Automatically included in all encrypted posts

2. **Moderation**
   - Access all encrypted content in domain
   - Review for policy violations
   - Take appropriate action

## Troubleshooting

### "No Reading Key Found"
- User hasn't generated a reading key yet
- Prompt to generate and publish

### "Failed to Decrypt Post"
- User's reading key not in recipient list
- Check subscription status
- Verify big_brothers configuration

### "Media Not Playing"
- Service Worker not registered (requires HTTPS)
- Encryption context not set
- Check browser console for errors

### "No Eligible Subscribers"
- No subscribers have published reading keys
- Inform subscribers to generate reading keys
- Check minimum payment threshold

## Future Enhancements

- **Key Rotation**: Support for multiple active reading keys per user
- **Backup & Recovery**: Encrypted key backup with recovery phrase
- **Hardware Wallets**: Reading key derivation with Ledger/Trezor
- **Selective Sharing**: Temporary access grants for specific posts
- **Analytics**: Privacy-preserving metrics for encrypted content
- **WebAuthn Support**: Reading keys derived from WebAuthn credentials

## Related Documentation

- [Publishing Posts](/docs/core-concepts/publishing-posts) - General post publishing flow
- [Showing Posts](/docs/core-concepts/showing-posts) - Post display and rendering
- [User Profile](/docs/core-concepts/user-profile) - Profile contract and user data
- [Streaming Encryption](../../../../STREAMING_ENCRYPTION.md) - Detailed streaming decryption docs (source code)
- [Content Format](/docs/features/content-format) - Descriptor format specification
