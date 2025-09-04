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

  const getFilesFromDraft = async () => {
    const { postData, editorMode } = props;
    const files = [];
    
    const baseDir = (() => {
      if (editorMode === "new_post") return DRAFT_DIRS.NEW_POST;
      if (editorMode === "new_comment") return DRAFT_DIRS.NEW_COMMENT;
      if (["edit_post", "edit_comment"].includes(editorMode)) return DRAFT_DIRS.EDIT;
      return "unknown";
    })();

    const content = postData();
    for (const lang in content) {
      const data = content[lang];
      const path = `${lang}/data.md`;
      files.push({ file: new File([data.body || ""], path, { type: 'text/markdown' }), path });

      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          const chapterPath = `${lang}/chapters/${i + 1}.md`;
          files.push({ file: new File([data.chapters[i].body || ""], chapterPath, { type: 'text/markdown' }), path: chapterPath });
        }
      }
    }

    const assetNames = await getAllUploadedFileNames(baseDir);
    for (const name of assetNames) {
      const file = await getUploadedFileAsFileObject(baseDir, name);
      if (file) {
        files.push({ file, path: `uploads/${name}` });
      }
    }
    return files;
  };

  const uploadToPinningServices = async () => {
    setUploadMessage(t("editor.publish.uploadingToPinServices"));
    const services = getPinningServices();
    if (services.length === 0) {
      throw new Error(t("editor.publish.ipfs.errorNoServices"));
    }

    const filesToUpload = await getFilesFromDraft();
    const progressMap = new Map(services.map(s => [s.id, 0]));

    const updateTotalProgress = () => {
      const sum = Array.from(progressMap.values()).reduce((a, b) => a + b, 0);
      setUploadProgress(Math.round(sum / services.length));
    };

    const cids = await Promise.all(services.map(async (service) => {
      try {
        const cid = await pinDirectory(service, filesToUpload, {
          onProgress: (p) => {
            progressMap.set(service.id, p);
            updateTotalProgress();
          }
        });

        // Verification
        const firstLangWithContent = Object.keys(props.postData())[0];
        const verificationPath = `${firstLangWithContent}/data.md`;
        const gatewayUrl = service.gatewayUrl.trim().replace(/\/+$/, "");
        const verifyUrl = `${gatewayUrl}/ipfs/${cid}/${verificationPath}`;
        
        // Add a delay before verifying
        await new Promise(resolve => setTimeout(resolve, 3000));
        await fetchWithTimeout(verifyUrl, { timeoutMs: 30000 });

        return cid;
      } catch (e) {
        throw new Error(`Failed on service '${service.name}': ${e.message}`);
      }
    }));
    
    const firstCid = cids[0];
    if (!cids.every(cid => cid === firstCid)) {
      throw new Error("Inconsistent CIDs returned from pinning services.");
    }
    
    return firstCid;
  };

  const uploadToBackend = async () => {
    const { postData, editorMode } = props;
    const baseDir = editorMode === "new_post" ? DRAFT_DIRS.NEW_POST : DRAFT_DIRS.EDIT;
    
    const formData = new FormData();
    const content = postData();
    // (This part remains the same as your existing implementation)
    for (const lang in content) {
      // ... same logic to append markdown files
    }
    const assetFileNames = await getAllUploadedFileNames(baseDir);
    for (const fileName of assetFileNames) {
      const file = await getUploadedFileAsFileObject(baseDir, fileName);
      if (file) formData.append('file', file, `uploads/${fileName}`);
    }
    
    return await uploadWithProgress(`${httpBase()}store-dir`, formData);
  };
  
  const uploadWithProgress = (url, formData) => {
    // (This remains the same as your existing implementation)
  };
  
  onMount(() => {
    setTimeout(async () => {
      try {
        const usePinners = isPinningEnabled();
        const cid = usePinners ? await uploadToPinningServices() : await uploadToBackend();
        props.onComplete?.(cid);
      } catch (e) {
        dbg.error("StepUploadIPFS", "An error occurred in the upload process:", e);
        setError(e.message);
      } finally {
        setIsUploading(false);
      }
    }, 500);
  });

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