// src/x/editor/wizard_steps/StepUploadIPFS.jsx
import { createSignal, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";
import { getAllUploadedFileNames, getUploadedFileAsFileObject, DRAFT_DIRS } from "../../../editor/storage.js";
import { httpBase } from "../../../net/endpoints.js";
import { dbg } from "../../../utils/debug.js";
import { isPinningEnabled, getPinningServices } from "../../../ipfs/pinning/storage.js";
import { pinDirectory } from "../../../ipfs/pinning/manager.js";
import { fetchWithTimeout } from "../../../utils/net.js";
import { encryptTextContent, encryptFile } from "../../crypto/fileEncryption.js";

export default function StepUploadIPFS(props) {
  const app = useApp();
  const { t } = app;
  const [error, setError] = createSignal(null);
  const [isUploading, setIsUploading] = createSignal(true);
  const [uploadProgress, setUploadProgress] = createSignal(0);
  const [uploadMessage, setUploadMessage] = createSignal(t("editor.publish.uploadingToIpfs"));

  // --- helpers ---------------------------------------------------------------

  const resolveBaseDir = (mode) => {
    if (mode === "new_post") return DRAFT_DIRS.NEW_POST;
    if (mode === "new_comment") return DRAFT_DIRS.NEW_COMMENT;
    if (mode === "edit_post" || mode === "edit_comment") return DRAFT_DIRS.EDIT;
    return "unknown";
  };

  const getFilesFromDraft = async () => {
    const { postData, editorMode, postParams } = props;
    const files = [];

    const baseDir = resolveBaseDir(editorMode);
    const content = postData();
    const params = postParams();

    // Check if encryption is needed:
    // 1. For posts: subscribers-only audience
    // 2. For comments: parent post is encrypted
    const isComment = editorMode === "new_comment" || editorMode === "edit_comment";
    let needsEncryption = params.audience === "subscribers";

    // For comments, check if parent post is encrypted
    if (isComment && params.root_savva_cid && !needsEncryption) {
      dbg.log("StepUploadIPFS", "Checking if parent post is encrypted", { root_savva_cid: params.root_savva_cid });
      try {
        const { fetchParentPostEncryption } = await import("../../crypto/fetchParentPostEncryption.js");
        const parentEncryption = await fetchParentPostEncryption(app, params.root_savva_cid);

        if (parentEncryption) {
          needsEncryption = true;
          dbg.log("StepUploadIPFS", `Parent post is encrypted - will encrypt comment`);
        }
      } catch (err) {
        dbg.error("StepUploadIPFS", "Failed to check parent post encryption", err);
        // Don't fail if we can't check - maybe the post is being created concurrently
      }
    }

    // Generate post encryption key if needed
    let postEncryptionKey = null;
    let postSecretKey = null;

    if (needsEncryption) {
      const { generatePostEncryptionKey } = await import("../../crypto/postEncryption.js");
      postEncryptionKey = generatePostEncryptionKey();
      postSecretKey = postEncryptionKey.secretKey;
      dbg.log("StepUploadIPFS", "Generated post encryption key", { publicKey: postEncryptionKey.publicKey });
    }

    dbg.log("StepUploadIPFS", "collect start", {
      editorMode,
      baseDir,
      langs: Object.keys(content || {}),
      needsEncryption,
      isComment
    });

    // 1) Markdown files
    for (const lang in content) {
      const data = content[lang];
      const path = `${lang}/data.md`;

      let fileContent = data.body || "";
      let file;

      if (needsEncryption && postSecretKey) {
        // Encrypt the markdown content
        const encryptedData = encryptTextContent(fileContent, postSecretKey);
        file = new File([encryptedData], path, { type: "application/octet-stream" });
        dbg.log("StepUploadIPFS", "encrypted file", { path, originalSize: fileContent.length, encryptedSize: encryptedData.length });
      } else {
        file = new File([fileContent], path, { type: "text/markdown" });
      }

      files.push({ file, path });

      // Handle chapters
      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          const chapterPath = `${lang}/chapters/${i + 1}.md`;
          const chapterContent = data.chapters[i].body || "";
          let chapterFile;

          if (needsEncryption && postSecretKey) {
            const encryptedData = encryptTextContent(chapterContent, postSecretKey);
            chapterFile = new File([encryptedData], chapterPath, { type: "application/octet-stream" });
            dbg.log("StepUploadIPFS", "encrypted chapter", { path: chapterPath, originalSize: chapterContent.length, encryptedSize: encryptedData.length });
          } else {
            chapterFile = new File([chapterContent], chapterPath, { type: "text/markdown" });
          }

          files.push({ file: chapterFile, path: chapterPath });
        }
      }
    }

    // 2) Uploads (images, etc.)
    const assetNames = await getAllUploadedFileNames(baseDir);
    dbg.log("StepUploadIPFS", "storage uploads list", { baseDir, assetNames, needsEncryption });

    for (const name of assetNames) {
      const file = await getUploadedFileAsFileObject(baseDir, name);
      if (file) {
        let uploadFile = file;

        if (needsEncryption && postSecretKey) {
          // Encrypt the uploaded file
          uploadFile = await encryptFile(file, postSecretKey);
          dbg.log("StepUploadIPFS", "encrypted upload", { name, originalSize: file.size, encryptedSize: uploadFile.size });
        }

        files.push({ file: uploadFile, path: `uploads/${name}` });
      } else {
        dbg.warn?.("StepUploadIPFS", "missing file object for", { baseDir, name });
      }
    }

    // Log sizes for traceability
    const filesPreview = files.map((it) => ({
      path: it.path,
      size: it.file?.size ?? 0,
      type: it.file?.type || "",
    }));
    dbg.log("StepUploadIPFS", "files to be uploaded", {
      baseDir,
      count: files.length,
      filesPreview,
      encrypted: needsEncryption,
    });

    return { files, baseDir, postEncryptionKey };
  };

  const uploadToPinningServices = async () => {
    setUploadMessage(t("editor.publish.uploadingToPinServices"));
    const services = getPinningServices();
    if (services.length === 0) throw new Error(t("editor.publish.ipfs.errorNoServices"));

    const { files, baseDir, postEncryptionKey } = await getFilesFromDraft();
    dbg.log("StepUploadIPFS", "pin: files count", { count: files.length, baseDir, hasEncryptionKey: !!postEncryptionKey });

    const progressMap = new Map(services.map((s) => [s.id, 0]));
    const updateTotalProgress = () => {
      const sum = Array.from(progressMap.values()).reduce((a, b) => a + b, 0);
      setUploadProgress(Math.round(sum / services.length));
    };

    const cids = await Promise.all(
      services.map(async (service) => {
        try {
          const cid = await pinDirectory(service, files, {
            onProgress: (p) => {
              progressMap.set(service.id, p);
              updateTotalProgress();
            },
          });

          // quick verification of a deterministic path
          const content = props.postData();
          const langs = Object.keys(content || {});
          const firstLangWithContent = langs[0] || "en";
          const verificationPath = `${firstLangWithContent}/data.md`;
          const gatewayUrl = service.gatewayUrl.trim().replace(/\/+$/, "");
          const verifyUrl = `${gatewayUrl}/ipfs/${cid}/${verificationPath}`;

          dbg.log("StepUploadIPFS", "pin verify", { service: service.name, verifyUrl });

          await new Promise((r) => setTimeout(r, 3000));
          await fetchWithTimeout(verifyUrl, { timeoutMs: 30000 });
          return cid;
        } catch (e) {
          dbg.error("StepUploadIPFS", "pin service failed", { service: service.name, message: e?.message, stack: e?.stack });
          throw new Error(`Failed on service '${service.name}': ${e.message}`);
        }
      })
    );

    const firstCid = cids[0];
    if (!cids.every((cid) => cid === firstCid)) {
      dbg.error("StepUploadIPFS", "inconsistent CIDs", { cids });
      throw new Error("Inconsistent CIDs returned from pinning services.");
    }
    return { ipfsCid: firstCid, postEncryptionKey };
  };

  const uploadToBackend = async () => {
    const { postData, editorMode, postParams } = props;
    const baseDir = resolveBaseDir(editorMode);
    const formData = new FormData();
    const content = postData();
    const params = postParams();

    // Check if encryption is needed (subscribers-only audience)
    const needsEncryption = params.audience === "subscribers";

    // Generate post encryption key if needed
    let postEncryptionKey = null;
    let postSecretKey = null;

    if (needsEncryption) {
      const { generatePostEncryptionKey } = await import("../../crypto/postEncryption.js");
      postEncryptionKey = generatePostEncryptionKey();
      postSecretKey = postEncryptionKey.secretKey;
      dbg.log("StepUploadIPFS", "backend: Generated post encryption key", { publicKey: postEncryptionKey.publicKey });
    }

    dbg.log("StepUploadIPFS", "backend: start", {
      editorMode,
      baseDir,
      langs: Object.keys(content || {}),
      needsEncryption
    });

    // markdown
    for (const lang in content) {
      const data = content[lang];
      const path = `${lang}/data.md`;
      const fileContent = data.body || "";

      if (needsEncryption && postSecretKey) {
        const encryptedData = encryptTextContent(fileContent, postSecretKey);
        formData.append("file", new File([encryptedData], path, { type: "application/octet-stream" }));
        dbg.log("StepUploadIPFS", "backend: encrypted file", { path, size: encryptedData.length });
      } else {
        formData.append("file", new File([fileContent], path, { type: "text/markdown" }));
      }

      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          const chapterPath = `${lang}/chapters/${i + 1}.md`;
          const chapterContent = data.chapters[i].body || "";

          if (needsEncryption && postSecretKey) {
            const encryptedData = encryptTextContent(chapterContent, postSecretKey);
            formData.append("file", new File([encryptedData], chapterPath, { type: "application/octet-stream" }));
            dbg.log("StepUploadIPFS", "backend: encrypted chapter", { path: chapterPath, size: encryptedData.length });
          } else {
            formData.append("file", new File([chapterContent], chapterPath, { type: "text/markdown" }));
          }
        }
      }
    }

    // uploads
    const assetFileNames = await getAllUploadedFileNames(baseDir);
    dbg.log("StepUploadIPFS", "backend: storage uploads list", { baseDir, assetFileNames, needsEncryption });

    for (const fileName of assetFileNames) {
      const file = await getUploadedFileAsFileObject(baseDir, fileName);
      if (file) {
        if (needsEncryption && postSecretKey) {
          const encryptedFile = await encryptFile(file, postSecretKey);
          formData.append("file", encryptedFile, `uploads/${fileName}`);
          dbg.log("StepUploadIPFS", "backend: encrypted upload", { fileName, originalSize: file.size, encryptedSize: encryptedFile.size });
        } else {
          formData.append("file", file, `uploads/${fileName}`);
        }
      } else {
        dbg.warn?.("StepUploadIPFS", "backend: missing file object", { baseDir, fileName });
      }
    }

    const cid = await uploadWithProgress(`${httpBase()}store-dir`, formData, { baseDir, assetCount: assetFileNames.length });
    return { ipfsCid: cid, postEncryptionKey };
  };

  const uploadWithProgress = (url, formData, ctx = {}) => {
    dbg.log("StepUploadIPFS", "xhr upload begin", { url, ...ctx });
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const json = JSON.parse(xhr.responseText);
            dbg.log("StepUploadIPFS", "xhr upload done", { status: xhr.status, cid: json?.cid });
            resolve(json.cid);
          } else {
            dbg.error("StepUploadIPFS", "xhr upload failed", { status: xhr.status, body: xhr.responseText });
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
          }
        } catch (e) {
          dbg.error("StepUploadIPFS", "xhr invalid JSON", { body: xhr.responseText });
          reject(new Error("Upload failed: invalid JSON response"));
        }
      };
      xhr.onerror = () => {
        dbg.error("StepUploadIPFS", "xhr network error");
        reject(new Error("Network error during upload"));
      };
      xhr.send(formData);
    });
  };

  // --- lifecycle -------------------------------------------------------------

  onMount(() => {
    setTimeout(async () => {
      try {
        const usePinners = isPinningEnabled();
        const result = usePinners ? await uploadToPinningServices() : await uploadToBackend();
        dbg.log("StepUploadIPFS", "Upload complete", result);
        props.onComplete?.(result);
      } catch (e) {
        dbg.error("StepUploadIPFS", "upload process error", { message: e?.message, stack: e?.stack });
        setError(e.message);
      } finally {
        setIsUploading(false);
      }
    }, 500);
  });

  // --- UI --------------------------------------------------------------------

  return (
    <div class="flex flex-col items-center justify-center h-full">
      <Show when={isUploading()}>
        <Spinner />
        <p class="mt-2 text-sm">{uploadMessage()}</p>
        <div class="w-full max-w-sm bg-[hsl(var(--muted))] rounded-full h-2.5 mt-4">
          <div class="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress()}%` }}></div>
        </div>
        <p class="text-xs mt-1">{uploadProgress()}%</p>
      </Show>
      <Show when={error()}>
        <div class="text-center p-4">
          <h4 class="font-bold text-red-600">{t("editor.publish.ipfs.errorTitle")}</h4>
          <p class="mt-2 text-sm">{error()}</p>
          <button onClick={props.onCancel} class="mt-4 px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]">
            {t("editor.publish.validation.backToEditor")}
          </button>
        </div>
      </Show>
    </div>
  );
}
