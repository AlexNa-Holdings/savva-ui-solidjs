// src/x/editor/EditorTocButton.jsx
import { useApp } from "../../context/AppContext.jsx";

function TocIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export default function EditorTocButton(props) {
  const { t } = useApp();
  return (
    <button
      onClick={props.onClick}
      class="p-1.5 rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
      title={t("editor.chapters.add")}
    >
      <TocIcon class="w-5 h-5" />
    </button>
  );
}