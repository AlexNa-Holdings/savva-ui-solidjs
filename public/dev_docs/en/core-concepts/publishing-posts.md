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

### Example `info.yaml` (The Post Descriptor)

This file is the canonical definition of the post and is uploaded to IPFS. It links all the content pieces together.

```yaml
savva_spec_version: "2.0"
data_cid: bafybeih...
gateways:
  - https://ipfs.io/
locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    data_path: "en/data.md"
    chapters:
      - data_path: "en/chapters/1.md"
      - data_path: "en/chapters/2.md"
```

* **data\_cid**: The IPFS CID of the directory containing all Markdown content and uploaded files.
* **locales**: Contains language-specific metadata. The title and text\_preview from the editor are stored here.
* **data\_path / chapters.data\_path**: Relative paths to the content files within the `data_cid` directory.

---

## Step 2: Upload to IPFS

The upload process happens in two distinct phases, handled by the backend's storage API.

1. **Upload Content Directory**: All content files (e.g., `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) are uploaded as a single directory to IPFS. The backend returns a single IPFS CID for this directory, which becomes the `data_cid`.
2. **Upload Descriptor**: The `info.yaml` file is generated with the `data_cid` from the previous step. This YAML file is then uploaded to IPFS as a standalone file. The CID of this `info.yaml` file is the final IPFS pointer for the post.

---

## Step 3: Register on the Blockchain

The final step is to record the post on the blockchain by calling the `reg` function on the `ContentRegistry` smart contract.

The frontend executes this transaction with the following parameters:

* **domain**: The current domain name (e.g., `savva.app`).
* **author**: The user's wallet address.
* **guid**: The unique identifier from `params.json`.
* **ipfs**: The IPFS CID of the `info.yaml` descriptor file from Step 2.
* **content\_type**: A `bytes32` string, typically `post` for new content or `post-edit` for updates.

### Example Contract Call

```javascript
// From: src/components/editor/wizard_steps/StepPublish.jsx

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

