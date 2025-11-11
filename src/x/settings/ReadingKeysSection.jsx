// src/x/settings/ReadingKeysSection.jsx
import { createSignal, Show, onMount } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { countStoredReadingKeys, deleteStoredReadingKeys } from "../crypto/readingKeyStorage.js";
import Spinner from "../ui/Spinner.jsx";
import { pushToast } from "../../ui/toast.js";

export default function ReadingKeysSection() {
  const app = useApp();
  const { t } = app;

  const [storedKeysCount, setStoredKeysCount] = createSignal(0);
  const [isDeleting, setIsDeleting] = createSignal(false);

  const userAddress = () => app.authorizedUser?.()?.address || "";

  // Load count on mount and when user changes
  const updateCount = () => {
    const addr = userAddress();
    if (addr) {
      const count = countStoredReadingKeys(addr);
      setStoredKeysCount(count);
    } else {
      setStoredKeysCount(0);
    }
  };

  onMount(updateCount);

  // Re-count when user changes
  const currentUser = () => app.authorizedUser?.();
  app.createEffect?.(() => {
    currentUser(); // Track dependency
    updateCount();
  });

  const handleDeleteAllKeys = async () => {
    const addr = userAddress();
    if (!addr) {
      pushToast({
        type: "error",
        message: t("settings.readingKeys.noUserError") || "No user connected",
      });
      return;
    }

    if (!confirm(t("settings.readingKeys.deleteConfirm") || "Are you sure you want to delete all stored reading keys? You will need to sign with your wallet again to decrypt encrypted posts.")) {
      return;
    }

    setIsDeleting(true);
    try {
      deleteStoredReadingKeys(addr);
      setStoredKeysCount(0);
      pushToast({
        type: "success",
        message: t("settings.readingKeys.deleteSuccess") || "All reading keys deleted successfully",
      });
    } catch (error) {
      console.error("Failed to delete reading keys:", error);
      pushToast({
        type: "error",
        message: t("settings.readingKeys.deleteError") || "Failed to delete reading keys",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section class="space-y-4 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <h3 class="text-lg font-semibold">{t("settings.readingKeys.title")}</h3>

      <div class="space-y-3">
        <p class="text-sm text-[hsl(var(--muted-foreground))]">
          {t("settings.readingKeys.description")}
        </p>

        <Show when={userAddress()}>
          <div class="flex items-center justify-between p-3 rounded bg-[hsl(var(--muted))]">
            <div>
              <p class="text-sm font-medium">
                {t("settings.readingKeys.keysStored")}: <span class="font-bold">{storedKeysCount()}</span>
              </p>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                {t("settings.readingKeys.storedInfo")}
              </p>
            </div>

            <Show when={storedKeysCount() > 0}>
              <button
                onClick={handleDeleteAllKeys}
                disabled={isDeleting()}
                class="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Show when={isDeleting()} fallback={t("settings.readingKeys.deleteButton")}>
                  <div class="flex items-center gap-2">
                    <Spinner class="w-4 h-4" />
                    <span>{t("settings.readingKeys.deleting")}</span>
                  </div>
                </Show>
              </button>
            </Show>
          </div>
        </Show>

        <Show when={!userAddress()}>
          <p class="text-sm text-[hsl(var(--muted-foreground))] italic">
            {t("settings.readingKeys.notConnected")}
          </p>
        </Show>
      </div>
    </section>
  );
}
