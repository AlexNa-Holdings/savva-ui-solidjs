// src/x/modals/StoreReadingKeyModal.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function StoreReadingKeyModal(props) {
  const app = useApp();
  const { t } = app;

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div class="bg-[hsl(var(--card))] rounded-lg max-w-md w-full p-6 space-y-4">
          <h3 class="text-xl font-semibold">{t("readingKey.store.title")}</h3>

          <div class="space-y-3 text-sm text-[hsl(var(--foreground))]">
            <p>{t("readingKey.store.description")}</p>

            <div class="bg-[hsl(var(--muted))] p-3 rounded space-y-2">
              <p class="font-medium text-[hsl(var(--primary))]">
                {t("readingKey.store.benefits.title")}
              </p>
              <ul class="list-disc list-inside space-y-1 text-[hsl(var(--muted-foreground))]">
                <li>{t("readingKey.store.benefits.decrypt")}</li>
                <li>{t("readingKey.store.benefits.oldMessages")}</li>
                <li>{t("readingKey.store.benefits.noWallet")}</li>
              </ul>
            </div>

            <div class="bg-[hsl(var(--muted))] border-2 border-[hsl(var(--destructive)/0.5)] p-3 rounded space-y-2">
              <p class="font-medium text-[hsl(var(--destructive))]">
                {t("readingKey.store.risks.title")}
              </p>
              <ul class="list-disc list-inside space-y-1 text-[hsl(var(--foreground)/0.85)] text-xs">
                <li>{t("readingKey.store.risks.browserAccess")}</li>
                <li>{t("readingKey.store.risks.sharedComputer")}</li>
                <li>{t("readingKey.store.risks.notWallet")}</li>
              </ul>
            </div>

            <p class="text-xs text-[hsl(var(--muted-foreground))] italic">
              {t("readingKey.store.note")}
            </p>
          </div>

          <div class="flex gap-3 justify-end pt-2">
            <button
              onClick={props.onClose}
              class="px-4 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
            >
              {t("readingKey.store.decline")}
            </button>
            <button
              onClick={props.onConfirm}
              class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              {t("readingKey.store.confirm")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
