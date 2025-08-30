// src/components/editor/wizard_steps/StepUploadIPFS.jsx
import { createSignal, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";
import { getAllUploadedFileNames, getUploadedFileAsFileObject, DRAFT_DIRS } from "../../../editor/storage.js";
import { httpBase } from "../../../net/endpoints.js";
import { dbg } from "../../../utils/debug.js";

export default function StepUploadIPFS(props) {
  const app = useApp();
  const { t } = app;
  const [error, setError] = createSignal(null);
  const [isUploading, setIsUploading] = createSignal(true);
  const [uploadProgress, setUploadProgress] = createSignal(0);

  const uploadWithProgress = (url, formData) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error("Failed to parse server response."));
          }
        } else {
          if (xhr.status === 401) {
            app.handleAuthError?.();
            reject(new Error("Your session has expired. Please log in again."));
          } else if (xhr.status === 413) {
            reject(new Error(t("editor.publish.ipfs.errorTooLarge")));
          } else {
            reject(new Error(`Server responded with status ${xhr.status}: ${xhr.responseText}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error(t("editor.publish.ipfs.errorNetworkOrTooLarge")));
      };
      
      xhr.ontimeout = () => {
        reject(new Error("The upload request timed out."));
      };

      xhr.send(formData);
    });
  };

  const uploadToIPFS = async () => {
    dbg.log("StepUploadIPFS", "Starting IPFS folder upload process...");
    const { postData, editorMode } = props;
    
    const baseDir = (() => {
      if (editorMode === "new_post") return DRAFT_DIRS.NEW_POST;
      if (editorMode === "new_comment") return DRAFT_DIRS.NEW_COMMENT;
      if (["edit_post", "edit_comment"].includes(editorMode)) return DRAFT_DIRS.EDIT;
      return "unknown";
    })();

    const formData = new FormData();

    const content = postData();
    for (const lang in content) {
      const data = content[lang];
      const hasTitle = data.title?.trim().length > 0;
      const hasBody = data.body?.trim().length > 0;
      const hasChapters = data.chapters?.some(c => c.body?.trim().length > 0);

      if (!hasTitle && !hasBody && !hasChapters) {
        dbg.log("StepUploadIPFS", `Skipping empty language: ${lang}`);
        continue;
      }

      const dataPath = `${lang}/data.md`;
      const mdBodyFile = new File([data.body || ""], dataPath, { type: 'text/markdown' });
      formData.append('file', mdBodyFile, dataPath);

      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          const chapterContent = data.chapters[i];
          const chapterPath = `${lang}/chapters/${i + 1}.md`;
          const mdChapterFile = new File([chapterContent.body || ""], chapterPath, { type: 'text/markdown' });
          formData.append('file', mdChapterFile, chapterPath);
        }
      }
    }

    const assetFileNames = await getAllUploadedFileNames(baseDir);
    for (const fileName of assetFileNames) {
      const file = await getUploadedFileAsFileObject(baseDir, fileName);
      if (file) {
        formData.append('file', file, `uploads/${fileName}`);
      }
    }
    
    const url = `${httpBase()}store-dir`;
    const result = await uploadWithProgress(url, formData);

    if (!result?.cid) {
      throw new Error("API did not return a 'cid' for the uploaded directory.");
    }
    
    return result.cid;
  };

  onMount(() => {
    setTimeout(async () => {
      try {
        const cid = await uploadToIPFS();
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
        <p class="mt-2 text-sm">{t("editor.publish.uploadingToIpfs")}...</p>
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