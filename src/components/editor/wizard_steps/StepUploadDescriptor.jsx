// src/components/editor/wizard_steps/StepUploadDescriptor.jsx
import { createSignal, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";
import { stringify as toYaml } from "yaml";
import { httpBase } from "../../../net/endpoints.js";
import { dbg } from "../../../utils/debug.js";
import { createTextPreview } from "../../../editor/preview-utils.js";

export default function StepUploadDescriptor(props) {
  const app = useApp();
  const { t } = app;
  const [error, setError] = createSignal(null);
  const [isUploading, setIsUploading] = createSignal(true);

  const uploadDescriptor = async () => {
    const { postData, postParams, publishedData } = props;
    const data_cid = publishedData().ipfsCid;

    if (!data_cid) {
      throw new Error("IPFS data CID is missing from the previous step.");
    }

    const descriptor = {
      savva_spec_version: "2.0",
      data_cid: data_cid,
      locales: {}
    };

    const gateways = app.info()?.ipfs_gateways;
    if (gateways && Array.isArray(gateways) && gateways.length > 0) {
      descriptor.gateways = gateways;
    }

    const { thumbnail, locales: paramLocales, ...otherParams } = postParams();
    Object.assign(descriptor, otherParams);
    
    if (thumbnail) {
      descriptor.thumbnail = `${data_cid}/${thumbnail.replace(/uploads\//, '')}`;
    }

    const content = postData();
    for (const lang in content) {
      const data = content[lang];
      const hasTitle = data.title?.trim().length > 0;
      const hasBody = data.body?.trim().length > 0;
      const hasChapters = data.chapters?.some(c => c.body?.trim().length > 0);

      // Skip this language if it has no meaningful content
      if (!hasTitle && !hasBody && !hasChapters) {
        continue;
      }
      
      const langParams = paramLocales?.[lang] || {};
      
      const localeObject = {
        title: data.title || "",
        text_preview: createTextPreview(data.body || ""),
        tags: langParams.tags || [],
        categories: langParams.categories || [],
        data_path: `${lang}/data.md`,
        chapters: []
      };

      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          const chapterParams = langParams.chapters?.[i] || {};
          localeObject.chapters.push({
            title: chapterParams.title || `Chapter ${i + 1}`,
            data_path: `${lang}/chapters/${i + 1}.md`
          });
        }
      }
      
      descriptor.locales[lang] = localeObject;
    }
    
    dbg.log("StepUploadDescriptor", "Final descriptor object:", descriptor);

    const yamlStr = toYaml(descriptor);
    const descriptorFile = new File([yamlStr], "info.yaml", { type: 'application/x-yaml' });
    const formData = new FormData();
    formData.append('file', descriptorFile);

    const url = `${httpBase()}store`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Descriptor upload failed: ${response.status} ${errText}`);
    }

    const result = await response.json();
    if (!result?.cid) {
      throw new Error("API did not return a 'cid' for the uploaded descriptor.");
    }

    return result.cid;
  };

  onMount(() => {
    setTimeout(async () => {
      try {
        const descriptorCid = await uploadDescriptor();
        props.onComplete?.(descriptorCid);
      } catch (e) {
        dbg.error("StepUploadDescriptor", "An error occurred:", e);
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
        <p class="mt-2 text-sm">{t("editor.publish.uploadingDescriptor")}...</p>
      </Show>
      <Show when={error()}>
        <div class="text-center p-4">
          <h4 class="font-bold text-red-600">{t("editor.publish.descriptor.errorTitle")}</h4>
          <p class="mt-2 text-sm">{error()}</p>
          <button onClick={props.onCancel} class="mt-4 px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]">
            {t("editor.publish.validation.backToEditor")}
          </button>
        </div>
      </Show>
    </div>
  );
}