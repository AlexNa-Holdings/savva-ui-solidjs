// src/components/editor/wizard_steps/StepValidate.jsx
import { createSignal, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";

export default function StepValidate(props) {
  const { t } = useApp();
  const [error, setError] = createSignal(null);
  const [isValidating, setIsValidating] = createSignal(true);

  const validate = () => {
    const data = props.postData();
    if (!data) {
      throw new Error("Post data is missing or not a function.");
    }

    for (const langCode in data) {
      const langData = data[langCode];
      
      const hasTitle = langData.title?.trim().length > 0;
      const hasBody = langData.body?.trim().length > 0;
      const hasChapters = langData.chapters?.some(c => c.body?.trim().length > 0);
      
      const hasAnyMeaningfulContent = hasTitle || hasBody || hasChapters;
      const isComplete = hasTitle && (hasBody || hasChapters);

      if (hasAnyMeaningfulContent && !isComplete) {
        throw new Error(t("editor.publish.validation.errorIncomplete", { lang: langCode }));
      }
    }
  };

  onMount(() => {
    setTimeout(() => {
      try {
        validate();
        props.onComplete?.();
      } catch (e) {
        setError(e.message);
      } finally {
        setIsValidating(false);
      }
    }, 500);
  });

  return (
    <div class="flex flex-col items-center justify-center h-full">
      <Show when={isValidating()}>
        <Spinner />
        <p class="mt-2 text-sm">{t("common.checking")}...</p>
      </Show>
      <Show when={error()}>
        <div class="text-center p-4">
          <h4 class="font-bold text-red-600">{t("editor.publish.validation.errorTitle")}</h4>
          <p class="mt-2 text-sm">{error()}</p>
          <button onClick={props.onCancel} class="mt-4 px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]">
            {t("editor.publish.validation.backToEditor")}
          </button>
        </div>
      </Show>
    </div>
  );
}