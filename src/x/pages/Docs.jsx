// src/pages/Docs.jsx
import { createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter } from "../../routing/hashRouter.js";
import DocsIndex from "../docs/DocsIndex.jsx";
import DocsContent from "../docs/DocsContent.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";

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
      <div class="px-[var(--sv-container-gutter)] py-6 space-y-6">
        <ClosePageButton mode="close" />

        <div class="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6 items-start">
          {/* Left sidebar */}
          <aside class="min-w-0 md:sticky md:top-24 md:self-start">
            <div class="flex items-center justify-between pb-2">
              <h2 class="text-sm font-semibold">{title()}</h2>
            </div>
            <div class="md:max-h-[calc(100vh-10rem)] md:overflow-y-auto md:pr-1">
              <DocsIndex active={file()} onPick={onPick} />
            </div>
          </aside>

          {/* Right content */}
          <main class="min-w-0">
            <DocsContent relPath={file()} onPick={onPick} />
          </main>
        </div>
      </div>
    </div>
  );
}
