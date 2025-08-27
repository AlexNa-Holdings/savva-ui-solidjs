// src/components/editor/wizard_steps/StepUploadDescriptor.jsx
import { createSignal, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";
import { stringify as toYaml } from "yaml";
import { httpBase } from "../../../net/endpoints.js";
import { dbg } from "../../../utils/debug.js";

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
      data_cid: data_cid,
      locales: {}
    };

    const { thumbnail, locales: paramLocales, ...otherParams } = postParams();
    Object.assign(descriptor, otherParams);
    
    if (thumbnail) {
      descriptor.thumbnail = `${data_cid}/${thumbnail.replace(/uploads\//, '')}`;
    }

    const content = postData();
    for (const lang in content) {
      const data = content[lang];
      descriptor.locales[lang] = {
        title: data.title || "",
        text_preview: (data.body || "").substring(0, 200),
        tags: paramLocales?.[lang]?.tags || [],
        categories: paramLocales?.[lang]?.categories || []
      };
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