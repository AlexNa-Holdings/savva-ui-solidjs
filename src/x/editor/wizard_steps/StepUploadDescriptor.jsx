// src/x/editor/wizard_steps/StepUploadDescriptor.jsx
import { createSignal, createEffect, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";
import { stringify as toYaml } from "yaml";
import { httpBase } from "../../../net/endpoints.js";
import { dbg } from "../../../utils/debug.js";
import { createTextPreview } from "../../../editor/preview-utils.js";
import { isPinningEnabled, getPinningServices } from "../../../ipfs/pinning/storage.js";
import { encryptDescriptorLocale, buildEncryptionSection } from "../../crypto/postEncryption.js";
import { fetchEligibleSubscribers } from "../../crypto/fetchEligibleSubscribers.js";
import { storePostKey } from "../../../editor/storage.js";
import { getSavvaContract } from "../../../blockchain/contracts.js";

export default function StepUploadDescriptor(props) {
  const app = useApp();
  const { t } = app;

  const [error, setError] = createSignal(null);
  const [isUploading, setIsUploading] = createSignal(true);
  const [hasStarted, setHasStarted] = createSignal(false);

  const trace = globalThis.crypto?.randomUUID?.() ?? `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const L = (...a) => dbg.log("StepUploadDescriptor", trace, ...a);
  const E = (...a) => dbg.error("StepUploadDescriptor", trace, ...a);

  function extractCid(v) {
    if (!v) return undefined;
    if (typeof v === "string") return v.trim() || undefined;
    if (typeof v === "object") {
      try {
        const s = String(v.toString?.() ?? "");
        if (s && s !== "[object Object]") return s.trim() || undefined;
      } catch { }
      const candidates = [v.ipfsCid, v.cid, v.data_cid, v.dataCid, v.value, v["/"], v.result, v.payload, v.data];
      for (const c of candidates) {
        const s = extractCid(c);
        if (s) return s;
      }
    }
    return undefined;
  }
  const summarize = (o) => {
    try { return JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "string" && v.length > 120 ? v.slice(0, 117) + "…" : v))); }
    catch { return o; }
  };

  function getDataCid() {
    const pd = props.publishedData?.();
    const out = extractCid(pd);
    L("getDataCid()", { publishedData: summarize(pd), resolved: out });
    return out;
  }

  function xhrPostForm(url, formData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.withCredentials = true; // << important for cookie-based auth
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error("Invalid JSON response")); }
        } else {
          reject(new Error(`XHR ${xhr.status} ${xhr.responseText || ""}`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error (XHR)"));
      xhr.send(formData);
    });
  }

  async function uploadDescriptor(data_cid) {
    const { postData, postParams, editorMode } = props;
    L("start uploadDescriptor()", { data_cid, editorMode, httpBase: httpBase() });

    const params = postParams();
    const content = postData();

    const contentType = (editorMode === "new_comment" || editorMode === "edit_comment") ? "comment" : "post";
    const descriptor = {
      savva_spec_version: "2.0",
      data_cid,
      locales: {},
    };

    if (params.guid) descriptor.guid = params.guid;
    if (params.parent_savva_cid) descriptor.parent_savva_cid = params.parent_savva_cid;
    if (params.root_savva_cid) descriptor.root_savva_cid = params.root_savva_cid;
    if (params.nsfw) descriptor.nsfw = params.nsfw;
    if (params.fundraiser) descriptor.fundraiser = params.fundraiser;
    if (params.thumbnail) {
      let tn = String(params.thumbnail || "").trim();
      tn = tn.replace(/^\/+/, "");
      if (!/^uploads\//.test(tn) && !/^https?:\/\//i.test(tn) && !tn.startsWith("ipfs://")) {
        tn = !tn.includes("/") ? `uploads/${tn}` : `uploads/${tn}`;
      }
      descriptor.thumbnail = tn;
    }

    // Add recipient list information for posts
    if (contentType === "post") {
      // Set recipient_list_type based on audience
      if (params.audience === "subscribers") {
        descriptor.recipient_list_type = "subscribers";
        // Add minimum weekly payment if specified (convert from wei to token amount as string)
        if (params.minWeeklyPaymentWei && params.minWeeklyPaymentWei > 0n) {
          descriptor.recipient_list_min_weekly = params.minWeeklyPaymentWei.toString();
        }
        // Note: purchase access fields (allow_purchase, purchase_price, processor_address, purchase_token)
        // are added only to the encryption section, not at the descriptor root level
      } else {
        descriptor.recipient_list_type = "public";
      }
    }

    const gateways = isPinningEnabled()
      ? (getPinningServices().map((s) => s.gatewayUrl).filter(Boolean) || [])
      : (app.info()?.ipfs_gateways || []);
    if (gateways.length) descriptor.gateways = gateways;

    // Check if encryption is needed:
    // 1. For posts: subscribers-only audience
    // 2. For comments: parent post is encrypted
    const isComment = contentType === "comment";
    let needsEncryption = params.audience === "subscribers";
    let isCommentOnEncryptedPost = false;
    let parentPostRecipients = [];

    // For comments, check if parent post is encrypted
    if (isComment && params.root_savva_cid) {
      L("Checking if parent post is encrypted", { root_savva_cid: params.root_savva_cid });
      try {
        const { fetchParentPostEncryption } = await import("../../crypto/fetchParentPostEncryption.js");
        const parentEncryption = await fetchParentPostEncryption(app, params.root_savva_cid);

        if (parentEncryption) {
          isCommentOnEncryptedPost = true;
          needsEncryption = true;
          parentPostRecipients = parentEncryption.recipients;
          L(`Parent post is encrypted with ${parentPostRecipients.length} recipients`);
        } else {
          L("Parent post is not encrypted");
        }
      } catch (err) {
        E("Failed to check parent post encryption", err);
        // Don't fail the whole publish if we can't check parent encryption
        // User might be commenting on a post that doesn't exist yet or is inaccessible
      }
    }

    let postEncryptionKey = null;
    let recipients = [];

    if (needsEncryption) {
      L("Encryption needed", { isComment, isCommentOnEncryptedPost, hasParentRecipients: parentPostRecipients.length > 0 });

      // Get the actor address (who is posting - could be NPO or user)
      const actorAddress = app.actorAddress?.() || app.authorizedUser?.()?.address;
      if (!actorAddress) {
        throw new Error("Actor address not found");
      }

      // Get the authorized user address (the wallet user signing the transaction)
      const authorizedUserAddress = app.authorizedUser?.()?.address;
      if (!authorizedUserAddress) {
        throw new Error("Authorized user address not found");
      }

      L("Addresses for encryption", { actorAddress, authorizedUserAddress });

      // FIRST: Check if authorized user has a reading key (required to decrypt their own posts)
      const { fetchReadingKey } = await import("../../crypto/readingKey.js");
      let authorizedUserReadingKey;

      try {
        authorizedUserReadingKey = await fetchReadingKey(app, authorizedUserAddress);
      } catch (err) {
        E("Failed to fetch authorized user reading key", err);
        throw new Error(t("editor.publish.encryption.authorKeyFetchError"));
      }

      if (!authorizedUserReadingKey || !authorizedUserReadingKey.publicKey) {
        E("Authorized user does not have a reading key - prompting user to generate one");

        // Prompt user to generate and publish reading key
        const shouldGenerate = confirm(
          "To publish encrypted posts, you need to generate a Reading Key. " +
          "This will require signing a message with your wallet.\n\n" +
          "Generate Reading Key now?"
        );

        if (!shouldGenerate) {
          throw new Error("Publishing encrypted posts requires a Reading Key");
        }

        // Generate and publish the reading key
        const { generateReadingKey, publishReadingKey } = await import("../../crypto/readingKey.js");

        try {
          L("Generating reading key for authorized user");
          const newReadingKey = await generateReadingKey(authorizedUserAddress);
          L("Reading key generated", { publicKey: newReadingKey.publicKey });

          L("Publishing reading key to blockchain");
          await publishReadingKey(app, newReadingKey.publicKey, newReadingKey.nonce);
          L("Reading key published successfully");

          // Use the newly generated key
          authorizedUserReadingKey = newReadingKey;
        } catch (err) {
          E("Failed to generate/publish reading key", err);
          throw new Error("Failed to generate Reading Key: " + err.message);
        }
      } else {
        L("Authorized user reading key found", { publicKey: authorizedUserReadingKey.publicKey });
      }

      // Get the encryption key from publishedData (generated in StepUploadIPFS)
      const pd = props.publishedData?.();
      postEncryptionKey = pd?.postEncryptionKey;

      if (!postEncryptionKey) {
        E("Post encryption key not found in publishedData");
        throw new Error("Post encryption key not found. This should have been generated in the IPFS upload step.");
      }

      L("Using post encryption key from StepUploadIPFS", { publicKey: postEncryptionKey.publicKey });

      // Determine recipients based on content type
      if (isCommentOnEncryptedPost && parentPostRecipients.length > 0) {
        // For comments on encrypted posts: use parent post's recipients
        L(`Fetching reading keys for ${parentPostRecipients.length} parent post recipients`);

        const recipientPromises = parentPostRecipients.map(async (address) => {
          try {
            const readingKey = await fetchReadingKey(app, address);
            if (readingKey && readingKey.publicKey) {
              return {
                address: address,
                publicKey: readingKey.publicKey,
                scheme: readingKey.scheme,
                nonce: readingKey.nonce,
                amount: 0n,
                weeks: 0,
              };
            }
            return null;
          } catch (err) {
            E(`Failed to fetch reading key for parent recipient ${address}`, err);
            return null;
          }
        });

        recipients = (await Promise.all(recipientPromises)).filter(r => r !== null);
        L(`Successfully fetched ${recipients.length} reading keys from ${parentPostRecipients.length} parent recipients`);

      } else {
        // For regular subscriber-only posts: fetch eligible subscribers for the ACTOR (NPO or user posting)
        const minPaymentWei = params.minWeeklyPaymentWei || 0n;

        try {
          recipients = await fetchEligibleSubscribers(app, actorAddress, minPaymentWei);
          L(`Found ${recipients.length} eligible subscribers with reading keys for actor ${actorAddress}`);
        } catch (err) {
          E("Failed to fetch subscribers", err);
          throw new Error("Failed to fetch eligible subscribers: " + err.message);
        }

        // Check if there are any eligible subscribers with reading keys
        // Skip this check if purchase access is enabled - processor alone is sufficient
        const hasPurchaseAccess = params.allowPurchase && params.purchasePriceWei && params.purchasePriceWei > 0n;
        if (recipients.length === 0 && !hasPurchaseAccess) {
          E("No eligible subscribers with published reading keys found");
          throw new Error(t("editor.publish.encryption.noRecipientsWithKeys"));
        }
      }

      // IMPORTANT: Ensure authorized user (wallet signer) is in recipients list so they can decrypt
      const authorizedUserInRecipients = recipients.some(
        r => String(r.address).toLowerCase() === String(authorizedUserAddress).toLowerCase()
      );

      if (!authorizedUserInRecipients) {
        L("Adding authorized user to recipients");
        recipients.push({
          address: authorizedUserAddress,
          publicKey: authorizedUserReadingKey.publicKey,
          scheme: authorizedUserReadingKey.scheme,
          nonce: authorizedUserReadingKey.nonce,
          amount: 0n,
          weeks: 0,
        });
      } else {
        L("Authorized user is already in recipients list");
      }

      // Add big_brothers from domain configuration to recipients
      const currentDomain = app.selectedDomainName?.();
      const info = app.info();
      const domainConfig = info?.domains?.find(d => d.name === currentDomain);
      const bigBrothers = domainConfig?.big_brothers || [];

      const bigBrothersMissingKeys = [];

      if (bigBrothers.length > 0) {
        L(`Adding ${bigBrothers.length} big_brothers from domain config to recipients`);

        // Create a set of existing recipient addresses for deduplication
        const existingAddresses = new Set(
          recipients.map(r => String(r.address).toLowerCase())
        );

        for (const bbAddress of bigBrothers) {
          // Skip if this address is already in the recipient list
          if (existingAddresses.has(String(bbAddress).toLowerCase())) {
            L(`Big brother ${bbAddress} is already in recipient list - skipping`);
            continue;
          }

          try {
            const bbReadingKey = await fetchReadingKey(app, bbAddress);
            if (bbReadingKey && bbReadingKey.publicKey) {
              recipients.push({
                address: bbAddress,
                publicKey: bbReadingKey.publicKey,
                scheme: bbReadingKey.scheme,
                nonce: bbReadingKey.nonce,
                amount: 0n,
                weeks: 0,
              });
              existingAddresses.add(String(bbAddress).toLowerCase());
              L(`Added big_brother ${bbAddress} to recipients`);
            } else {
              E(`Big brother ${bbAddress} does not have a reading key - will not be able to decrypt`);
              bigBrothersMissingKeys.push(bbAddress);
            }
          } catch (err) {
            E(`Failed to fetch reading key for big_brother ${bbAddress}`, err);
            bigBrothersMissingKeys.push(bbAddress);
            // Continue with other big brothers even if one fails
          }
        }

        // Check if some big_brothers don't have reading keys - this is a critical error
        if (bigBrothersMissingKeys.length > 0) {
          const addressList = bigBrothersMissingKeys.map(addr => `• ${addr}`).join('\n');
          const errorMessage = `Cannot publish encrypted post: ${bigBrothersMissingKeys.length} domain moderator(s) do not have reading keys published:\n\n${addressList}\n\nThey need to generate and publish their reading keys first. Contact domain administrators to resolve this issue.`;

          E("Some big_brothers missing reading keys - blocking publish:", bigBrothersMissingKeys);

          // Throw error to stop the publish process
          throw new Error(errorMessage);
        }
      }

      // Add processor_address to recipients if purchase access is enabled
      if (params.allowPurchase && params.purchasePriceWei && params.purchasePriceWei > 0n) {
        const processorAddress = app.info()?.processor_address;
        if (processorAddress) {
          // Create a set of existing recipient addresses for deduplication
          const existingAddresses = new Set(
            recipients.map(r => String(r.address).toLowerCase())
          );

          if (!existingAddresses.has(String(processorAddress).toLowerCase())) {
            try {
              const processorReadingKey = await fetchReadingKey(app, processorAddress);
              if (processorReadingKey && processorReadingKey.publicKey) {
                recipients.push({
                  address: processorAddress,
                  publicKey: processorReadingKey.publicKey,
                  scheme: processorReadingKey.scheme,
                  nonce: processorReadingKey.nonce,
                  amount: 0n,
                  weeks: 0,
                });
                L(`Added processor_address ${processorAddress} to recipients for purchase access`);
              } else {
                E(`Processor ${processorAddress} does not have a reading key - purchase access won't work`);
                throw new Error(`Payment processor does not have a reading key published. Purchase access feature is not available. Contact site administrators.`);
              }
            } catch (err) {
              if (err.message.includes("Payment processor")) throw err;
              E(`Failed to fetch reading key for processor ${processorAddress}`, err);
              throw new Error(`Failed to fetch payment processor reading key: ${err.message}`);
            }
          } else {
            L(`Processor ${processorAddress} is already in recipient list`);
          }
        } else {
          E("No processor_address in backend info - cannot enable purchase access");
          throw new Error("Payment processor not configured. Purchase access feature is not available.");
        }
      }

      L(`Total recipients (including author, big_brothers, and processor): ${recipients.length}`);
    }

    const langs = [];
    for (const lang in content) {
      const data = content[lang] || {};
      const hasTitle = !!data.title?.trim();
      const hasBody = !!data.body?.trim();
      const hasChapters = Array.isArray(data.chapters) && data.chapters.some((c) => !!c?.body?.trim());
      if (!hasTitle && !hasBody && !hasChapters) continue;

      langs.push(lang);
      const langParams = params.locales?.[lang] || {};
      let locale = {
        title: data.title || "",
        text_preview: createTextPreview(data.body || "", contentType),
        tags: langParams.tags || [],
        categories: langParams.categories || [],
        data_path: `${lang}/data.md`,
        chapters: [],
      };

      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          const chapterParams = langParams.chapters?.[i] || {};
          locale.chapters.push({
            title: chapterParams.title || `Chapter ${i + 1}`,
            data_path: `${lang}/chapters/${i + 1}.md`,
          });
        }
      }

      // Encrypt locale if needed
      if (needsEncryption && postEncryptionKey) {
        L(`Encrypting locale: ${lang}`);
        locale = encryptDescriptorLocale(locale, postEncryptionKey.secretKey);
      }

      descriptor.locales[lang] = locale;
    }

    // Add encryption section if needed
    if (needsEncryption && postEncryptionKey && recipients.length > 0) {
      L("Building encryption section");

      // Build encryption options
      const encryptionOptions = {};

      // For subscriber-only posts, add access_type and min_weekly_pay
      if (params.audience === "subscribers") {
        encryptionOptions.accessType = "for_subscribers_only";
        if (params.minWeeklyPaymentWei && params.minWeeklyPaymentWei > 0n) {
          encryptionOptions.minWeeklyPay = params.minWeeklyPaymentWei.toString();
        }
        // Add purchase access info if enabled
        if (params.allowPurchase && params.purchasePriceWei && params.purchasePriceWei > 0n) {
          encryptionOptions.allowPurchase = true;
          encryptionOptions.purchasePrice = params.purchasePriceWei.toString();
          const processorAddress = app.info()?.processor_address;
          if (processorAddress) {
            encryptionOptions.processorAddress = processorAddress;
          }
          // Add purchase token (SAVVA token address)
          try {
            const savvaToken = await getSavvaContract(app, "SavvaToken");
            if (savvaToken?.address) {
              encryptionOptions.purchaseToken = savvaToken.address.toLowerCase();
            }
          } catch (e) {
            L("Failed to get SAVVA token address for purchaseToken", e);
          }
        }
      }

      descriptor.encryption = buildEncryptionSection(
        postEncryptionKey.publicKey,
        recipients,
        postEncryptionKey.secretKey,
        encryptionOptions
      );
      L(`Encryption section added with ${recipients.length} recipients`, { encryptionOptions });
    }

    L("descriptor composed", { languages: langs, gateways, encrypted: needsEncryption, recipients: recipients.length });

    let yamlStr;
    try { yamlStr = toYaml(descriptor); }
    catch (e) { E("yaml stringify error", e); throw new Error(t("editor.publish.descriptor.errorTitle")); }

    const descriptorFile = new File([yamlStr], "info.yaml", { type: "application/x-yaml" });

    const urlStore = `${httpBase()}store`;
    const form = new FormData();
    form.append("file", descriptorFile, "info.yaml");

    // XHR (cookies only, no custom headers to dodge preflight)
    L("POST /store via XHR", { url: urlStore });
    const json = await xhrPostForm(urlStore, form);

    const cid = extractCid(json);
    if (!cid) throw new Error("API did not return a 'cid' for the uploaded descriptor.");
    L("success", { cid });

    // Return both the CID and the encryption key (if encrypted)
    return {
      descriptorCid: cid,
      postEncryptionKey: needsEncryption ? postEncryptionKey : null,
    };
  }

  function tryStart() {
    const dataCid = getDataCid();
    L("tryStart()", { hasStarted: hasStarted(), dataCid });
    if (!dataCid || hasStarted()) return;

    setHasStarted(true);
    setIsUploading(true);

    setTimeout(async () => {
      L("kickoff");
      try {
        const result = await uploadDescriptor(dataCid);
        L("onComplete()", { result });

        // Store the encryption key if post is encrypted
        if (result.postEncryptionKey) {
          const guid = props.postParams?.()?.guid;
          if (guid) {
            storePostKey(guid, result.postEncryptionKey.secretKey);
            L("Stored post encryption key", { guid });
          } else {
            E("Cannot store encryption key: no GUID found");
          }
        }

        props.onComplete?.(result);
      } catch (e) {
        E("error", e);
        setError(e?.message || t("editor.publish.descriptor.errorTitle"));
      } finally {
        setIsUploading(false);
        L("done");
      }
    }, 250);
  }

  onMount(() => {
    L("mounted");
    tryStart();
  });

  createEffect(() => {
    const pd = props.publishedData?.();
    const cid = extractCid(pd);
    L("effect", { pd: summarize(pd), resolved: cid, hasStarted: hasStarted() });
    tryStart();
  });

  return (
    <div class="flex flex-col items-center justify-center h-full">
      <Show when={isUploading()}>
        <Spinner />
        <p class="mt-2 text-sm">{t("editor.publish.uploadingDescriptor")}...</p>
      </Show>

      <Show when={error()}>
        <div class="text-center p-4">
          <h4 class="font-bold text-red-600">{t("editor.publish.descriptor.errorTitle")}</h4>
          <p class="mt-2 text-sm whitespace-pre-wrap">{error()}</p>
          <button
            onClick={props.onCancel}
            class="mt-4 px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
          >
            {t("editor.publish.validation.backToEditor")}
          </button>
        </div>
      </Show>
    </div>
  );
}
