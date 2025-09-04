// File: src/x/ui/RightPaneFooter.jsx
import { APP_VERSION } from "../version.js";
import { useApp } from "../context/AppContext.jsx";

export default function RightPaneFooter() {
  const app = useApp();
  const { t } = app;
  const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || "https://savva.app";

  return (
    <div class="mt-auto pt-3 border-t border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))]">
      <div class=" items-center justify-between">
        <div>{t("app.versionLabel")} <b>v{APP_VERSION}</b></div>
        <div>
          Powered by{" "}
          <b><a
            href={WEBSITE_URL}
            target="_blank"
            rel="noreferrer"
            class="underline hover:opacity-80 text-[hsl(var(--foreground))]"
          >
            SAVVA Platform
          </a>
          </b>
        </div>
      </div>
    </div>
  );
}
