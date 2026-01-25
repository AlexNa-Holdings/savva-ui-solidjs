# Publishing a Post

Publishing content on the SAVVA platform is a three-step process that ensures data integrity, decentralization, and on-chain verification. The flow involves preparing the post data locally, uploading the content and its descriptor to IPFS, and finally registering the post on the blockchain via a smart contract call.

The frontend editor automates this process through a wizard, but understanding the underlying steps is crucial for developers.

---

## Step 1: Prepare Post Data

Before any upload or transaction occurs, the editor organizes the post into a standardized directory structure. This structure is managed locally using the File System API.

The main components are:

* A parameters file (`params.json`) for editor-specific settings.
* A descriptor file (`info.yaml`) that defines the post's structure and metadata for IPFS.
* Markdown files for the content of each language.
* An `uploads/` directory for any associated media files (images, videos, etc.).

### Example `params.json`

This file holds settings used by the editor UI and is not published on-chain.

```json
{
  "guid": "c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a",
  "nsfw": false,
  "fundraiser": 0,
  "publishAsNewPost": true,
  "audience": "subscribers",
  "minWeeklyPaymentWei": "1000000000000000000000",
  "allowPurchase": true,
  "purchasePriceWei": "99000000000000000000",
  "locales": {
    "en": {
      "tags": ["decentralization", "social"],
      "categories": ["Technology"],
      "chapters": [
        { "title": "What is a Blockchain?" },
        { "title": "IPFS and Content Addressing" }
      ]
    }
  },
  "thumbnail": "uploads/thumbnail.png"
}
```

**Audience and Access Control Parameters:**

* **audience**: Either `"public"` (default) or `"subscribers"` for subscriber-only posts.
* **minWeeklyPaymentWei**: Minimum weekly staking payment required to access the post (in wei, as string).
* **allowPurchase**: If `true`, allows one-time purchase access for non-subscribers.
* **purchasePriceWei**: Price for one-time purchase access in SAVVA tokens (in wei, as string).

---

## Step 2: The Post Descriptor (`info.yaml`)

This file is the canonical definition of the post and is uploaded to IPFS. It links all the content pieces together and contains access control and encryption information.

### Public Post Descriptor

For public posts, the descriptor is straightforward:

```yaml
savva_spec_version: "2.0"
data_cid: bafybeih...
guid: c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a
recipient_list_type: public
gateways:
  - https://ipfs.io/
locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    tags: []
    categories: []
    data_path: "en/data.md"
    chapters:
      - data_path: "en/chapters/1.md"
      - data_path: "en/chapters/2.md"
```

### Subscriber-Only Post Descriptor (Encrypted)

For subscriber-only posts, the descriptor includes additional access control fields and an `encryption` block:

```yaml
savva_spec_version: "2.0"
data_cid: QmaHRmTymgC9unG14rHJpwfv6DWFgzuJjVhtjHcY8cCjkS
guid: 249c62bd-54f7-4865-bc83-922d21ed90a6
recipient_list_type: subscribers
recipient_list_min_weekly: "1000000000000000000000"
gateways:
  - https://savva.myfilebase.com/ipfs/
  - https://test.savva.app/api/ipfs/
locales:
  en:
    title: "Premium Content Title"
    text_preview: "0ee338af352029c34bfc65ab2d39bcb4622a08206a247f8e:f3f352e0df63aaac..."
    tags: []
    categories: []
    data_path: en/data.md
    chapters: []
encryption:
  type: x25519-xsalsa20-poly1305
  key_exchange_alg: x25519
  key_exchange_pub_key: cb8711e46877d7775a55d6ae446d445b500ce77f6a5514999d275280eceb707e
  access_type: for_subscribers_only
  min_weekly_pay: "1000000000000000000000"
  allow_purchase: true
  purchase_price: "99000000000000000000"
  processor_address: "0xC0959416606AEd87B09f6B205BbAD2e0cA0A9f48"
  purchase_token: "0x99eadb13da88952c18f980bd6b910adba770130e"
  recipients:
    "0xe328b70d1db5c556234cade0df86b3afbf56dd32":
      pass: f3a7cc9fe83091b562273e5395d0ad1dca3ef0f9f06cfd22bee0180a39c8541c...
      pass_nonce: d326da17dfcc6e333fc036732954370407f66df0f1141518
      pass_ephemeral_pub_key: cca725f1a50a2614cf019115f7c7ac45d1bda916813dc038055b14409c5d5e59
      reading_public_key: 1f61298e54fd3da75192f509002fc7d9e10b019b55d1806e75c7efa836836418
      reading_key_scheme: x25519-xsalsa20-poly1305
      reading_key_nonce: 18d1609e898d5e252604
```

