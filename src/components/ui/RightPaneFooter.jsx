// src/components/ui/RightPaneFooter.jsx
import { useApp } from "../../context/AppContext.jsx";
import { APP_VERSION } from "../../version";

export default function RightPaneFooter() {
  const { t } = useApp();
  const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || "https://savva.app";

  return (
    <div class="mt-auto pt-3 border-t border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))]">
      <div class="flex items-center justify-between">
        <span>{t("app.versionLabel")} v{APP_VERSION}</span>
        <a
          href={WEBSITE_URL}
          target="_blank"
          rel="noreferrer"
          class="underline hover:opacity-80 text-[hsl(var(--foreground))]"
        >
          {t("app.website")}
        </a>
      </div>
      <div class="mt-1 opacity-80">{t("app.poweredBy")}</div>
    </div>
  );
}
