// src/x/editor/EditorActionsRow.jsx
import { createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AiIcon from "../ui/icons/AiIcon.jsx";
import { getAiConfig } from "../../ai/storage.js";
import { pushToast } from "../../ui/toast.js";

export default function EditorActionsRow(props) {
  const app = useApp();
  const { t } = app;

  const aiCfg = createMemo(() => getAiConfig());
  const aiConfigured = createMemo(() => !!aiCfg()?.apiKey && !!aiCfg()?.providerId);
  const aiAuto = createMemo(() => !!aiCfg()?.auto);

  const isPending = () => !!props.aiPending;
  const isRunning = () => !!props.aiRunning;
  const p = () => props.aiProgress || { i: 0, total: 0, label: "" };

  const AiGlyphInside = (
    <AiIcon size={22} strokeWidth={2.25} class="mr-2 opacity-90 inline-block align-[-1px]" />
  );
  const AiGlyphButton = (
    <AiIcon size={28} strokeWidth={2.5} class="opacity-90 inline-block" />
  );

  function defaultAiRun() {
    pushToast({ type: "info", message: t("editor.ai.runningStub") });
  }

  const renderPreview = props.renderPreviewButton
    ? props.renderPreviewButton
    : ({ withAiIcon, AiIconEl }) => (
        <button
          type="button"
          onClick={props.onPreview ?? (() => {})}
          class="px-6 py-3 text-lg rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 flex items-center"
        >
          {withAiIcon && AiIconEl}
          {t("editor.preview")}
        </button>
      );

  return (
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        {props.deleteButton}
      </div>

      <div class="flex items-center gap-2">
        {aiConfigured() && !aiAuto() && (
          isRunning() ? (
            // Progress block (left of Preview)
            <div class="flex items-center gap-3 px-4 py-3 text-sm rounded-lg border border-[hsl(var(--border))]">
              <AiIcon size={22} strokeWidth={2.25} class="opacity-90" />
              <div class="flex items-center gap-2">
                <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-label={t("editor.ai.running")} />
                <span class="opacity-80">
                  {p().i + 1}/{p().total} — {p().label}
                </span>
              </div>
            </div>
          ) : isPending() ? (
            // Wrapped confirmation block with AI icon
            <div class="flex items-stretch rounded-lg border border-[hsl(var(--border))] overflow-hidden">
              <div class="px-4 py-3 flex items-center">
                {AiGlyphButton}
              </div>
              <button
                type="button"
                onClick={props.onAiUndo}
                class="px-5 py-3 text-lg border-l border-[hsl(var(--border))] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--muted))]"
              >
                {t("editor.ai.undo")}
              </button>
              <button
                type="button"
                onClick={props.onAiConfirm}
                class="px-5 py-3 text-lg border-l border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
              >
                {t("editor.ai.confirm")}
              </button>
            </div>
          ) : (
            // Icon-only AI button
            <button
              type="button"
              onClick={props.onAiRun ?? defaultAiRun}
              class="px-6 py-3 text-lg rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] flex items-center justify-center"
              title={t("editor.ai.assist")}
              aria-label={t("editor.ai.assist")}
            >
              {AiGlyphButton}
            </button>
          )
        )}

        {renderPreview({ withAiIcon: aiConfigured() && aiAuto(), AiIconEl: AiGlyphInside })}
      </div>
    </div>
  );
}
