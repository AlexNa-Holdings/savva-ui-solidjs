// src/x/pages/admin/AdminIndex.jsx
import { For } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";

const ADMIN_PAGES = [
  {
    key: "domain-config",
    titleKey: "admin.domainConfig.navTitle",
  },
];

export default function AdminIndex(props) {
  const app = useApp();
  const { t } = app;

  return (
    <div class="py-2">
      <div class="mb-2">
        <div class="px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {t("admin.page.section.domain")}
        </div>
        <ul class="space-y-1 p-2">
          <For each={ADMIN_PAGES}>
            {(page) => {
              const active = () => props.active === page.key;
              return (
                <li>
                  <button
                    class={`w-full text-left px-3 py-2 text-sm rounded ${
                      active() ? "bg-[hsl(var(--accent))]" : "hover:bg-[hsl(var(--accent))]"
                    }`}
                    onClick={() => props.onPick?.(page.key)}
                    type="button"
                  >
                    {t(page.titleKey)}
                  </button>
                </li>
              );
            }}
          </For>
        </ul>
      </div>
    </div>
  );
}