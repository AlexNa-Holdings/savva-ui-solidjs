// src/x/editor/AIAssistantDialog.jsx
import { createSignal, Show, For, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import AiIcon from "../ui/icons/AiIcon.jsx";
import { getAiConfig } from "../../ai/storage.js";

/**
 * AI Assistant Dialog - similar to Android implementation
 * Shows "Prepare for Publishing" and "Show Individual Options" buttons
 */
export default function AIAssistantDialog(props) {
  const app = useApp();
  const { t } = app;

  const [showOptions, setShowOptions] = createSignal(false);

  const aiCfg = createMemo(() => getAiConfig());
  const isConfigured = createMemo(() => !!aiCfg()?.apiKey && !!aiCfg()?.providerId);

  const isComment = createMemo(() => {
    const mode = props.editorMode?.();
    return mode === "new_comment" || mode === "edit_comment";
  });

  const hasMultipleLanguages = createMemo(() => {
    const langs = props.availableLanguages?.() || [];
    return langs.length > 1;
  });

  const hasContent = createMemo(() => {
    const body = props.currentBody?.() || "";
    return body.trim().length > 0;
  });

  const hasChapters = createMemo(() => {
    const chapters = props.chapters?.() || [];
    return chapters.length > 0 && chapters.some(ch => ch?.body?.trim());
  });

  function handleClose() {
    setShowOptions(false);
    props.onClose?.();
  }

  function handlePrepareForPublishing() {
    handleClose();
    props.onPrepareForPublishing?.();
  }

  function handleFixGrammar() {
    handleClose();
    props.onFixGrammar?.();
  }

  function handleImproveStyle() {
    handleClose();
    props.onImproveStyle?.();
  }

  function handleMakeShorter() {
    handleClose();
    props.onMakeShorter?.();
  }

  function handleSuggestTitle() {
    handleClose();
    props.onSuggestTitle?.();
  }

  function handleTranslateToAll() {
    handleClose();
    props.onTranslateToAll?.();
  }

  return (
    <Show when={props.isOpen}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-50 bg-black/50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          class="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-xl w-full max-w-md pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="flex items-center gap-3 p-4 border-b border-[hsl(var(--border))]">
            <AiIcon size={24} class="text-blue-400" />
            <h2 class="text-lg font-semibold">{t("editor.ai.dialog.title")}</h2>
            <button
              type="button"
              onClick={handleClose}
              class="ml-auto p-1 rounded hover:bg-[hsl(var(--muted))] transition-colors"
              aria-label={t("common.close")}
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <Show
            when={isConfigured()}
            fallback={
              <div class="p-4 space-y-4">
                <p class="text-[hsl(var(--muted-foreground))]">
                  {t("editor.ai.dialog.notConfigured")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    props.onOpenSettings?.();
                  }}
                  class="w-full px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-medium hover:opacity-90"
                >
                  {t("editor.ai.dialog.openSettings")}
                </button>
              </div>
            }
          >
            <div class="p-4 space-y-4">
              {/* Prepare for Publishing - Main Button */}
              <button
                type="button"
                onClick={handlePrepareForPublishing}
                disabled={!hasContent()}
                class="w-full px-4 py-3 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-200 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
              >
                <div class="font-medium mb-1">{t("editor.ai.dialog.prepareForPublishing")}</div>
                <div class="text-sm opacity-80">
                  <Show when={!isComment()}>
                    {t("editor.ai.dialog.prepareDescription")}
                  </Show>
                  <Show when={isComment()}>
                    {t("editor.ai.dialog.prepareDescriptionComment")}
                  </Show>
                </div>
              </button>

              {/* Show Individual Options Toggle */}
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions())}
                class="w-full px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition-colors flex items-center justify-between"
              >
                <span>{t("editor.ai.dialog.showOptions")}</span>
                <svg
                  class="w-4 h-4 transition-transform"
                  classList={{ "rotate-180": showOptions() }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Individual Options List */}
              <Show when={showOptions()}>
                <div class="space-y-2 pt-2 border-t border-[hsl(var(--border))]">
                  {/* Fix Grammar & Spelling */}
                  <button
                    type="button"
                    onClick={handleFixGrammar}
                    disabled={!hasContent()}
                    class="w-full px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                  >
                    <div class="font-medium">{t("editor.ai.dialog.fixGrammar")}</div>
                    <div class="text-sm text-[hsl(var(--muted-foreground))]">
                      {t("editor.ai.dialog.fixGrammarDesc")}
                    </div>
                  </button>

                  {/* Improve Writing Style */}
                  <button
                    type="button"
                    onClick={handleImproveStyle}
                    disabled={!hasContent()}
                    class="w-full px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                  >
                    <div class="font-medium">{t("editor.ai.dialog.improveStyle")}</div>
                    <div class="text-sm text-[hsl(var(--muted-foreground))]">
                      {t("editor.ai.dialog.improveStyleDesc")}
                    </div>
                  </button>

                  {/* Make Shorter */}
                  <button
                    type="button"
                    onClick={handleMakeShorter}
                    disabled={!hasContent()}
                    class="w-full px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                  >
                    <div class="font-medium">{t("editor.ai.dialog.makeShorter")}</div>
                    <div class="text-sm text-[hsl(var(--muted-foreground))]">
                      {t("editor.ai.dialog.makeShorterDesc")}
                    </div>
                  </button>

                  {/* Suggest Title - Posts only */}
                  <Show when={!isComment()}>
                    <button
                      type="button"
                      onClick={handleSuggestTitle}
                      disabled={!hasContent()}
                      class="w-full px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                    >
                      <div class="font-medium">{t("editor.ai.dialog.suggestTitle")}</div>
                      <div class="text-sm text-[hsl(var(--muted-foreground))]">
                        {t("editor.ai.dialog.suggestTitleDesc")}
                      </div>
                    </button>
                  </Show>

                  {/* Translate to All Languages - Only if multiple languages */}
                  <Show when={hasMultipleLanguages()}>
                    <button
                      type="button"
                      onClick={handleTranslateToAll}
                      disabled={!hasContent()}
                      class="w-full px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                    >
                      <div class="font-medium">{t("editor.ai.dialog.translateToAll")}</div>
                      <div class="text-sm text-[hsl(var(--muted-foreground))]">
                        {t("editor.ai.dialog.translateToAllDesc")}
                      </div>
                    </button>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
