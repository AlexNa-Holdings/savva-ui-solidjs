// src/pages/Docs.jsx
import { createMemo } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { useHashRouter } from "../routing/hashRouter";
import DocsIndex from "../components/docs/DocsIndex.jsx";
import DocsContent from "../components/docs/DocsContent.jsx";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";

const trim = (s) => String(s || "").replace(/^\/+|\/+$/g, "");
const fileFromRoute = (route) => {
  if (!String(route || "").startsWith("/docs")) return "index.md";
  const rest = String(route).slice("/docs".length);
  return trim(rest) || "index.md";
};

export default function Docs() {
  const app = useApp();
  const { route, navigate } = useHashRouter();
  const file = createMemo(() => fileFromRoute(route()));
  const onPick = (rel) => navigate(`/docs/${trim(rel || "index.md")}`);
  const title = createMemo(() => app.t("docs.title"));

  return (
    <div class="sv-container sv-container--no-gutter">
      <div class="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6 px-[var(--sv-container-gutter)] py-6">
      <ClosePageButton />
        {/* Left sidebar */}
        <aside class="min-w-0">
          <div>
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold mb-2">{title()}</h2>
            </div>
            <DocsIndex active={file()} onPick={onPick} />
          </div>
        </aside>

        {/* Right content */}
        <main class="min-w-0">
          <DocsContent relPath={file()} onPick={onPick} />
        </main>
      </div>
    </div>
  );
}
