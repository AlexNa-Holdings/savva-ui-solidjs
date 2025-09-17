// src/x/pages/AdminPage.jsx
import { createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter } from "../../routing/hashRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import AdminIndex from "./admin/AdminIndex.jsx";
import AdminContent from "./admin/AdminContent.jsx";

const trim = (s) => String(s || "").replace(/^\/+|\/+$/g, "");

const pageKeyFromRoute = (route) => {
  if (!String(route || "").startsWith("/admin")) return "domain-config";
  const rest = String(route).slice("/admin".length);
  return trim(rest) || "domain-config";
};

export default function AdminPage() {
  const app = useApp();
  const { route, navigate } = useHashRouter();
  const pageKey = createMemo(() => pageKeyFromRoute(route()));
  const onPick = (key) => navigate(`/admin/${trim(key || "domain-config")}`);
  const title = createMemo(() => app.t("admin.page.title"));

  return (
    <div class="sv-container sv-container--no-gutter">
      <div class="grid grid-cols-1 md:grid-cols-[140px_minmax(0,1fr)] gap-6 px-[var(--sv-container-gutter)] py-6">
      <ClosePageButton mode="close" />
        <aside class="min-w-0">
          <div>
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold mb-2">{title()}</h2>
            </div>
            <AdminIndex active={pageKey()} onPick={onPick} />
          </div>
        </aside>
        <main class="min-w-0">
          <AdminContent pageKey={pageKey()} />
        </main>
      </div>
    </div>
  );
}