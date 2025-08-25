// src/components/editor/EditorToolbar.jsx
import { useApp } from "../../context/AppContext.jsx";
import { applyMarkdownFormat } from "./text-utils.js";
import { ToolbarButton, BoldIcon, ItalicIcon, LinkIcon, ImageIcon } from "./ToolbarIcons.jsx";

export default function EditorToolbar(props) {
  const { t } = useApp();

  const handleFormat = (format) => {
    const textarea = props.getTextareaRef?.();
    applyMarkdownFormat(textarea, format, props.onValueChange);
  };

  return (
    <div class="flex items-center justify-between h-10 px-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div class="flex items-center">
        <ToolbarButton onClick={() => handleFormat('bold')} title={t("editor.toolbar.bold")}>
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => handleFormat('italic')} title={t("editor.toolbar.italic")}>
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => handleFormat('link')} title={t("editor.toolbar.link")}>
          <LinkIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => handleFormat('image')} title={t("editor.toolbar.image")}>
          <ImageIcon />
        </ToolbarButton>
      </div>
      <div class="flex items-center gap-2">
        <button
          onClick={props.onTogglePreview}
          class="px-3 py-1 text-sm rounded-md hover:bg-[hsl(var(--accent))]"
        >
          {props.isPreview ? t("editor.toolbar.hidePreview") : t("editor.toolbar.showPreview")}
        </button>
      </div>
    </div>
  );
}