### Descriptor Field Reference

**Root-Level Fields:**

| Field | Description |
|-------|-------------|
| `savva_spec_version` | Schema version, currently `"2.0"` |
| `data_cid` | IPFS CID of the directory containing all content files |
| `guid` | Unique identifier for the post |
| `recipient_list_type` | Access type: `"public"` or `"subscribers"` |
| `recipient_list_min_weekly` | Minimum weekly staking payment in wei (string) |
| `gateways` | List of preferred IPFS gateways for content retrieval |
| `locales` | Language-specific content metadata |
| `encryption` | Encryption block (only for subscriber-only posts) |

**Locale Fields:**

| Field | Description |
|-------|-------------|
| `title` | Post title (always unencrypted for display) |
| `text_preview` | Preview text (encrypted as `nonce:ciphertext` for subscriber posts) |
| `tags` | Array of tags (always unencrypted for indexing) |
| `categories` | Array of categories (always unencrypted for indexing) |
| `data_path` | Relative path to main content file |
| `chapters` | Array of chapter objects with `data_path` and optional `title` |

**Encryption Block Fields:**

| Field | Description |
|-------|-------------|
| `type` | Encryption scheme: `x25519-xsalsa20-poly1305` |
| `key_exchange_alg` | Key exchange algorithm: `x25519` |
| `key_exchange_pub_key` | Post's X25519 public key (hex) |
| `access_type` | Access restriction: `for_subscribers_only` |
| `min_weekly_pay` | Minimum weekly payment requirement in wei (string) |
| `allow_purchase` | Whether one-time purchase is enabled |
| `purchase_price` | Purchase price in wei (string) |
| `processor_address` | Payment processor address for purchase verification |
| `purchase_token` | Token contract address for purchase payments (SAVVA) |
| `recipients` | Map of recipient addresses to their encrypted post keys |

**Recipient Entry Fields:**

| Field | Description |
|-------|-------------|
| `pass` | Encrypted post secret key (hex) |
| `pass_nonce` | Nonce used for encryption (hex) |
| `pass_ephemeral_pub_key` | Ephemeral public key for ECDH (hex) |
| `reading_public_key` | Recipient's reading public key (hex) |
| `reading_key_scheme` | Encryption scheme for reading key |
| `reading_key_nonce` | Nonce associated with the reading key |

---

## Encryption Flow for Subscriber-Only Posts

When creating a subscriber-only post:

1. **Generate Post Key**: A random X25519 keypair is generated for the post.
2. **Encrypt Content**: The post body and chapter files are encrypted using XSalsa20-Poly1305 with the post secret key.
3. **Encrypt Previews**: The `text_preview` field is encrypted and stored as `nonce:ciphertext`.
4. **Build Recipients List**: The post key is encrypted for each eligible recipient using their published reading key via ECDH key exchange.
5. **Include Required Recipients**:
   - Post author (can always decrypt their own content)
   - All big_brothers configured for the domain
   - Payment processor (if purchase access is enabled)
   - Eligible subscribers meeting the minimum payment requirement

---

## Step 3: Upload to IPFS

The upload process happens in two distinct phases, handled by the backend's storage API.

1. **Upload Content Directory**: All content files (e.g., `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) are uploaded as a single directory to IPFS. For encrypted posts, these files are encrypted before upload. The backend returns a single IPFS CID for this directory, which becomes the `data_cid`.
2. **Upload Descriptor**: The `info.yaml` file is generated with the `data_cid` from the previous step. This YAML file is then uploaded to IPFS as a standalone file. The CID of this `info.yaml` file is the final IPFS pointer for the post.

---

## Step 4: Register on the Blockchain

The final step is to record the post on the blockchain by calling the `reg` function on the `ContentRegistry` smart contract.

The frontend executes this transaction with the following parameters:

* **domain**: The current domain name (e.g., `savva.app`).
* **author**: The user's wallet address.
* **guid**: The unique identifier from `params.json`.
* **ipfs**: The IPFS CID of the `info.yaml` descriptor file from Step 3.
* **content\_type**: A `bytes32` string, typically `post` for new content or `post-edit` for updates.

### Example Contract Call

```javascript
// From: src/x/editor/wizard_steps/StepPublish.jsx

const contract = await getSavvaContract(app, "ContentRegistry", { write: true });

const hash = await contract.write.reg([
  domain,           // "savva.app"
  user.address,     // "0x123..."
  guid,             // "c4a7f6b9-..."
  descriptorCid,    // "bafybeif..."
  toHexBytes32("post")
]);

// The UI then waits for the transaction to be confirmed
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

Once the transaction is successfully mined, the post is officially published and will appear in content feeds.
