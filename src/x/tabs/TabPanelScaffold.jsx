// src/x/tabs/TabPanelScaffold.jsx
import { useApp } from "../../context/AppContext";

/**
 * Minimal shared scaffold for tab content: title + body container.
 */
export default function TabPanelScaffold(props) {
  const { t } = useApp();
  return (
    <section class="space-y-2">
      <h3 class="text-base font-semibold text-[hsl(var(--foreground))]">
        {props.title || t("main.tabs.untitled")}
      </h3>
      <div class="text-sm text-[hsl(var(--muted-foreground))]">
        {props.children ?? t("main.tabs.empty")}
      </div>
    </section>
  );
}
