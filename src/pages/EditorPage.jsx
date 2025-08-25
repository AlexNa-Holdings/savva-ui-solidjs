// src/pages/EditorPage.jsx
import { createMemo } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";
import { useHashRouter } from "../routing/hashRouter.js";

export default function EditorPage() {
  const { t } = useApp();
  const { route } = useHashRouter();

  const editorMode = createMemo(() => {
    const path = route();
    if (path.startsWith("/editor/new")) return "new_post";
    if (path.startsWith("/editor/edit/")) return "edit_post";
    if (path.startsWith("/editor/comment/")) return "comment";
    return "unknown";
  });

  const title = createMemo(() => {
    switch (editorMode()) {
      case "new_post":
        return t("editor.titleNewPost");
      case "edit_post":
        return t("editor.titleEditPost");
      case "comment":
        return t("editor.titleComment");
      default:
        return t("editor.title");
    }
  });

  return (
    <main class="p-4 max-w-4xl mx-auto">
      <ClosePageButton />
      <h2 class="text-2xl font-semibold mb-4">{title()}</h2>
      <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <p>{t("editor.placeholder")}</p>
        <p class="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
          Editor Mode: <strong>{editorMode()}</strong>
        </p>
      </div>
    </main>
  );
}
