// src/x/editor/wizard_steps/StepValidate.jsx
import { createSignal, onMount, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import Spinner from "../../ui/Spinner.jsx";

export default function StepValidate(props) {
  const { t } = useApp();
  const [error, setError] = createSignal(null);
  const [isValidating, setIsValidating] = createSignal(true);

  const validate = () => {
    const { postData, editorMode } = props;
    const data = postData();
    if (!data) {
      throw new Error("Post data is missing or not a function.");
    }

    const isComment = editorMode === 'new_comment' || editorMode === 'edit_comment';

    for (const langCode in data) {
      const langData = data[langCode];

      const hasTitle = langData.title?.trim().length > 0;
      const hasBody = langData.body?.trim().length > 0;
      const hasChapters = langData.chapters?.some(c => c.body?.trim().length > 0);

      const hasAnyMeaningfulContent = hasTitle || hasBody || hasChapters;

      // Validate comment
      if (isComment) {
        if (!hasBody) {
          throw new Error(t("editor.publish.validation.errorCommentNoBody", { lang: langCode }));
        }
        continue;
      }

      // Validate post
      if (!hasAnyMeaningfulContent) {
        continue; // Empty language, skip
      }

      // Check if title is missing
      if (!hasTitle) {
        throw new Error(t("editor.publish.validation.errorNoTitle", { lang: langCode }));
      }

      // Check if there's neither body nor chapters
      if (!hasBody && !hasChapters) {
        throw new Error(t("editor.publish.validation.errorNoContent", { lang: langCode }));
      }

      // Validate chapters if they exist
      if (langData.chapters && langData.chapters.length > 0) {
        for (let i = 0; i < langData.chapters.length; i++) {
          const chapter = langData.chapters[i];
          const chapterNum = i + 1;

          const chapterHasTitle = chapter.title?.trim().length > 0;
          const chapterHasBody = chapter.body?.trim().length > 0;

          // If chapter has any content, it must be complete
          if (chapterHasTitle || chapterHasBody) {
            if (!chapterHasTitle) {
              throw new Error(t("editor.publish.validation.errorChapterNoTitle", {
                lang: langCode,
                chapter: chapterNum
              }));
            }
            if (!chapterHasBody) {
              throw new Error(t("editor.publish.validation.errorChapterNoContent", {
                lang: langCode,
                chapter: chapterNum,
                title: chapter.title
              }));
            }
          }
        }
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