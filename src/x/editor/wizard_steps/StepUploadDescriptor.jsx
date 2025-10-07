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

    const gateways = isPinningEnabled()
      ? (getPinningServices().map((s) => s.gatewayUrl).filter(Boolean) || [])
      : (app.info()?.ipfs_gateways || []);
    if (gateways.length) descriptor.gateways = gateways;

    // Check if encryption is needed (subscribers-only audience)
    const needsEncryption = params.audience === "subscribers";
    let postEncryptionKey = null;
    let recipients = [];

    if (needsEncryption) {
      L("Encryption needed - generating post key and fetching subscribers");

      const authorAddress = app.authorizedUser?.()?.address;
      if (!authorAddress) {
        throw new Error("Author address not found");
      }

      // FIRST: Check if author has a reading key (required to decrypt their own posts)
      const { fetchReadingKey } = await import("../../crypto/readingKey.js");
      let authorReadingKey;

      try {
        authorReadingKey = await fetchReadingKey(app, authorAddress);
      } catch (err) {
        E("Failed to fetch author reading key", err);
        throw new Error(t("editor.publish.encryption.authorKeyFetchError"));
      }

      if (!authorReadingKey || !authorReadingKey.publicKey) {
        E("Author does not have a reading key");
        throw new Error(t("editor.publish.encryption.authorNoReadingKey"));
      }

      L("Author reading key found", { publicKey: authorReadingKey.publicKey });

      // Get the encryption key from publishedData (generated in StepUploadIPFS)
      const pd = props.publishedData?.();
      postEncryptionKey = pd?.postEncryptionKey;

      if (!postEncryptionKey) {
        E("Post encryption key not found in publishedData");
        throw new Error("Post encryption key not found. This should have been generated in the IPFS upload step.");
      }

      L("Using post encryption key from StepUploadIPFS", { publicKey: postEncryptionKey.publicKey });

      // Fetch eligible subscribers with their reading keys
      const minPaymentWei = params.minWeeklyPaymentWei || 0n;

      try {
        recipients = await fetchEligibleSubscribers(app, authorAddress, minPaymentWei);
        L(`Found ${recipients.length} eligible subscribers with reading keys`);
      } catch (err) {
        E("Failed to fetch subscribers", err);
        throw new Error("Failed to fetch eligible subscribers: " + err.message);
      }

      // Check if there are any eligible subscribers with reading keys
      if (recipients.length === 0) {
        E("No eligible subscribers with published reading keys found");
        throw new Error(t("editor.publish.encryption.noRecipientsWithKeys"));
      }

      // IMPORTANT: Add author to recipients so they can decrypt their own post
      recipients.push({
        address: authorAddress,
        publicKey: authorReadingKey.publicKey,
        scheme: authorReadingKey.scheme,
        nonce: authorReadingKey.nonce,
        amount: 0n,
        weeks: 0,
      });

      L(`Total recipients (including author): ${recipients.length}`);
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
      descriptor.encryption = buildEncryptionSection(
        postEncryptionKey.publicKey,
        recipients,
        postEncryptionKey.secretKey
      );
      L(`Encryption section added with ${recipients.length} recipients`);
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
