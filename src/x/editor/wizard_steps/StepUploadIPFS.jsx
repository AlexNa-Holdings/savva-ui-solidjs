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
    const { postData, editorMode } = props;
    const files = [];

    const baseDir = resolveBaseDir(editorMode);
    const content = postData();

    dbg.log("StepUploadIPFS", "collect start", { editorMode, baseDir, langs: Object.keys(content || {}) });

    // 1) Markdown files
    for (const lang in content) {
      const data = content[lang];
      const path = `${lang}/data.md`;
      files.push({ file: new File([data.body || ""], path, { type: "text/markdown" }), path });

      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          const chapterPath = `${lang}/chapters/${i + 1}.md`;
          files.push({
            file: new File([data.chapters[i].body || ""], chapterPath, { type: "text/markdown" }),
            path: chapterPath,
          });
        }
      }
    }

    // 2) Uploads
    const assetNames = await getAllUploadedFileNames(baseDir);
    dbg.log("StepUploadIPFS", "storage uploads list", { baseDir, assetNames });

    for (const name of assetNames) {
      const file = await getUploadedFileAsFileObject(baseDir, name);
      if (file) {
        files.push({ file, path: `uploads/${name}` });
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
    });

    return { files, baseDir, contentRefs, missing, extra };
  };

  const uploadToPinningServices = async () => {
    setUploadMessage(t("editor.publish.uploadingToPinServices"));
    const services = getPinningServices();
    if (services.length === 0) throw new Error(t("editor.publish.ipfs.errorNoServices"));

    const { files, baseDir } = await getFilesFromDraft();
    dbg.log("StepUploadIPFS", "pin: files count", { count: files.length, baseDir });

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
    return firstCid;
  };

  const uploadToBackend = async () => {
    const { postData, editorMode } = props;
    const baseDir = resolveBaseDir(editorMode);
    const formData = new FormData();
    const content = postData();

    dbg.log("StepUploadIPFS", "backend: start", { editorMode, baseDir, langs: Object.keys(content || {}) });

    // markdown
    for (const lang in content) {
      const data = content[lang];
      formData.append("file", new File([data.body || ""], `${lang}/data.md`, { type: "text/markdown" }));
      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          formData.append(
            "file",
            new File([data.chapters[i].body || ""], `${lang}/chapters/${i + 1}.md`, { type: "text/markdown" })
          );
        }
      }
    }

    // uploads
    const assetFileNames = await getAllUploadedFileNames(baseDir);
    dbg.log("StepUploadIPFS", "backend: storage uploads list", { baseDir, assetFileNames });

    for (const fileName of assetFileNames) {
      const file = await getUploadedFileAsFileObject(baseDir, fileName);
      if (file) {
        formData.append("file", file, `uploads/${fileName}`);
      } else {
        dbg.warn?.("StepUploadIPFS", "backend: missing file object", { baseDir, fileName });
      }
    }

    return await uploadWithProgress(`${httpBase()}store-dir`, formData, { baseDir, assetCount: assetFileNames.length });
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
        const cid = usePinners ? await uploadToPinningServices() : await uploadToBackend();
        dbg.log("StepUploadIPFS", "CID ready", { cid });
        props.onComplete?.({ ipfsCid: cid });
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
