// src/x/editor/UploadFromUrlModal.jsx
import { createSignal, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function UploadFromUrlModal(props) {
  const { t } = useApp();
  const [url, setUrl] = createSignal("");
  const [isLoading, setIsLoading] = createSignal(false);

  const handleUpload = async () => {
    if (!url().trim()) return;
    setIsLoading(true);
    try {
      await props.onUpload?.(url());
      props.onClose?.();
    } catch (e) {
      // Error toast is handled by the parent
      console.error("Upload from URL failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" onClick={props.onClose} />
        <div class="relative themed-dialog rounded-lg shadow-lg w-full max-w-md p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
          <h3 class="text-lg font-semibold mb-3">{t("editor.files.uploadModalTitle")}</h3>
          <input
            type="text"
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
            class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
            placeholder={t("editor.files.uploadModalPlaceholder")}
          />
          <div class="flex gap-2 justify-end mt-4">
            <button
              class="px-3 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
              onClick={props.onClose}
            >
              {t("common.cancel")}
            </button>
            <button
              class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
              onClick={handleUpload}
              disabled={isLoading()}
            >
              {isLoading() ? t("editor.files.uploading") : t("editor.files.uploadModalConfirm")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
