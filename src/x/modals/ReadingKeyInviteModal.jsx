// src/x/modals/ReadingKeyInviteModal.jsx
import { Show, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Spinner from "../ui/Spinner.jsx";

export default function ReadingKeyInviteModal(props) {
  const app = useApp();
  const { t } = app;
  const [dontShowAgain, setDontShowAgain] = createSignal(false);
  const [isGenerating, setIsGenerating] = createSignal(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      if (dontShowAgain()) {
        localStorage.setItem("savva_reading_key_invite_dismissed", "true");
      }
      await props.onGenerate?.();
    } catch (error) {
      console.error("Failed to generate reading key:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNotNow = () => {
    if (dontShowAgain()) {
      localStorage.setItem("savva_reading_key_invite_dismissed", "true");
    }
    props.onClose?.();
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div class="relative w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-lg">
          {/* Icon */}
          <div class="flex justify-center mb-4">
            <div class="w-16 h-16 rounded-full bg-[hsl(var(--primary))]/10 flex items-center justify-center">
              <svg class="w-10 h-10 text-[hsl(var(--primary))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h3 class="text-xl font-bold text-center mb-3 text-[hsl(var(--foreground))]">
            {t("readingKey.invite.title") || "Unlock Exclusive Content"}
          </h3>

          {/* Message */}
          <div class="text-sm text-[hsl(var(--muted-foreground))] space-y-3 mb-6">
            <p>
              {t("readingKey.invite.message1") ||
                "SAVVA now allows creators to publish exclusive content for their supporters only. Want to access this premium content?"}
            </p>
            <p>
              {t("readingKey.invite.message2") ||
                "Generate your reading key now — it's quick, secure, and gives you access to all subscriber-only posts!"}
            </p>
          </div>

          {/* Checkbox */}
          <label class="flex items-center gap-2 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain()}
              onChange={(e) => setDontShowAgain(e.currentTarget.checked)}
              class="w-4 h-4 rounded border-[hsl(var(--input))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            <span class="text-sm text-[hsl(var(--muted-foreground))]">
              {t("readingKey.invite.dontShowAgain") || "Don't show this message again"}
            </span>
          </label>

          {/* Buttons */}
          <div class="flex flex-col gap-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating()}
              class="w-full px-4 py-3 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              <Show when={isGenerating()} fallback={t("readingKey.invite.generateButton") || "Generate Reading Key"}>
                <div class="flex items-center justify-center gap-2">
                  <Spinner class="w-5 h-5" />
                  <span>{t("readingKey.invite.generating") || "Generating..."}</span>
                </div>
              </Show>
            </button>

            <button
              onClick={handleNotNow}
              disabled={isGenerating()}
              class="w-full px-4 py-2 rounded-lg text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] transition-colors disabled:opacity-60"
            >
              {t("readingKey.invite.notNow") || "Not now"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
