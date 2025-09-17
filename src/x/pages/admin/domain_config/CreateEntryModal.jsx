// src/x/pages/admin/domain_config/CreateEntryModal.jsx
import { createSignal, Show } from "solid-js";
import { useApp } from "../../../../context/AppContext.jsx";

export default function CreateEntryModal(props) {
  const app = useApp();
  const { t } = app;
  const [name, setName] = createSignal("");
  const [isFolder, setIsFolder] = createSignal(false);

  const close = () => { setName(""); setIsFolder(false); props.onClose?.(); };
  const submit = () => {
    const n = name().trim().replace(/^\/+|\/+$/g, "");
    if (!n || n === "." || n === "..") return;
    props.onCreate?.({ name: n, isFolder: !!isFolder() });
    close();
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center">
        <div class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] w-[28rem] max-w-[92vw] rounded-lg shadow-lg border border-[hsl(var(--border))]">
          <div class="px-4 py-3 border-b border-[hsl(var(--border))] font-semibold">
            {t("admin.domainConfig.create.title")}
          </div>
          <div class="p-4 space-y-3">
            <label class="block text-sm">
              <span class="block mb-1">{t("admin.domainConfig.create.nameLabel")}</span>
              <input
                class="w-full px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder={t("admin.domainConfig.create.namePlaceholder")}
              />
            </label>
            <label class="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isFolder()} onInput={(e) => setIsFolder(e.currentTarget.checked)} />
              <span>{t("admin.domainConfig.create.folderLabel")}</span>
            </label>
          </div>
          <div class="px-4 py-3 border-t border-[hsl(var(--border))] flex justify-end gap-2">
            <button class="px-3 py-2 rounded-md border border-[hsl(var(--border))]" onClick={close}>
              {t("common.cancel")}
            </button>
            <button
              class="px-3 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--accent))]"
              onClick={submit}
              disabled={!name().trim()}
            >
              {t("admin.domainConfig.create.createBtn")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
