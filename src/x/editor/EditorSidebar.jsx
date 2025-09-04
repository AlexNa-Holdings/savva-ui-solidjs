// src/x/editor/EditorSidebar.jsx
import { useApp } from "../../context/AppContext.jsx";
import LangSelector from "../ui/LangSelector.jsx";

export default function EditorSidebar(props) {
  const { t, domainAssetsConfig } = useApp();

  const domainLangCodes = () => {
    const fromDomain = (domainAssetsConfig?.()?.locales || []).map((l) => l.code).filter(Boolean);
    return fromDomain.length > 0 ? fromDomain : ["en"];
  };

  return (
    <aside class="sticky top-16 space-y-4">
      <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-4">
        <h3 class="text-sm font-semibold mb-2">{t("editor.sidebar.thumbnail")}</h3>
        <div class="aspect-video rounded bg-[hsl(var(--muted))] flex items-center justify-center">
          <span class="text-xs text-[hsl(var(--muted-foreground))]">{t("editor.sidebar.thumbnailPlaceholder")}</span>
        </div>
      </div>

      <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-4">
        <h3 class="text-sm font-semibold mb-2">{t("editor.sidebar.language")}</h3>
        <LangSelector
          codes={domainLangCodes()}
          value={props.lang}
          onChange={props.onLangChange}
          variant="stretch"
        />
      </div>

      <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-4">
        <h3 class="text-sm font-semibold mb-2">{t("editor.sidebar.files")}</h3>
        <div class="h-48 rounded bg-[hsl(var(--muted))] flex items-center justify-center">
          <span class="text-xs text-[hsl(var(--muted-foreground))]">{t("editor.sidebar.filesPlaceholder")}</span>
        </div>
      </div>
    </aside>
  );
}
