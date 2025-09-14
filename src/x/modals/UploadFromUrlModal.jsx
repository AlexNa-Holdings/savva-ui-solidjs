// src/x/editor/UploadFromUrlModal.jsx
import { createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "../modals/Modal.jsx";

export default function UploadFromUrlModal(props) {
  const { t } = useApp();
  const [url, setUrl] = createSignal("");
  const [isLoading, setIsLoading] = createSignal(false);

  const handleUpload = async () => {
    const v = url().trim();
    if (!v) return;
    setIsLoading(true);
    try {
      await props.onUpload?.(v);
      props.onClose?.();
    } catch (e) {
      console.error("Upload from URL failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("editor.files.uploadModalTitle")}
      size="sm"
      footer={
        <div class="flex gap-2 justify-end">
          <button
            class="px-3 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
            onClick={props.onClose}
            disabled={isLoading()}
          >
            {t("common.cancel")}
          </button>
          <button
            class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
            onClick={handleUpload}
            disabled={isLoading() || !url().trim()}
          >
            {isLoading() ? t("editor.files.uploading") : t("editor.files.uploadModalConfirm")}
          </button>
        </div>
      }
    >
      <form
        class="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleUpload();
        }}
      >
        <input
          type="text"
          value={url()}
          onInput={(e) => setUrl(e.currentTarget.value)}
          class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
          placeholder={t("editor.files.uploadModalPlaceholder")}
          autocomplete="off"
          spellcheck={false}
        />
      </form>
    </Modal>
  );
}
