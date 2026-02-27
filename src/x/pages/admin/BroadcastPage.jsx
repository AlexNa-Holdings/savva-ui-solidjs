// src/x/pages/admin/BroadcastPage.jsx
import { createSignal } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import { sendAdminCommand } from "../../../blockchain/adminCommands.js";
import { pushToast, pushErrorToast } from "../../../ui/toast.js";

const MAX_CHARS = 500;

export default function BroadcastPage() {
  const app = useApp();
  const { t } = app;

  const [message, setMessage] = createSignal("");
  const [sending, setSending] = createSignal(false);

  const charCount = () => message().length;
  const isOverLimit = () => charCount() > MAX_CHARS;
  const canSend = () => message().trim().length > 0 && !isOverLimit() && !sending();

  const handleSend = async () => {
    if (!canSend()) return;
    setSending(true);
    try {
      await sendAdminCommand(app, { cmd: "broadcast", p1: message().trim() });
      setMessage("");
      pushToast({ type: "success", message: t("admin.broadcast.sendSuccess"), autohideMs: 5000 });
    } catch (err) {
      pushErrorToast(err, { context: t("admin.broadcast.sendError") });
    } finally {
      setSending(false);
    }
  };

  return (
    <div class="p-4">
      <h3 class="text-xl font-semibold mb-2">{t("admin.broadcast.title")}</h3>
      <p class="text-sm text-[hsl(var(--muted-foreground))] mb-4">
        {t("admin.broadcast.description")}
      </p>

      <div class="space-y-3">
        <div>
          <label class="block text-sm mb-1 opacity-80">
            {t("admin.broadcast.messageLabel")}
          </label>
          <textarea
            class="w-full min-h-[120px] rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 outline-none resize-y"
            placeholder={t("admin.broadcast.placeholder")}
            value={message()}
            onInput={(e) => setMessage(e.currentTarget.value)}
            disabled={sending()}
          />
          <div class={`text-xs mt-1 ${isOverLimit() ? "text-[hsl(var(--destructive))]" : "text-[hsl(var(--muted-foreground))]"}`}>
            {charCount()} / {MAX_CHARS}
          </div>
        </div>

        <button
          type="button"
          class="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={handleSend}
          disabled={!canSend()}
        >
          {sending() ? t("common.working") : t("admin.broadcast.sendButton")}
        </button>
      </div>
    </div>
  );
}
