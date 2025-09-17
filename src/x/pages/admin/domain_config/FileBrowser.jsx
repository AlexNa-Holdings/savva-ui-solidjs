// src/x/pages/admin/domain_config/FileBrowser.jsx
import { For, Show } from "solid-js";
import { useApp } from "../../../../context/AppContext.jsx";
import { FileIcon, FolderIcon } from "../../../ui/icons/GeneralIcons.jsx";

export default function FileBrowser(props) {
  const app = useApp();
  const { t } = app;
  const selName = () => props.selectedFile?.name;

  const onClick = (item) => props.onSelectFile?.(item);
  const onDblClick = (item) => {
    if (item.type === "dir") props.onOpenDir?.(item);
  };

  return (
    <div class="border border-[hsl(var(--border))] rounded-md h-full overflow-auto">
      <div class="px-3 py-2 text-sm border-b border-[hsl(var(--border))] truncate">{props.currentPath || "/"}</div>

      <Show when={!props.loading} fallback={<div class="p-3 text-sm opacity-70">{t("common.loading")}</div>}>
        <Show when={(props.files || []).length} fallback={<div class="p-3 text-sm opacity-70">{props.emptyText}</div>}>
          <ul class="text-sm">
            <For each={props.files}>
              {(item) => {
                const isSel = () => selName() === item.name;
                return (
                  <li
                    class={`px-3 py-1.5 cursor-pointer select-none flex items-center gap-2 ${
                      isSel() ? "bg-[hsl(var(--accent))]" : "hover:bg-[hsl(var(--muted))]"
                    }`}
                    onClick={[onClick, item]}
                    onDblClick={[onDblClick, item]}
                    title={item.name}
                  >
                    {item.type === "dir" ? (
                      <FolderIcon class="w-4 h-4 opacity-70" aria-hidden="true" />
                    ) : (
                      <FileIcon class="w-4 h-4 opacity-70" aria-hidden="true" />
                    )}
                    <span class="truncate">{item.name}</span>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
